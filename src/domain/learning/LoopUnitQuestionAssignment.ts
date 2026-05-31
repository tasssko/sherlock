import type {
  LearningLoopId,
  LearningLoopUnitId,
  LoopUnitQuestionAssignmentId,
  QuestionVariantId
} from "../primitives/ids.js";
import { createLoopUnitQuestionAssignmentId } from "../primitives/ids.js";

export type LoopUnitQuestionAssignmentPurpose = "quick_check" | "review" | "practice";

export interface LoopUnitQuestionAssignmentSnapshot {
  id: LoopUnitQuestionAssignmentId;
  learningLoopId: LearningLoopId;
  loopUnitId: LearningLoopUnitId;
  variantId: QuestionVariantId;
  purpose: LoopUnitQuestionAssignmentPurpose;
  sequence: number;
  createdAt: string;
}

export class LoopUnitQuestionAssignment {
  private constructor(private readonly snapshot: LoopUnitQuestionAssignmentSnapshot) {}

  static create(
    input: Omit<LoopUnitQuestionAssignmentSnapshot, "createdAt" | "id">
  ): LoopUnitQuestionAssignment {
    return new LoopUnitQuestionAssignment({
      id: createLoopUnitQuestionAssignmentId(),
      createdAt: new Date().toISOString(),
      ...input
    });
  }

  static rehydrate(snapshot: LoopUnitQuestionAssignmentSnapshot): LoopUnitQuestionAssignment {
    return new LoopUnitQuestionAssignment({ ...snapshot });
  }

  get id(): LoopUnitQuestionAssignmentId {
    return this.snapshot.id;
  }

  get learningLoopId(): LearningLoopId {
    return this.snapshot.learningLoopId;
  }

  get loopUnitId(): LearningLoopUnitId {
    return this.snapshot.loopUnitId;
  }

  get variantId(): QuestionVariantId {
    return this.snapshot.variantId;
  }

  get purpose(): LoopUnitQuestionAssignmentPurpose {
    return this.snapshot.purpose;
  }

  get sequence(): number {
    return this.snapshot.sequence;
  }

  toSnapshot(): LoopUnitQuestionAssignmentSnapshot {
    return { ...this.snapshot };
  }
}
