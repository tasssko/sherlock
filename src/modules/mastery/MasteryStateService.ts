import { MasteryState } from "../../domain/learning/MasteryState.js";
import type { LearnerEvidence } from "../../domain/learning/LearnerEvidence.js";
import { MasteryProfile } from "../../domain/learning/LearningLoop.js";
import type { LearningLoop } from "../../domain/learning/LearningLoop.js";
import type { QuestionSeed } from "../../domain/learning/QuestionBank.js";

function contribution(input: {
  confidence?: "high" | "medium" | "low";
  correctness: "correct" | "incorrect";
  supportUsed: "independent" | "guided" | "hinted";
}): number {
  const baseBySupport = {
    independent: input.correctness === "correct" ? 1 : 0.1,
    hinted: input.correctness === "correct" ? 0.7 : 0.08,
    guided: input.correctness === "correct" ? 0.55 : 0.05
  } as const;

  let next = baseBySupport[input.supportUsed];
  if (input.correctness === "correct") {
    if (input.confidence === "high") {
      next += 0.05;
    } else if (input.confidence === "low") {
      next -= 0.05;
    }
  } else if (input.confidence === "high") {
    next -= 0.05;
  }

  return Math.max(0, Math.min(1, next));
}

function recencyWeights(count: number): readonly number[] {
  return Array.from({ length: count }, (_, index) => {
    if (index === 0) {
      return 1;
    }

    return Math.max(0.35, 1 - index * 0.2);
  });
}

function masteryStatusForScore(score: number): "weak" | "developing" | "secure" {
  if (score >= 0.85) {
    return "secure";
  }

  if (score >= 0.45) {
    return "developing";
  }

  return "weak";
}

function nextReviewAt(lastReviewedAt: string, status: "weak" | "developing" | "secure"): string {
  const base = new Date(lastReviewedAt).getTime();
  const offsetHours =
    status === "secure" ? 24 * 7 : status === "developing" ? 24 * 2 : 12;
  return new Date(base + offsetHours * 60 * 60 * 1000).toISOString();
}

function latestTimestamp(values: readonly string[]): string | undefined {
  return [...values].sort().at(-1);
}

export interface MasteryStateUpdateResult {
  masteryStates: readonly MasteryState[];
  masteryProfile?: MasteryProfile;
}

export class MasteryStateService {
  update(input: {
    existingStates: readonly MasteryState[];
    learningLoop: LearningLoop;
    newEvidence: readonly LearnerEvidence[];
    questionSeeds: readonly QuestionSeed[];
    existingProfile?: MasteryProfile;
  }): MasteryStateUpdateResult {
    if (input.newEvidence.length === 0) {
      return {
        masteryStates: input.existingStates,
        masteryProfile: input.existingProfile
      };
    }

    const learningLoop = input.learningLoop;
    const learningLoopId = learningLoop.id;
    const seedById = new Map(input.questionSeeds.map((seed) => [seed.id, seed]));
    const evidenceBySeed = new Map<string, LearnerEvidence[]>();
    const evidenceByTopic = new Map<string, LearnerEvidence[]>();

    for (const evidence of input.newEvidence) {
      const snapshot = evidence.toSnapshot();
      const seed = seedById.get(snapshot.seedId);
      if (!seed) {
        continue;
      }

      const seedBucket = evidenceBySeed.get(snapshot.seedId) ?? [];
      seedBucket.push(evidence);
      evidenceBySeed.set(snapshot.seedId, seedBucket);

      const topic = learningLoop.topic;
      const topicBucket = evidenceByTopic.get(topic) ?? [];
      topicBucket.push(evidence);
      evidenceByTopic.set(topic, topicBucket);
    }

    const nextStates = [...input.existingStates];
    const replaceState = (match: (candidate: MasteryState) => boolean, next: MasteryState) => {
      const index = nextStates.findIndex(match);
      if (index >= 0) {
        nextStates[index] = next;
      } else {
        nextStates.push(next);
      }
    };

    for (const [seedId, evidenceList] of evidenceBySeed.entries()) {
      const seed = seedById.get(seedId as never);
      if (!seed) {
        continue;
      }

      const existing = nextStates.find(
        (candidate) =>
          candidate.learningLoopId === learningLoopId && candidate.seedId === seed.id
      );
      const next = this.buildState({
        evidenceList,
        existing,
        learningLoop,
        seed,
        topic: seed.toSnapshot().topic
      });
      replaceState(
        (candidate) => candidate.learningLoopId === learningLoopId && candidate.seedId === seed.id,
        next
      );
    }

    for (const [topic, evidenceList] of evidenceByTopic.entries()) {
      const existing = nextStates.find(
        (candidate) =>
          candidate.learningLoopId === learningLoopId &&
          candidate.topic === topic &&
          candidate.seedId === undefined
      );
      const next = this.buildState({
        evidenceList,
        existing,
        learningLoop,
        topic
      });
      replaceState(
        (candidate) =>
          candidate.learningLoopId === learningLoopId &&
          candidate.topic === topic &&
          candidate.seedId === undefined,
        next
      );
    }

    const topicStates = nextStates.filter(
      (candidate) =>
        candidate.learningLoopId === learningLoopId && candidate.seedId === undefined
    );
    const masteryProfile = topicStates.length
      ? projectMasteryProfile({
          existingProfile: input.existingProfile,
          learningLoop,
          topicStates
        })
      : input.existingProfile;

    return {
      masteryStates: nextStates,
      masteryProfile
    };
  }

  private buildState(input: {
    evidenceList: readonly LearnerEvidence[];
    existing?: MasteryState;
    learningLoop: LearningLoop;
    seed?: QuestionSeed;
    topic: string;
  }): MasteryState {
    const sortedEvidence = [...input.evidenceList]
      .map((evidence) => evidence.toSnapshot())
      .sort((left, right) => right.capturedAt.localeCompare(left.capturedAt))
      .slice(0, 5);
    const weights = recencyWeights(sortedEvidence.length);

    const weighted = sortedEvidence.reduce(
      (total, evidence, index) =>
        total + contribution(evidence) * (weights[index] ?? 1),
      0
    );
    const weightTotal = weights.reduce((total, value) => total + value, 0) || 1;
    const newEvidenceScore = weighted / weightTotal;
    const priorScore = input.existing?.toSnapshot().score ?? 0.5;
    const score = Math.max(0, Math.min(1, priorScore * 0.35 + newEvidenceScore * 0.65));
    const status = masteryStatusForScore(score);
    const lastReviewedAt = latestTimestamp(sortedEvidence.map((evidence) => evidence.capturedAt));
    const scheduleAt = lastReviewedAt ? nextReviewAt(lastReviewedAt, status) : undefined;

    if (input.existing) {
      return input.existing.record({
        lastReviewedAt,
        nextReviewAt: scheduleAt,
        score,
        status
      });
    }

    return MasteryState.create({
      learningLoopId: input.learningLoop.id,
      topic: input.topic,
      seedId: input.seed?.id,
      status,
      score,
      lastReviewedAt,
      nextReviewAt: scheduleAt
    });
  }
}

export function projectMasteryProfile(input: {
  existingProfile?: MasteryProfile;
  learningLoop: LearningLoop;
  topicStates: readonly MasteryState[];
}): MasteryProfile {
  const id =
    input.existingProfile?.toSnapshot().id ??
    MasteryProfile.create(input.learningLoop.id).toSnapshot().id;
  const updatedAt =
    latestTimestamp(input.topicStates.map((state) => state.toSnapshot().updatedAt)) ??
    new Date().toISOString();

  return MasteryProfile.rehydrate({
    id,
    learningLoopId: input.learningLoop.id,
    updatedAt,
    topics: input.topicStates.map((state) => {
      const snapshot = state.toSnapshot();
      return {
        topic: snapshot.topic,
        score: snapshot.score,
        status: snapshot.status === "weak" ? "developing" : snapshot.status
      };
    })
  });
}
