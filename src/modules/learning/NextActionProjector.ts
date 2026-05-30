import type { LearningLoop } from "../../domain/learning/LearningLoop.js";
import type { NextActionProjection } from "../../domain/study/NextAction.js";

export class NextActionProjector {
  project(input: {
    assessmentId?: string;
    learningLoop: LearningLoop;
    practiceActivityId?: string;
    workPlanId?: string;
  }): NextActionProjection {
    const phase = input.learningLoop.phase;

    if (phase === "initial-assessment" || phase === "diagnosis") {
      return {
        kind: "complete-initial-assessment",
        summary: "Complete the current diagnostic assessment so the loop can identify gaps.",
        relatedId: input.assessmentId
      };
    }

    if (phase === "study-planning") {
      return {
        kind: "review-study-plan",
        summary: "Review the adapted study plan and prepare the next focused practice step.",
        relatedId: input.workPlanId
      };
    }

    if (phase === "practice") {
      return input.practiceActivityId
        ? {
            kind: "complete-practice-activity",
            summary: "Complete the targeted practice activity and record item-level evidence.",
            relatedId: input.practiceActivityId
          }
        : {
            kind: "generate-practice-activity",
            summary: "Generate the next targeted practice activity from the diagnosed gaps."
          };
    }

    if (phase === "reassessment") {
      return {
        kind: "review-diagnosis",
        summary: "Review the latest evidence and confirm which knowledge gaps remain."
      };
    }

    return {
      kind: "track-mastery",
      summary: "Track mastery over time and schedule the next review only if confidence drops."
    };
  }
}
