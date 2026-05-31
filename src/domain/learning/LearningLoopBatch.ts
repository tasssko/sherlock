import type { KnowledgeGapId, LearningLoopId, LearningLoopUnitId } from "../primitives/ids.js";
import {
  createLearningLoopBatchId,
  createLearningLoopUnitId
} from "../primitives/ids.js";
import type {
  LearningLoopBatchSnapshot,
  LearningLoopUnitQuickCheckSnapshot,
  LearningLoopUnitReviewItemSnapshot,
  LearningLoopUnitSnapshot,
  LearningLoopUnitState
} from "../study/LoopBatches.js";

export interface LearningLoopUnitCandidate {
  focus: string;
  objectiveRefs: readonly string[];
  quickCheckQuestions: readonly {
    prompt: string;
    questionType?: "free_form" | "multiple_choice" | "multiple_select";
    options?: readonly {
      id: string;
      text: string;
    }[];
    correctOptionIds?: readonly string[];
    hint?: string;
    sourceFact?: string;
  }[];
  reason: string;
  reviewItems?: readonly {
    answer: string;
    prompt: string;
  }[];
  shortExplanation: string;
  sourceRefs: readonly string[];
  state?: LearningLoopUnitState;
  learnerTask: string;
  targetKnowledgeGapIds: readonly string[];
}

export interface CreateLearningLoopBatchInput {
  learningLoopId: LearningLoopId;
  overview: string;
  targetDurationMinutes: number;
  units: readonly LearningLoopUnitCandidate[];
}

export class LearningLoopBatch {
  private constructor(private readonly snapshot: LearningLoopBatchSnapshot) {}

  static create(input: CreateLearningLoopBatchInput): LearningLoopBatch {
    const createdAt = new Date().toISOString();
    const units = input.units.map((unit, index) => createLoopUnitSnapshot(unit, index));

    return new LearningLoopBatch({
      id: createLearningLoopBatchId(),
      learningLoopId: input.learningLoopId,
      overview: input.overview,
      targetDurationMinutes: input.targetDurationMinutes,
      createdAt,
      units
    });
  }

  static rehydrate(snapshot: LearningLoopBatchSnapshot): LearningLoopBatch {
    return new LearningLoopBatch({
      ...snapshot,
      units: snapshot.units.map((unit) => ({
        ...unit,
        objectiveRefs: [...unit.objectiveRefs],
        quickCheckQuestions: unit.quickCheckQuestions.map((question) => ({ ...question })),
        reviewItems: unit.reviewItems.map((item) => ({ ...item })),
        sourceRefs: [...unit.sourceRefs],
        targetKnowledgeGapIds: [...unit.targetKnowledgeGapIds]
      }))
    });
  }

  get id() {
    return this.snapshot.id;
  }

  get learningLoopId() {
    return this.snapshot.learningLoopId;
  }

  firstActionableUnit(): LearningLoopUnitSnapshot | undefined {
    return (
      this.snapshot.units.find((unit) => unit.state === "in_progress") ??
      this.snapshot.units.find((unit) => unit.state === "ready")
    );
  }

  markFirstReadyInProgress(): LearningLoopBatch {
    let activated = false;

    return new LearningLoopBatch({
      ...this.snapshot,
      units: this.snapshot.units.map((unit) => {
        if (activated || unit.state !== "ready") {
          return { ...unit };
        }

        activated = true;
        return {
          ...unit,
          state: "in_progress"
        };
      })
    });
  }

  completeCurrentUnit(): LearningLoopBatch {
    let completed = false;
    let unlocked = false;

    return new LearningLoopBatch({
      ...this.snapshot,
      units: this.snapshot.units.map((unit) => {
        if (!completed && (unit.state === "in_progress" || unit.state === "ready")) {
          completed = true;
          return {
            ...unit,
            state: "completed"
          };
        }

        if (completed && !unlocked && unit.state === "locked") {
          unlocked = true;
          return {
            ...unit,
            state: "ready"
          };
        }

        return { ...unit };
      })
    });
  }

  toSnapshot(): LearningLoopBatchSnapshot {
    return {
      ...this.snapshot,
      units: this.snapshot.units.map((unit) => ({
        ...unit,
        objectiveRefs: [...unit.objectiveRefs],
        quickCheckQuestions: unit.quickCheckQuestions.map((question) => ({ ...question })),
        reviewItems: unit.reviewItems.map((item) => ({ ...item })),
        sourceRefs: [...unit.sourceRefs],
        targetKnowledgeGapIds: [...unit.targetKnowledgeGapIds]
      }))
    };
  }
}

function createLoopUnitSnapshot(
  unit: LearningLoopUnitCandidate,
  index: number
): LearningLoopUnitSnapshot {
  const initialState =
    unit.state ?? (index === 0 ? "ready" : "locked");

  return {
    id: createLearningLoopUnitId(),
    focus: unit.focus,
    reason: unit.reason,
    objectiveRefs: [...unit.objectiveRefs],
    sourceRefs: [...unit.sourceRefs],
    shortExplanation: unit.shortExplanation,
    learnerTask: unit.learnerTask,
    targetKnowledgeGapIds: [...unit.targetKnowledgeGapIds] as KnowledgeGapId[],
    state: initialState,
    quickCheckQuestions: unit.quickCheckQuestions.map(
      (question, questionIndex): LearningLoopUnitQuickCheckSnapshot => ({
        id: `${questionIndex + 1}`,
        prompt: question.prompt,
        questionType: question.questionType,
        options: question.options?.map((option) => ({ ...option })),
        correctOptionIds: question.correctOptionIds ? [...question.correctOptionIds] : undefined,
        hint: question.hint,
        sourceFact: question.sourceFact
      })
    ),
    reviewItems: (unit.reviewItems ?? []).map(
      (item, itemIndex): LearningLoopUnitReviewItemSnapshot => ({
        id: `${itemIndex + 1}`,
        prompt: item.prompt,
        answer: item.answer
      })
    )
  };
}
