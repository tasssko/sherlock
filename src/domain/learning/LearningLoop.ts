import type { ArtifactId, WorkPlanId } from "../primitives/ids.js";
import type {
  AssessmentId,
  AttemptId,
  EvaluationId,
  KnowledgeGapId,
  LearningLoopId,
  MasterDataSourceId,
  MasteryProfileId,
  WorkspaceId
} from "../primitives/ids.js";
import {
  createKnowledgeGapId,
  createLearningLoopId,
  createMasteryProfileId
} from "../primitives/ids.js";
import type { DomainEventRecorder } from "../primitives/Event.js";

export type LearningLoopPhase =
  | "initial-assessment"
  | "diagnosis"
  | "study-planning"
  | "practice"
  | "reassessment"
  | "mastery-tracking";

export interface LearningLoopSnapshot {
  id: LearningLoopId;
  workspaceId: WorkspaceId;
  objective: string;
  topic: string;
  phase: LearningLoopPhase;
  assessmentIds: readonly AssessmentId[];
  attemptIds: readonly AttemptId[];
  evaluationIds: readonly EvaluationId[];
  knowledgeGapIds: readonly KnowledgeGapId[];
  workPlanIds: readonly WorkPlanId[];
  artifactIds: readonly ArtifactId[];
  masteryProfileId?: MasteryProfileId;
  sourceIds: readonly MasterDataSourceId[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateLearningLoopInput {
  workspaceId: WorkspaceId;
  objective: string;
  topic: string;
  sourceIds?: readonly MasterDataSourceId[];
}

export class LearningLoop {
  private constructor(private readonly snapshot: LearningLoopSnapshot) {}

  static create(input: CreateLearningLoopInput, events: DomainEventRecorder): LearningLoop {
    events.assertWorkspace(input.workspaceId);
    const loop = new LearningLoop({
      id: createLearningLoopId(),
      workspaceId: input.workspaceId,
      objective: input.objective,
      topic: input.topic,
      phase: "initial-assessment",
      assessmentIds: [],
      attemptIds: [],
      evaluationIds: [],
      knowledgeGapIds: [],
      workPlanIds: [],
      artifactIds: [],
      sourceIds: [...(input.sourceIds ?? [])],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    events.recordLearningLoopCreated(loop.id, loop.phase, loop.topic);

    return loop;
  }

  static rehydrate(snapshot: LearningLoopSnapshot): LearningLoop {
    return new LearningLoop({
      ...snapshot,
      assessmentIds: [...snapshot.assessmentIds],
      attemptIds: [...snapshot.attemptIds],
      evaluationIds: [...snapshot.evaluationIds],
      knowledgeGapIds: [...snapshot.knowledgeGapIds],
      workPlanIds: [...snapshot.workPlanIds],
      artifactIds: [...snapshot.artifactIds],
      sourceIds: [...snapshot.sourceIds]
    });
  }

  get id(): LearningLoopId {
    return this.snapshot.id;
  }

  get workspaceId(): WorkspaceId {
    return this.snapshot.workspaceId;
  }

  get objective(): string {
    return this.snapshot.objective;
  }

  get topic(): string {
    return this.snapshot.topic;
  }

  get phase(): LearningLoopPhase {
    return this.snapshot.phase;
  }

  get knowledgeGapIds(): readonly KnowledgeGapId[] {
    return this.snapshot.knowledgeGapIds;
  }

  get evaluationIds(): readonly EvaluationId[] {
    return this.snapshot.evaluationIds;
  }

  attachAssessment(assessmentId: AssessmentId, events: DomainEventRecorder): LearningLoop {
    return this.withLinkedId("assessmentIds", assessmentId, "diagnosis", () =>
      events.recordLearningLoopAssessmentAttached(this.snapshot.id, assessmentId)
    );
  }

  recordAttempt(attemptId: AttemptId, events: DomainEventRecorder): LearningLoop {
    return this.withLinkedId("attemptIds", attemptId, "diagnosis", () =>
      events.recordLearningLoopAttemptRecorded(this.snapshot.id, attemptId)
    );
  }

  recordEvaluation(evaluationId: EvaluationId, events: DomainEventRecorder): LearningLoop {
    return this.withLinkedId("evaluationIds", evaluationId, "study-planning", () =>
      events.recordLearningLoopEvaluationRecorded(this.snapshot.id, evaluationId)
    );
  }

  recordKnowledgeGap(gapId: KnowledgeGapId, events: DomainEventRecorder): LearningLoop {
    return this.withLinkedId("knowledgeGapIds", gapId, "study-planning", () =>
      events.recordLearningLoopKnowledgeGapRecorded(this.snapshot.id, gapId)
    );
  }

  attachWorkPlan(workPlanId: WorkPlanId, events: DomainEventRecorder): LearningLoop {
    return this.withLinkedId("workPlanIds", workPlanId, "practice", () =>
      events.recordLearningLoopWorkPlanAttached(this.snapshot.id, workPlanId)
    );
  }

  attachArtifact(artifactId: ArtifactId, events: DomainEventRecorder): LearningLoop {
    return this.withLinkedId("artifactIds", artifactId, this.snapshot.phase, () =>
      events.recordLearningLoopArtifactAttached(this.snapshot.id, artifactId)
    );
  }

  attachMasteryProfile(profileId: MasteryProfileId, events: DomainEventRecorder): LearningLoop {
    events.assertWorkspace(this.snapshot.workspaceId);
    const next = new LearningLoop({
      ...this.snapshot,
      masteryProfileId: profileId,
      phase: "mastery-tracking",
      updatedAt: new Date().toISOString()
    });

    events.recordLearningLoopMasteryProfileUpdated(this.snapshot.id, profileId);
    return next;
  }

  toSnapshot(): LearningLoopSnapshot {
    return {
      ...this.snapshot,
      assessmentIds: [...this.snapshot.assessmentIds],
      attemptIds: [...this.snapshot.attemptIds],
      evaluationIds: [...this.snapshot.evaluationIds],
      knowledgeGapIds: [...this.snapshot.knowledgeGapIds],
      workPlanIds: [...this.snapshot.workPlanIds],
      artifactIds: [...this.snapshot.artifactIds],
      sourceIds: [...this.snapshot.sourceIds]
    };
  }

  private withLinkedId<TKey extends "artifactIds" | "assessmentIds" | "attemptIds" | "evaluationIds" | "knowledgeGapIds" | "workPlanIds">(
    key: TKey,
    value: LearningLoopSnapshot[TKey][number],
    phase: LearningLoopPhase,
    onRecord: () => void
  ): LearningLoop {
    if (this.snapshot[key].includes(value as never)) {
      return this;
    }

    const next = new LearningLoop({
      ...this.snapshot,
      [key]: [...this.snapshot[key], value],
      phase,
      updatedAt: new Date().toISOString()
    });

    onRecord();
    return next;
  }
}

export type KnowledgeGapSeverity = "high" | "medium" | "low";

export interface KnowledgeGapSnapshot {
  id: KnowledgeGapId;
  learningLoopId: LearningLoopId;
  topic: string;
  description: string;
  evidence: string;
  severity: KnowledgeGapSeverity;
  createdAt: string;
}

export class KnowledgeGap {
  private constructor(private readonly snapshot: KnowledgeGapSnapshot) {}

  static create(input: {
    learningLoopId: LearningLoopId;
    topic: string;
    description: string;
    evidence: string;
    severity: KnowledgeGapSeverity;
  }): KnowledgeGap {
    return new KnowledgeGap({
      id: createKnowledgeGapId(),
      learningLoopId: input.learningLoopId,
      topic: input.topic,
      description: input.description,
      evidence: input.evidence,
      severity: input.severity,
      createdAt: new Date().toISOString()
    });
  }

  static rehydrate(snapshot: KnowledgeGapSnapshot): KnowledgeGap {
    return new KnowledgeGap({ ...snapshot });
  }

  get id(): KnowledgeGapId {
    return this.snapshot.id;
  }

  get topic(): string {
    return this.snapshot.topic;
  }

  toSnapshot(): KnowledgeGapSnapshot {
    return { ...this.snapshot };
  }
}

export type MasteryStatus = "developing" | "secure";

export interface TopicMasterySnapshot {
  topic: string;
  score: number;
  status: MasteryStatus;
}

export interface MasteryProfileSnapshot {
  id: MasteryProfileId;
  learningLoopId: LearningLoopId;
  topics: readonly TopicMasterySnapshot[];
  updatedAt: string;
}

export class MasteryProfile {
  private constructor(private readonly snapshot: MasteryProfileSnapshot) {}

  static create(learningLoopId: LearningLoopId): MasteryProfile {
    return new MasteryProfile({
      id: createMasteryProfileId(),
      learningLoopId,
      topics: [],
      updatedAt: new Date().toISOString()
    });
  }

  static rehydrate(snapshot: MasteryProfileSnapshot): MasteryProfile {
    return new MasteryProfile({
      ...snapshot,
      topics: snapshot.topics.map((topic) => ({ ...topic }))
    });
  }

  get id(): MasteryProfileId {
    return this.snapshot.id;
  }

  recordTopicScore(topic: string, score: number): MasteryProfile {
    const nextTopics = this.snapshot.topics.filter((entry) => entry.topic !== topic);
    nextTopics.push({
      topic,
      score,
      status: score >= 0.8 ? "secure" : "developing"
    });

    return new MasteryProfile({
      ...this.snapshot,
      topics: nextTopics,
      updatedAt: new Date().toISOString()
    });
  }

  toSnapshot(): MasteryProfileSnapshot {
    return {
      ...this.snapshot,
      topics: this.snapshot.topics.map((topic) => ({ ...topic }))
    };
  }
}
