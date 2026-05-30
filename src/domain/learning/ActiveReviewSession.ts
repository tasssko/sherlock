import type {
  ActiveReviewSessionId,
  KnowledgeGapId,
  LearningLoopId,
  MasterDataItemId,
  PracticeActivityId,
  WorkspaceId
} from "../primitives/ids.js";
import { createActiveReviewSessionId } from "../primitives/ids.js";
import { err, ok, type Result } from "../primitives/result.js";
import type {
  PracticeItem,
  PracticeItemResponse,
  PracticeActivityKind,
  ReviewConfidence
} from "./PracticeActivity.js";

export type ReviewEaseSignal = "hard" | "steady" | "easy";

export interface ActiveReviewItemResult {
  practiceItemId: string;
  prompt: string;
  responseText: string;
  expectedAnswer: string;
  topic: string;
  confidence: ReviewConfidence;
  correct: boolean;
  overconfidence: boolean;
  sourceMasterDataItemId: MasterDataItemId;
  sourceVisibleSentence: string;
  knowledgeGapId: KnowledgeGapId;
  note?: string;
}

export interface ReviewSchedulingInput {
  completedAt: string;
  existingSessionCount: number;
  itemResults: readonly ActiveReviewItemResult[];
}

export interface ReviewSchedule {
  easeSignal: ReviewEaseSignal;
  nextReviewAt: string;
  reviewIntervalHours: number;
}

export interface ReviewScheduler {
  schedule(input: ReviewSchedulingInput): ReviewSchedule;
}

export interface ActiveReviewSessionSnapshot {
  id: ActiveReviewSessionId;
  workspaceId: WorkspaceId;
  learningLoopId: LearningLoopId;
  practiceActivityId: PracticeActivityId;
  kind: PracticeActivityKind;
  completedAt: string;
  itemResults: readonly ActiveReviewItemResult[];
  masteryScore: number;
  confidenceScore: number;
  remainingKnowledgeGapIds: readonly KnowledgeGapId[];
  reviewIntervalHours: number;
  nextReviewAt: string;
  easeSignal: ReviewEaseSignal;
  evidenceSummary: string;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function confidenceValue(confidence: ReviewConfidence): number {
  if (confidence === "high") {
    return 1;
  }

  if (confidence === "medium") {
    return 0.6;
  }

  return 0.2;
}

export class ActiveReviewSession {
  private constructor(private readonly snapshot: ActiveReviewSessionSnapshot) {}

  static createFromPracticeResponses(input: {
    allowedKnowledgeGapIds: readonly KnowledgeGapId[];
    allowedSourceMasterDataItemIds: readonly MasterDataItemId[];
    existingSessionCount: number;
    kind: PracticeActivityKind;
    learningLoopId: LearningLoopId;
    practiceItems: readonly PracticeItem[];
    practiceActivityId: PracticeActivityId;
    responses: readonly PracticeItemResponse[];
    reviewScheduler: ReviewScheduler;
    workspaceId: WorkspaceId;
  }): Result<ActiveReviewSession> {
    if (input.responses.length === 0) {
      return err({
        code: "VALIDATION_ERROR",
        message: "Active review requires at least one learner response."
      });
    }

    if (input.responses.length !== input.practiceItems.length) {
      return err({
        code: "VALIDATION_ERROR",
        message: "Active review completion requires evidence for every practice item."
      });
    }

    const allowedKnowledgeGapIds = new Set(input.allowedKnowledgeGapIds);
    const allowedSourceMasterDataItemIds = new Set(input.allowedSourceMasterDataItemIds);
    const practiceItemsById = new Map(input.practiceItems.map((item) => [item.id, item]));
    const seenPracticeItemIds = new Set<string>();
    const itemResults: ActiveReviewItemResult[] = [];

    for (const response of input.responses) {
      const practiceItem = practiceItemsById.get(response.practiceItemId);
      if (!practiceItem) {
        return err({
          code: "VALIDATION_ERROR",
          message: `Active review references unknown practice item ${response.practiceItemId}.`
        });
      }

      if (seenPracticeItemIds.has(response.practiceItemId)) {
        return err({
          code: "VALIDATION_ERROR",
          message: `Active review duplicates evidence for practice item ${response.practiceItemId}.`
        });
      }
      seenPracticeItemIds.add(response.practiceItemId);

      if (!allowedKnowledgeGapIds.has(practiceItem.knowledgeGapId)) {
        return err({
          code: "VALIDATION_ERROR",
          message: `Active review evidence cannot reference knowledge gap ${practiceItem.knowledgeGapId} outside the learning loop.`
        });
      }

      if (!allowedSourceMasterDataItemIds.has(practiceItem.sourceMasterDataItemId)) {
        return err({
          code: "VALIDATION_ERROR",
          message: `Active review evidence cannot reference source ${practiceItem.sourceMasterDataItemId} outside the practice activity.`
        });
      }

      const correct = normalize(response.responseText) === normalize(practiceItem.expectedResponse);
      const overconfidence = !correct && response.confidence === "high";
      itemResults.push({
        practiceItemId: response.practiceItemId,
        prompt: practiceItem.prompt,
        responseText: response.responseText,
        expectedAnswer: practiceItem.expectedResponse,
        topic: practiceItem.topic,
        confidence: response.confidence,
        correct,
        overconfidence,
        sourceMasterDataItemId: practiceItem.sourceMasterDataItemId,
        sourceVisibleSentence: practiceItem.sourceVisibleSentence,
        knowledgeGapId: practiceItem.knowledgeGapId,
        note: response.note
      });
    }

    const masteryScore = itemResults.filter((result) => result.correct).length / itemResults.length;
    const confidenceScore =
      itemResults.reduce((total, result) => total + confidenceValue(result.confidence), 0) /
      itemResults.length;
    const remainingKnowledgeGapIds = [
      ...new Set(
        itemResults
          .filter((result) => !result.correct || result.confidence !== "high")
          .map((result) => result.knowledgeGapId)
      )
    ];
    const completedAt = new Date().toISOString();
    const schedule = input.reviewScheduler.schedule({
      completedAt,
      existingSessionCount: input.existingSessionCount,
      itemResults
    });
    const overconfidenceCount = itemResults.filter((result) => result.overconfidence).length;

    return ok(
      new ActiveReviewSession({
        id: createActiveReviewSessionId(),
        workspaceId: input.workspaceId,
        learningLoopId: input.learningLoopId,
        practiceActivityId: input.practiceActivityId,
        kind: input.kind,
        completedAt,
        itemResults,
        masteryScore,
        confidenceScore,
        remainingKnowledgeGapIds,
        reviewIntervalHours: schedule.reviewIntervalHours,
        nextReviewAt: schedule.nextReviewAt,
        easeSignal: schedule.easeSignal,
        evidenceSummary: overconfidenceCount > 0
          ? `Review identified ${overconfidenceCount} overconfident response${overconfidenceCount === 1 ? "" : "s"} and ${remainingKnowledgeGapIds.length} remaining gap areas.`
          :
          remainingKnowledgeGapIds.length > 0
            ? `Review identified ${remainingKnowledgeGapIds.length} remaining gap areas.`
            : "Review evidence shows secure recall across the targeted practice items."
      })
    );
  }

  static rehydrate(snapshot: ActiveReviewSessionSnapshot): ActiveReviewSession {
    return new ActiveReviewSession({
      ...snapshot,
      itemResults: snapshot.itemResults.map((result) => ({ ...result })),
      remainingKnowledgeGapIds: [...snapshot.remainingKnowledgeGapIds]
    });
  }

  get id(): ActiveReviewSessionId {
    return this.snapshot.id;
  }

  get masteryScore(): number {
    return this.snapshot.masteryScore;
  }

  get completedAt(): string {
    return this.snapshot.completedAt;
  }

  get remainingKnowledgeGapIds(): readonly KnowledgeGapId[] {
    return this.snapshot.remainingKnowledgeGapIds;
  }

  get reviewIntervalHours(): number {
    return this.snapshot.reviewIntervalHours;
  }

  get nextReviewAt(): string {
    return this.snapshot.nextReviewAt;
  }

  get easeSignal(): ReviewEaseSignal {
    return this.snapshot.easeSignal;
  }

  get itemResults(): readonly ActiveReviewItemResult[] {
    return this.snapshot.itemResults;
  }

  toSnapshot(): ActiveReviewSessionSnapshot {
    return {
      ...this.snapshot,
      itemResults: this.snapshot.itemResults.map((result) => ({ ...result })),
      remainingKnowledgeGapIds: [...this.snapshot.remainingKnowledgeGapIds]
    };
  }
}
