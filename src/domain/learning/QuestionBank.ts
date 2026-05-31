import type {
  LearningLoopId,
  QuestionSeedId,
  QuestionVariantId
} from "../primitives/ids.js";
import { createQuestionSeedId, createQuestionVariantId } from "../primitives/ids.js";
import type { AssessmentDifficulty, AssessmentOption, AssessmentQuestionType } from "./Assessment.js";

export type QuestionVariantMode =
  | "guided"
  | "review"
  | "flashcard"
  | AssessmentQuestionType;

export interface QuestionSeedSnapshot {
  id: QuestionSeedId;
  learningLoopId: LearningLoopId;
  topic: string;
  focus: string;
  objectiveRefs: readonly string[];
  sourceRefs: readonly string[];
  answerModel: string;
  explanation: string;
  tags: readonly string[];
  createdAt: string;
}

export interface QuestionVariantSnapshot {
  id: QuestionVariantId;
  seedId: QuestionSeedId;
  learningLoopId: LearningLoopId;
  ownerId: string;
  ownerKind: "loop_quick_check" | "loop_review_item";
  position: number;
  mode: QuestionVariantMode;
  prompt: string;
  options?: readonly AssessmentOption[];
  correctOptionIds?: readonly string[];
  hint?: string;
  sourceFact?: string;
  expectedAnswer?: string;
  difficulty?: AssessmentDifficulty;
  createdAt: string;
}

export class QuestionSeed {
  private constructor(private readonly snapshot: QuestionSeedSnapshot) {}

  static create(input: Omit<QuestionSeedSnapshot, "createdAt" | "id">): QuestionSeed {
    return new QuestionSeed({
      id: createQuestionSeedId(),
      createdAt: new Date().toISOString(),
      ...input,
      objectiveRefs: [...input.objectiveRefs],
      sourceRefs: [...input.sourceRefs],
      tags: [...input.tags]
    });
  }

  static rehydrate(snapshot: QuestionSeedSnapshot): QuestionSeed {
    return new QuestionSeed({
      ...snapshot,
      objectiveRefs: [...snapshot.objectiveRefs],
      sourceRefs: [...snapshot.sourceRefs],
      tags: [...snapshot.tags]
    });
  }

  get id(): QuestionSeedId {
    return this.snapshot.id;
  }

  get learningLoopId(): LearningLoopId {
    return this.snapshot.learningLoopId;
  }

  toSnapshot(): QuestionSeedSnapshot {
    return {
      ...this.snapshot,
      objectiveRefs: [...this.snapshot.objectiveRefs],
      sourceRefs: [...this.snapshot.sourceRefs],
      tags: [...this.snapshot.tags]
    };
  }
}

export class QuestionVariant {
  private constructor(private readonly snapshot: QuestionVariantSnapshot) {}

  static create(input: Omit<QuestionVariantSnapshot, "createdAt" | "id">): QuestionVariant {
    return new QuestionVariant({
      id: createQuestionVariantId(),
      createdAt: new Date().toISOString(),
      ...input,
      options: input.options?.map((option) => ({ ...option })),
      correctOptionIds: input.correctOptionIds ? [...input.correctOptionIds] : undefined
    });
  }

  static rehydrate(snapshot: QuestionVariantSnapshot): QuestionVariant {
    return new QuestionVariant({
      ...snapshot,
      options: snapshot.options?.map((option) => ({ ...option })),
      correctOptionIds: snapshot.correctOptionIds ? [...snapshot.correctOptionIds] : undefined
    });
  }

  get id(): QuestionVariantId {
    return this.snapshot.id;
  }

  get learningLoopId(): LearningLoopId {
    return this.snapshot.learningLoopId;
  }

  get ownerId(): string {
    return this.snapshot.ownerId;
  }

  get ownerKind(): "loop_quick_check" | "loop_review_item" {
    return this.snapshot.ownerKind;
  }

  get position(): number {
    return this.snapshot.position;
  }

  toSnapshot(): QuestionVariantSnapshot {
    return {
      ...this.snapshot,
      options: this.snapshot.options?.map((option) => ({ ...option })),
      correctOptionIds: this.snapshot.correctOptionIds
        ? [...this.snapshot.correctOptionIds]
        : undefined
    };
  }
}
