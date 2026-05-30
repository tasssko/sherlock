import type { AssessmentItem, EvaluationItemResult } from "../../domain/learning/Assessment.js";
import type { MasterDataItem, MasterDataSource } from "../../domain/learning/MasterData.js";
import type {
  FlashcardSet,
  PracticeItem,
  PracticeItemResponse
} from "../../domain/learning/PracticeActivity.js";
import type {
  InitialAssessmentContext,
  PracticeActivityContext,
  StudyPlanningContext
} from "../../domain/primitives/Context.js";
import { err, ok, type Result } from "../../domain/primitives/result.js";
import type { StudyDay } from "../../domain/study/StudySchedule.js";
import type {
  ActiveReviewEvaluationCandidate,
  AgentRuntime,
  AssessmentAttemptEvaluationCandidate,
  InitialAssessmentGenerationCandidate,
  PracticeActivityGenerationCandidate,
  StudyPlanGenerationCandidate
} from "./AgentRuntime.js";

const difficultyScale: readonly ("easy" | "medium" | "stretch")[] = [
  "easy",
  "easy",
  "medium",
  "medium",
  "stretch"
];

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickSourceSentence(item: MasterDataItem): string {
  const sentences = item.visibleMaterial
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const normalizedAnswer = item.canonicalAnswer.toLowerCase();

  return (
    sentences.find((sentence) => sentence.toLowerCase().includes(normalizedAnswer)) ??
    sentences[0] ??
    item.visibleMaterial
  );
}

export class FixtureAgentRuntime implements AgentRuntime {
  evaluateActiveReviewSession(input: {
    practiceItems: readonly PracticeItem[];
    responses: readonly PracticeItemResponse[];
  }): Result<ActiveReviewEvaluationCandidate> {
    const practiceItemsById = new Map(input.practiceItems.map((item) => [item.id, item]));
    const itemResults = input.responses.map((response) => {
      const practiceItem = practiceItemsById.get(response.practiceItemId);
      const correct = practiceItem
        ? normalize(response.responseText) === normalize(practiceItem.expectedResponse)
        : false;

      return {
        practiceItemId: response.practiceItemId,
        confidence: response.confidence,
        correct,
        overconfidence: !correct && response.confidence === "high",
        feedback: correct
          ? "Secure retrieval shown in review evidence."
          : "Revisit this item before the next review interval."
      };
    });

    return ok({
      runtimeTrace: {
        provider: "fixture",
        operation: "evaluateActiveReviewSession",
        runtimeArtifacts: []
      },
      itemResults
    });
  }

  evaluateAssessmentAttempt(input: {
    assessment: {
      items: readonly AssessmentItem[];
      topic: string;
    };
    contextTopic: string;
    responses: readonly {
      answer: string;
      itemId: string;
    }[];
  }): Result<AssessmentAttemptEvaluationCandidate> {
    const responseByItemId = new Map(
      input.responses.map((response) => [response.itemId, response.answer])
    );

    if (responseByItemId.size === 0) {
      return err({
        code: "VALIDATION_ERROR",
        message: "At least one assessment response is required."
      });
    }

    const itemResults: EvaluationItemResult[] = input.assessment.items.map((item) => {
      const answer = responseByItemId.get(item.id) ?? "";
      const correct = normalize(answer) === normalize(item.canonicalAnswer);

      return {
        itemId: item.id,
        correct,
        feedback: correct
          ? `Secure response for ${item.topic}.`
          : `Review the underlying idea for ${item.topic} and revisit the missed method.`,
        topic: item.topic
      };
    });
    const correctCount = itemResults.filter((result) => result.correct).length;
    const score = itemResults.length === 0 ? 0 : correctCount / itemResults.length;

    return ok({
      runtimeTrace: {
        provider: "fixture",
        operation: "evaluateAssessmentAttempt",
        runtimeArtifacts: []
      },
      itemResults,
      score,
      knowledgeGaps: itemResults
        .filter((result) => !result.correct)
        .map((result) => ({
          topic: result.topic,
          description: `Needs more support with ${result.topic}.`,
          evidence: `Missed assessment item ${result.itemId}.`,
          severity: score < 0.5 ? "high" : "medium"
        }))
    });
  }

  generateInitialAssessment(input: {
    context: InitialAssessmentContext;
    source: MasterDataSource;
    sourceItems: readonly MasterDataItem[];
  }): Result<InitialAssessmentGenerationCandidate> {
    const items = input.sourceItems.map((item, index) => ({
      id: `assessment_item_${index + 1}`,
      topic: item.topic,
      prompt: item.prompt,
      canonicalAnswer: item.canonicalAnswer,
      visibleMaterial: item.visibleMaterial,
      difficulty: difficultyScale[index] ?? "stretch",
      sourceMasterDataItemId: item.id
    }));

    return ok({
      runtimeTrace: {
        provider: "fixture",
        operation: "generateInitialAssessment",
        runtimeArtifacts: []
      },
      items,
      artifactContent: {
        topic: input.context.topic,
        questionCount: input.context.questionCount,
        instructions: `Complete all ${input.context.questionCount} questions without notes. The goal is to diagnose current understanding in ${input.context.topic}.`,
        items: items.map((item) => ({
          id: item.id,
          prompt: item.prompt,
          difficulty: item.difficulty
        }))
      }
    });
  }

  generatePracticeActivity(input: {
    context: PracticeActivityContext;
    selections: readonly {
      gap: {
        description: string;
        id: string;
      };
      item: MasterDataItem;
    }[];
  }): Result<PracticeActivityGenerationCandidate> {
    const cards = input.selections.map(({ gap, item }, index) => ({
      id: `flashcard_${index + 1}`,
      front: item.prompt,
      back: item.canonicalAnswer,
      topic: item.topic,
      knowledgeGapId: gap.id as never,
      learningObjective: gap.description,
      sourceMasterDataItemId: item.id,
      sourceVisibleSentence: pickSourceSentence(item)
    }));

    return ok({
      runtimeTrace: {
        provider: "fixture",
        operation: "generatePracticeActivity",
        runtimeArtifacts: []
      },
      flashcardSet: {
        instructions: `Review each card, attempt an answer from memory, then flip to check accuracy for ${input.context.topic}.`,
        cards
      }
    });
  }

  generateStudyPlan(input: {
    context: StudyPlanningContext;
  }): Result<StudyPlanGenerationCandidate> {
    const activeDays = input.context.schedule
      .filter((entry) => entry.minutes > 0)
      .map((entry) => entry.day as StudyDay);

    if (activeDays.length === 0) {
      return err({
        code: "VALIDATION_ERROR",
        message: "At least one study day must have available minutes."
      });
    }

    const fallbackTopic = input.context.focusTopics[0];
    if (!fallbackTopic) {
      return err({
        code: "VALIDATION_ERROR",
        message: "At least one focus topic is required to generate a study plan."
      });
    }

    const assumptions = [
      {
        id: "assumption_spaced_repetition",
        statement: "Repeated topics across the week are allowed to reinforce retention."
      },
      {
        id: "assumption_single_session",
        statement: "Available minutes on each day can be used as one focused study session."
      },
      {
        id: "assumption_progress_check",
        statement: "Each session ends with a short retrieval or self-check task."
      }
    ] as const;

    const availableMinutesByDay = input.context.availableMinutesByDay();
    const sessions = activeDays.map((day, index) => {
      const minutes = availableMinutesByDay[day];
      const topic = input.context.focusTopics[index % input.context.focusTopics.length] ?? fallbackTopic;
      const longSession = minutes >= 60;

      return {
        day,
        minutes,
        topic,
        activity: longSession
          ? `Retrieve prior knowledge, practise ${topic}, then finish with a mixed recap.`
          : `Recap key ideas in ${topic}, complete one focused practice set, then self-check.`,
        outcome: longSession
          ? `Leave the session with a worked example and one correction note for ${topic}.`
          : `Leave the session with one verified success criterion for ${topic}.`
      };
    });

    return ok({
      runtimeTrace: {
        provider: "fixture",
        operation: "generateStudyPlan",
        runtimeArtifacts: []
      },
      assumptions,
      decisions: [
        "Allocated one primary topic to each active study day.",
        "Used longer sessions for consolidation and mixed review.",
        "Kept every session outcome explicit so the learner can judge completion.",
        ...(input.context.diagnosedGaps.length > 0
          ? [`Prioritised diagnosed gaps in ${input.context.diagnosedGaps.join(", ")}.`]
          : [])
      ],
      childTaskSummaries: input.context.focusTopics.map(
        (topic) => `Prepare a focused ${topic} study block with retrieval and self-check.`
      ),
      artifactContent: {
        summary:
          input.context.diagnosedGaps.length > 0
            ? `${input.context.learnerName} will follow a one-week plan focused on closing gaps in ${input.context.diagnosedGaps.join(
                ", "
              )} and reinforcing ${input.context.focusTopics.join(", ")}.`
            : `${input.context.learnerName} will follow a one-week plan focused on ${input.context.focusTopics.join(
                ", "
              )}.`,
        sessions,
        checkpoints: [
          `Midweek check: explain one idea from ${fallbackTopic} without notes.`,
          `Weekend check: complete a mixed review covering ${input.context.focusTopics.join(", ")}.`
        ],
        notes: [
          "Keep materials ready before each session to protect the short weekday slots.",
          "If a session is missed, roll it into Saturday before starting new work.",
          ...(input.context.diagnosedGaps.length > 0
            ? [`Start each session by revisiting the diagnosed gap in ${input.context.diagnosedGaps[0]}.`]
            : [])
        ]
      }
    });
  }
}
