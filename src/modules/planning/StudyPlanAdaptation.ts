import type { LearnerEvidence } from "../../domain/learning/LearnerEvidence.js";
import type { KnowledgeGap, LearningLoop, MasteryProfile } from "../../domain/learning/LearningLoop.js";
import type { MasteryState } from "../../domain/learning/MasteryState.js";
import type { CreateStudyPlanCommand } from "../../domain/study/StudyPlanning.js";

export interface StudyPlanAdaptationResult {
  diagnosedGaps: readonly string[];
  focusTopics: readonly string[];
  objective: string;
}

interface CanonicalStudyPlanSummary {
  gapTopics: readonly string[];
  masteryStateTopics: readonly string[];
  compatibilityMasteryTopics: readonly string[];
  recentEvidenceTopics: readonly string[];
}

export class StudyPlanAdaptation {
  adapt(input: {
    command: CreateStudyPlanCommand;
    learnerEvidence?: readonly LearnerEvidence[];
    learningLoop?: LearningLoop;
    knowledgeGaps: readonly KnowledgeGap[];
    masteryProfile?: MasteryProfile;
    masteryStates?: readonly MasteryState[];
  }): StudyPlanAdaptationResult {
    const summary = summarizeCanonicalStudyPlanInputs(input);
    const gapTopics = [...summary.gapTopics];
    const prioritisedTopics = [...new Set([...gapTopics, ...input.command.focusTopics])];
    const combinedTopics = [
      ...new Set([
        ...gapTopics,
        ...summary.recentEvidenceTopics,
        ...summary.masteryStateTopics,
        ...summary.compatibilityMasteryTopics,
        ...prioritisedTopics
      ])
    ];
    const reviewEvidenceNote =
      summary.recentEvidenceTopics.length > 0
        ? ` Prioritise remaining gaps surfaced in recent practice across ${summary.recentEvidenceTopics.join(", ")}.`
        : "";
    const objectiveTopics = gapTopics.length > 0 ? gapTopics : summary.recentEvidenceTopics;
    const objectivePrefix =
      gapTopics.length > 0
        ? `Prioritise diagnosed gaps in ${objectiveTopics.join(", ")}.`
        : summary.recentEvidenceTopics.length > 0
          ? `Prioritise recent practice evidence in ${objectiveTopics.join(", ")}.`
          : "";

    return {
      diagnosedGaps: gapTopics,
      focusTopics: combinedTopics.length > 0 ? combinedTopics : input.command.focusTopics,
      objective:
        objectivePrefix
          ? `${input.command.objective} ${objectivePrefix}${reviewEvidenceNote}`
          : input.command.objective
    };
  }
}

function summarizeCanonicalStudyPlanInputs(input: {
  command: CreateStudyPlanCommand;
  learnerEvidence?: readonly LearnerEvidence[];
  learningLoop?: LearningLoop;
  knowledgeGaps: readonly KnowledgeGap[];
  masteryProfile?: MasteryProfile;
  masteryStates?: readonly MasteryState[];
}): CanonicalStudyPlanSummary {
  const gapTopics = input.knowledgeGaps.map((gap) => gap.topic);
  const masteryStateTopics = [
    ...new Set(
      (input.masteryStates ?? [])
        .filter((state) => {
          const snapshot = state.toSnapshot();
          return snapshot.seedId === undefined && snapshot.status !== "secure";
        })
        .map((state) => state.toSnapshot().topic)
    )
  ];
  // Compatibility mastery topics are kept only so older stored profiles can
  // still inform planning when canonical mastery state is not present yet.
  const compatibilityMasteryTopics =
    input.masteryProfile
      ?.toSnapshot()
      .topics.filter((topic) => topic.status === "developing")
      .map((topic) => topic.topic) ?? [];
  const recentEvidenceTopics = [
    ...new Set(
      (input.learnerEvidence ?? [])
        .map((evidence) => evidence.toSnapshot())
        .filter(
          (evidence) => evidence.correctness !== "correct" || evidence.confidence !== "high"
        )
        .map(() => input.learningLoop?.topic ?? input.command.focusTopics[0] ?? "study")
    )
  ];

  return {
    gapTopics,
    masteryStateTopics,
    compatibilityMasteryTopics,
    recentEvidenceTopics
  };
}
