import type { KnowledgeGap, LearningLoop, MasteryProfile } from "../../domain/learning/LearningLoop.js";
import type { CreateStudyPlanCommand } from "../../domain/study/StudyPlanning.js";

export interface StudyPlanAdaptationResult {
  diagnosedGaps: readonly string[];
  focusTopics: readonly string[];
  objective: string;
}

export class StudyPlanAdaptation {
  adapt(input: {
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
    const combinedTopics = [...new Set([...gapTopics, ...developingTopics, ...prioritisedTopics])];

    return {
      diagnosedGaps: gapTopics,
      focusTopics: combinedTopics.length > 0 ? combinedTopics : input.command.focusTopics,
      objective:
        gapTopics.length > 0
          ? `${input.command.objective} Prioritise diagnosed gaps in ${gapTopics.join(", ")}.`
          : input.command.objective
    };
  }
}
