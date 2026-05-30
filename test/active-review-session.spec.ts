import { describe, expect, it } from "vitest";
import { ActiveReviewSession } from "../src/domain/learning/ActiveReviewSession.js";
import type { PracticeItem } from "../src/domain/learning/PracticeActivity.js";
import {
  createKnowledgeGapId,
  createLearningLoopId,
  createMasterDataItemId,
  createPracticeActivityId,
  createWorkspaceId
} from "../src/domain/primitives/ids.js";
import { PracticeReviewSchedulingPolicy } from "../src/modules/practice/PracticeReviewSchedulingPolicy.js";

function buildPracticeItem(overrides?: Partial<PracticeItem>): PracticeItem {
  return {
    id: "item_1",
    prompt: "Simplify 6/8.",
    expectedResponse: "three quarters",
    topic: "fractions",
    knowledgeGapId: createKnowledgeGapId(),
    learningObjective: "Recognise equivalent fractions.",
    sourceMasterDataItemId: createMasterDataItemId(),
    sourceVisibleSentence: "Equivalent fractions can look different while still representing an equal quantity.",
    ...overrides
  };
}

describe("ActiveReviewSession", () => {
  it("extends the review interval for high correctness with high confidence", () => {
    const practiceItem = buildPracticeItem();
    const result = ActiveReviewSession.createFromPracticeResponses({
      allowedKnowledgeGapIds: [practiceItem.knowledgeGapId],
      allowedSourceMasterDataItemIds: [practiceItem.sourceMasterDataItemId],
      existingSessionCount: 1,
      kind: "flashcard_set",
      learningLoopId: createLearningLoopId(),
      practiceItems: [practiceItem],
      practiceActivityId: createPracticeActivityId(),
      responses: [
        {
          practiceItemId: practiceItem.id,
          responseText: practiceItem.expectedResponse,
          confidence: "high"
        }
      ],
      reviewScheduler: new PracticeReviewSchedulingPolicy(),
      workspaceId: createWorkspaceId()
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.reviewIntervalHours).toBe(96);
    expect(result.value.easeSignal).toBe("easy");
  });

  it("shortens the review interval for low correctness with low confidence", () => {
    const practiceItem = buildPracticeItem();
    const result = ActiveReviewSession.createFromPracticeResponses({
      allowedKnowledgeGapIds: [practiceItem.knowledgeGapId],
      allowedSourceMasterDataItemIds: [practiceItem.sourceMasterDataItemId],
      existingSessionCount: 0,
      kind: "flashcard_set",
      learningLoopId: createLearningLoopId(),
      practiceItems: [practiceItem],
      practiceActivityId: createPracticeActivityId(),
      responses: [
        {
          practiceItemId: practiceItem.id,
          responseText: "wrong answer",
          confidence: "low"
        }
      ],
      reviewScheduler: new PracticeReviewSchedulingPolicy(),
      workspaceId: createWorkspaceId()
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.reviewIntervalHours).toBe(12);
    expect(result.value.easeSignal).toBe("hard");
  });

  it("keeps near-term review when correctness is high but confidence stays low", () => {
    const practiceItem = buildPracticeItem();
    const result = ActiveReviewSession.createFromPracticeResponses({
      allowedKnowledgeGapIds: [practiceItem.knowledgeGapId],
      allowedSourceMasterDataItemIds: [practiceItem.sourceMasterDataItemId],
      existingSessionCount: 0,
      kind: "flashcard_set",
      learningLoopId: createLearningLoopId(),
      practiceItems: [practiceItem],
      practiceActivityId: createPracticeActivityId(),
      responses: [
        {
          practiceItemId: practiceItem.id,
          responseText: practiceItem.expectedResponse,
          confidence: "low"
        }
      ],
      reviewScheduler: new PracticeReviewSchedulingPolicy(),
      workspaceId: createWorkspaceId()
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.reviewIntervalHours).toBe(24);
    expect(result.value.easeSignal).toBe("steady");
  });

  it("flags overconfidence and shortens the interval for low correctness with high confidence", () => {
    const practiceItem = buildPracticeItem();
    const result = ActiveReviewSession.createFromPracticeResponses({
      allowedKnowledgeGapIds: [practiceItem.knowledgeGapId],
      allowedSourceMasterDataItemIds: [practiceItem.sourceMasterDataItemId],
      existingSessionCount: 0,
      kind: "flashcard_set",
      learningLoopId: createLearningLoopId(),
      practiceItems: [practiceItem],
      practiceActivityId: createPracticeActivityId(),
      responses: [
        {
          practiceItemId: practiceItem.id,
          responseText: "wrong answer",
          confidence: "high"
        }
      ],
      reviewScheduler: new PracticeReviewSchedulingPolicy(),
      workspaceId: createWorkspaceId()
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.reviewIntervalHours).toBe(12);
    expect(result.value.itemResults[0]).toMatchObject({
      overconfidence: true,
      correct: false,
      confidence: "high"
    });
  });

  it("rejects review evidence that references knowledge gaps outside the loop", () => {
    const practiceItem = buildPracticeItem();
    const result = ActiveReviewSession.createFromPracticeResponses({
      allowedKnowledgeGapIds: [createKnowledgeGapId()],
      allowedSourceMasterDataItemIds: [practiceItem.sourceMasterDataItemId],
      existingSessionCount: 0,
      kind: "flashcard_set",
      learningLoopId: createLearningLoopId(),
      practiceItems: [practiceItem],
      practiceActivityId: createPracticeActivityId(),
      responses: [
        {
          practiceItemId: practiceItem.id,
          responseText: practiceItem.expectedResponse,
          confidence: "high"
        }
      ],
      reviewScheduler: new PracticeReviewSchedulingPolicy(),
      workspaceId: createWorkspaceId()
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.message).toContain("outside the learning loop");
  });

  it("rejects review evidence that references sources outside the practice activity", () => {
    const practiceItem = buildPracticeItem();
    const result = ActiveReviewSession.createFromPracticeResponses({
      allowedKnowledgeGapIds: [practiceItem.knowledgeGapId],
      allowedSourceMasterDataItemIds: [createMasterDataItemId()],
      existingSessionCount: 0,
      kind: "flashcard_set",
      learningLoopId: createLearningLoopId(),
      practiceItems: [practiceItem],
      practiceActivityId: createPracticeActivityId(),
      responses: [
        {
          practiceItemId: practiceItem.id,
          responseText: practiceItem.expectedResponse,
          confidence: "high"
        }
      ],
      reviewScheduler: new PracticeReviewSchedulingPolicy(),
      workspaceId: createWorkspaceId()
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.message).toContain("outside the practice activity");
  });
});
