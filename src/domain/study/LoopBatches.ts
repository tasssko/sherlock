import type {
  KnowledgeGapId,
  LearningLoopBatchId,
  LearningLoopId,
  LearningLoopUnitId
} from "../primitives/ids.js";
import type { AssessmentOption, AssessmentQuestionType } from "../learning/Assessment.js";

export type LearningLoopUnitState = "locked" | "ready" | "in_progress" | "completed";

export interface LearningLoopUnitQuickCheckSnapshot {
  id: string;
  prompt: string;
  questionType?: AssessmentQuestionType;
  options?: readonly AssessmentOption[];
  correctOptionIds?: readonly string[];
  hint?: string;
  sourceFact?: string;
}

export interface LearningLoopUnitReviewItemSnapshot {
  answer: string;
  id: string;
  prompt: string;
}

export interface LearningLoopUnitSnapshot {
  id: LearningLoopUnitId;
  focus: string;
  objectiveRefs: readonly string[];
  quickCheckQuestions: readonly LearningLoopUnitQuickCheckSnapshot[];
  reason: string;
  reviewItems: readonly LearningLoopUnitReviewItemSnapshot[];
  shortExplanation: string;
  sourceRefs: readonly string[];
  state: LearningLoopUnitState;
  learnerTask: string;
  targetKnowledgeGapIds: readonly KnowledgeGapId[];
}

export interface LearningLoopBatchSnapshot {
  id: LearningLoopBatchId;
  learningLoopId: LearningLoopId;
  overview: string;
  targetDurationMinutes: number;
  units: readonly LearningLoopUnitSnapshot[];
  createdAt: string;
}
