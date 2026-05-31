import type {
  LearnerEvidenceId,
  LearningLoopId,
  LearningLoopUnitId,
  MasterDataSourceId,
  QuestionSeedId,
  QuestionVariantId,
  WorkspaceId
} from "../primitives/ids.js";
import { createLearnerEvidenceId } from "../primitives/ids.js";

export type LearnerEvidenceCorrectness = "correct" | "incorrect";
export type LearnerEvidenceSupportUsed = "independent" | "guided" | "hinted";

export interface LearnerEvidenceSnapshot {
  id: LearnerEvidenceId;
  workspaceId: WorkspaceId;
  learningLoopId: LearningLoopId;
  loopUnitId?: LearningLoopUnitId;
  seedId: QuestionSeedId;
  variantId: QuestionVariantId;
  sourceId?: MasterDataSourceId;
  responseText: string;
  selectedOptionIds?: readonly string[];
  confidence?: "high" | "medium" | "low";
  correctness: LearnerEvidenceCorrectness;
  supportUsed: LearnerEvidenceSupportUsed;
  feedbackSummary?: string;
  capturedAt: string;
}

export class LearnerEvidence {
  private constructor(private readonly snapshot: LearnerEvidenceSnapshot) {}

  static create(
    input: Omit<LearnerEvidenceSnapshot, "capturedAt" | "id">
  ): LearnerEvidence {
    return new LearnerEvidence({
      id: createLearnerEvidenceId(),
      capturedAt: new Date().toISOString(),
      ...input,
      selectedOptionIds: input.selectedOptionIds ? [...input.selectedOptionIds] : undefined
    });
  }

  static rehydrate(snapshot: LearnerEvidenceSnapshot): LearnerEvidence {
    return new LearnerEvidence({
      ...snapshot,
      selectedOptionIds: snapshot.selectedOptionIds ? [...snapshot.selectedOptionIds] : undefined
    });
  }

  get id(): LearnerEvidenceId {
    return this.snapshot.id;
  }

  get learningLoopId(): LearningLoopId {
    return this.snapshot.learningLoopId;
  }

  toSnapshot(): LearnerEvidenceSnapshot {
    return {
      ...this.snapshot,
      selectedOptionIds: this.snapshot.selectedOptionIds
        ? [...this.snapshot.selectedOptionIds]
        : undefined
    };
  }
}
