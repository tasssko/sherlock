import type { LearningLoopPhase } from "../learning/LearningLoop.js";

export type NextActionKind =
  | "complete-initial-assessment"
  | "review-diagnosis"
  | "review-study-plan"
  | "start-loop-unit"
  | "complete-practice-activity"
  | "generate-practice-activity"
  | "track-mastery";

export interface NextActionProjection {
  kind: NextActionKind;
  summary: string;
  relatedId?: string;
}

export interface LearningLoopRouteProjection {
  learningLoopId: string;
  phase: LearningLoopPhase;
  nextAction: NextActionProjection;
}
