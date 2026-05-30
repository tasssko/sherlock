import type { ActiveReviewSession } from "../../domain/learning/ActiveReviewSession.js";
import type { KnowledgeGap, LearningLoop, MasteryProfile } from "../../domain/learning/LearningLoop.js";
import type { CreateStudyPlanCommand } from "../../domain/study/StudyPlanning.js";

export interface StudyPlanAdaptationResult {
  diagnosedGaps: readonly string[];
  focusTopics: readonly string[];
  objective: string;
}

export class StudyPlanAdaptation {
  adapt(input: {
    activeReviewSessions?: readonly ActiveReviewSession[];
    command: CreateStudyPlanCommand;
    learningLoop?: LearningLoop;
    knowledgeGaps: readonly KnowledgeGap[];
    masteryProfile?: MasteryProfile;
  }): StudyPlanAdaptationResult {
    const gapTopics = input.knowledgeGaps.map((gap) => gap.topic);
    const prioritisedTopics = [...new Set([...gapTopics, ...input.command.focusTopics])];
    const masterySnapshot = input.masteryProfile?.toSnapshot();
    const developingTopics =
      masterySnapshot?.topics.filter((topic) => topic.status === "developing").map((topic) => topic.topic) ??
      [];
    const recentReviewTopics = [
      ...new Set(
        (input.activeReviewSessions ?? [])
          .flatMap((session) => session.itemResults)
          .filter((result) => !result.correct || result.confidence !== "high")
          .map((result) => result.topic)
      )
    ];
    const combinedTopics = [
      ...new Set([...gapTopics, ...recentReviewTopics, ...developingTopics, ...prioritisedTopics])
    ];
    const reviewEvidenceNote =
      recentReviewTopics.length > 0
        ? ` Prioritise remaining gaps surfaced in recent practice across ${recentReviewTopics.join(", ")}.`
        : "";

    return {
      diagnosedGaps: gapTopics,
      focusTopics: combinedTopics.length > 0 ? combinedTopics : input.command.focusTopics,
      objective:
        gapTopics.length > 0
          ? `${input.command.objective} Prioritise diagnosed gaps in ${gapTopics.join(", ")}.${reviewEvidenceNote}`
          : input.command.objective
    };
  }
}
