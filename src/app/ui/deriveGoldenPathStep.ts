import type { LearningLoopResumeResponse } from "../../domain/study/LearningLoops.js";

export type GoldenPathStep =
  | "prepare-loop"
  | "take-assessment"
  | "start-loop"
  | "generate-practice"
  | "complete-review"
  | "track-progress";

export function deriveGoldenPathStep(
  resume: LearningLoopResumeResponse | null | undefined
): GoldenPathStep {
  if (!resume) {
    return "prepare-loop";
  }

  switch (resume.nextAction.kind) {
    case "complete-initial-assessment":
      return "take-assessment";
    case "start-loop-unit":
      return "start-loop";
    case "review-study-plan":
      return resume.studyPlan ? "generate-practice" : "start-loop";
    case "generate-practice-activity":
      return "generate-practice";
    case "complete-practice-activity":
      return "complete-review";
    case "track-mastery":
      return "track-progress";
    case "review-diagnosis":
      return "start-loop";
    default:
      return "prepare-loop";
  }
}
