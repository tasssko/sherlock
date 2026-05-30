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
  MasterDataInterpretationResultCandidate,
  PracticeActivityGenerationCandidate,
  StudyPlanGenerationCandidate
} from "./AgentRuntime.js";
import {
  buildMasterDataInterpretationSummary,
  validateMasterDataInterpretationCandidate,
  type MasterDataInterpretationCandidate
} from "../masterData/MasterDataInterpretation.js";
import { parseMasterDataInput } from "../masterData/structuredRevision.js";

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
  if (item.content) {
    return item.content;
  }

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

function buildAssessmentPrompt(item: MasterDataItem): string {
  return item.sourceRef ? `${item.prompt} [Source: ${item.sourceRef}]` : item.prompt;
}

function buildPracticeFront(item: MasterDataItem): string {
  if (item.itemType === "person" && item.person) {
    return `Who was ${item.person}?`;
  }

  if (item.itemType === "key_term" && item.term) {
    return `What does ${item.term} mean?`;
  }

  if (item.itemType === "date" && item.date) {
    return `What happened in ${item.date}?`;
  }

  return item.prompt;
}

function buildPracticeBack(item: MasterDataItem): string {
  return item.content ?? item.definition ?? item.canonicalAnswer;
}

export class FixtureAgentRuntime implements AgentRuntime {
  evaluateActiveReviewSession(input: {
    learningLoopId: string;
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
    learningLoopId: string;
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

  interpretMasterData(input: {
    contentType: string;
    expectedOutputSchema: "MasterDataInterpretationCandidate.v1";
    fallbackItems?: readonly {
      canonicalAnswer: string;
      prompt: string;
      topic: string;
      visibleMaterial: string;
    }[];
    learnerYearGroup?: string;
    rawSourceContent: string;
    sourceId: string;
    sourceName: string;
    userHints?: {
      subject?: string;
      topic?: string;
    };
  }): Result<MasterDataInterpretationResultCandidate> {
    const parsed = parseMasterDataInput({
      sourceName: input.sourceName,
      lines: input.rawSourceContent,
      fallbackSubject: input.userHints?.subject,
      fallbackTopic: input.userHints?.topic ?? input.fallbackItems?.[0]?.topic ?? "study",
      fallbackYearGroup: input.learnerYearGroup
    });
    const mainTopic =
      parsed.summary.mainTopic ??
      input.userHints?.topic ??
      input.fallbackItems?.[0]?.topic ??
      "Study";
    const detectedYearGroup =
      parsed.summary.yearGroup ??
      input.learnerYearGroup ??
      inferYearGroupFromText(input.sourceName) ??
      inferYearGroupFromText(input.rawSourceContent) ??
      "Year group not specified";
    const detectedSubject =
      parsed.summary.subject ??
      input.userHints?.subject ??
      inferSubjectFromSourceName(input.sourceName) ??
      inferSubjectFromTopic(mainTopic) ??
      "General study";
    const structuredItems =
      parsed.structuredItems.length > 0
        ? parsed.structuredItems
        : (input.fallbackItems ?? parsed.items).map((item, index) => ({
            subject: detectedSubject,
            yearGroup: detectedYearGroup,
            topic: item.topic || mainTopic,
            subtopic: deriveFallbackSubtopic(item.prompt, item.topic || mainTopic, index),
            itemType: "fact" as const,
            content: item.canonicalAnswer || item.visibleMaterial,
            sourceRef: `${item.topic || mainTopic} > fallback-${index + 1}`
          }));
    const subtopics =
      parsed.summary.subtopics.length > 0
        ? parsed.summary.subtopics
        : unique(
            structuredItems
              .map((item) => item.subtopic)
              .filter((subtopic) => subtopic && subtopic !== mainTopic)
          );
    const learningObjectives = buildLearningObjectives(structuredItems, mainTopic);
    const candidate = validateMasterDataInterpretationCandidate({
      schema: input.expectedOutputSchema,
      documentTitle: parsed.summary.documentTitle,
      detectedSubject,
      detectedYearGroup,
      mainTopic,
      subtopics,
      keyPeople: parsed.summary.keyPeople,
      keyTerms: parsed.summary.keyTerms,
      importantDates: parsed.summary.importantDates,
      processes: unique(
        structuredItems
          .filter((item) => item.itemType !== "fact")
          .map((item) => item.subtopic)
      ),
      learnerFacingMaterialSummary: buildLearnerFacingMaterialSummary({
        detectedSubject,
        detectedYearGroup,
        interpretationTopic: mainTopic,
        parsedSubtopics: subtopics,
        keyPeople: parsed.summary.keyPeople,
        keyTerms: parsed.summary.keyTerms,
        importantDates: parsed.summary.importantDates
      }),
      learningObjectives,
      sourceMap: structuredItems.map((item) => ({
        sourceRef: item.sourceRef,
        excerpt: item.content
      })),
      items: structuredItems
    });

    return ok({
      runtimeTrace: {
        provider: "fixture",
        operation: "interpretMasterData",
        runtimeArtifacts: []
      },
      interpretation: candidate
    });
  }

  generateInitialAssessment(input: {
    context: InitialAssessmentContext;
    learningLoopId: string;
    source: MasterDataSource;
    sourceItems: readonly MasterDataItem[];
  }): Result<InitialAssessmentGenerationCandidate> {
    const items = input.sourceItems.map((item, index) => ({
      id: `assessment_item_${index + 1}`,
      topic: item.topic,
      prompt: buildAssessmentPrompt(item),
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
    learningLoopId: string;
    materialInterpretation?: MasterDataInterpretationCandidate;
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
      front: buildPracticeFront(item),
      back: buildPracticeBack(item),
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
    learningLoopId: string;
    materialInterpretations?: readonly MasterDataInterpretationCandidate[];
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
        ...unique(
          (input.materialInterpretations ?? [])
            .flatMap((interpretation) =>
              buildMasterDataInterpretationSummary(interpretation).learningObjectives
            )
            .slice(0, 2)
            .map((objective) => `Protected time for objective: ${objective}`)
        ),
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

function buildLearningObjectives(
  items: ReadonlyArray<MasterDataInterpretationCandidate["items"][number]>,
  topic: string
) {
  const subtopics = unique(
    items
      .map((item) => item.subtopic)
      .filter((subtopic) => subtopic && subtopic !== topic)
  ).slice(0, 3);

  const objectives = subtopics.length > 0 ? subtopics : [topic];
  return objectives.map((objective, index) => {
    const objectiveItems = items.filter(
      (item) => item.subtopic === objective || objective === topic
    );
    const firstPerson = objectiveItems.find((item) => item.person)?.person;
    const firstTerm = objectiveItems.find((item) => item.term)?.term;
    const firstDate = objectiveItems.find((item) => item.date)?.date;
    const processLabels = unique(
      objectiveItems
        .map((item) => item.itemType)
        .filter((itemType) =>
          itemType === "cause" ||
          itemType === "event" ||
          itemType === "consequence" ||
          itemType === "legacy"
        )
    );

    return {
      id: `objective_${index + 1}`,
      objective: buildObjectiveText({
        objective,
        topic,
        firstPerson,
        firstTerm,
        firstDate,
        processLabels
      }),
      sourceRefs: objectiveItems.slice(0, 3).map((item) => item.sourceRef)
    };
  });
}

function unique(values: readonly string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function inferYearGroupFromText(value: string) {
  const yearMatch = value.match(/\b(?:year|y)\s*(\d{1,2})\b/i);
  if (yearMatch?.[1]) {
    return `Year ${yearMatch[1]}`;
  }

  return undefined;
}

function inferSubjectFromSourceName(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("history")) {
    return "History";
  }
  if (normalized.includes("geography")) {
    return "Geography";
  }
  if (normalized.includes("science")) {
    return "Science";
  }
  if (normalized.includes("latin")) {
    return "Latin";
  }
  if (normalized.includes("tpr")) {
    return "TPR";
  }

  return undefined;
}

function inferSubjectFromTopic(topic: string) {
  const cleaned = topic.trim();
  if (!cleaned) {
    return undefined;
  }

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function deriveFallbackSubtopic(prompt: string, topic: string, index: number) {
  const cleaned = prompt
    .replace(/[?!.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned && cleaned.toLowerCase() !== topic.toLowerCase()) {
    return cleaned;
  }

  return `${topic} focus ${index + 1}`;
}

function buildLearnerFacingMaterialSummary(input: {
  detectedSubject: string;
  detectedYearGroup: string;
  importantDates: readonly string[];
  interpretationTopic: string;
  keyPeople: readonly string[];
  keyTerms: readonly string[];
  parsedSubtopics: readonly string[];
}) {
  const subtopics = input.parsedSubtopics.slice(0, 3);
  const detailParts = [
    subtopics.length > 0 ? `It focuses on ${joinList(subtopics)}.` : undefined,
    input.keyTerms.length > 0 ? `Useful vocabulary includes ${joinList(input.keyTerms.slice(0, 3))}.` : undefined,
    input.keyPeople.length > 0 ? `Important people include ${joinList(input.keyPeople.slice(0, 3))}.` : undefined,
    input.importantDates.length > 0 ? `Key dates include ${joinList(input.importantDates.slice(0, 3))}.` : undefined
  ].filter((value): value is string => Boolean(value));

  return `${input.interpretationTopic} is a ${input.detectedSubject} study pack for ${input.detectedYearGroup}. ${detailParts.join(" ")}`.trim();
}

function buildObjectiveText(input: {
  firstDate?: string;
  firstPerson?: string;
  firstTerm?: string;
  objective: string;
  processLabels: readonly string[];
  topic: string;
}) {
  if (input.firstPerson) {
    return `Explain why ${input.firstPerson} matters in ${input.objective} and support the explanation with precise evidence from ${input.topic}.`;
  }

  if (input.firstTerm) {
    return `Define ${input.firstTerm} accurately and use it to explain ${input.objective} within ${input.topic}.`;
  }

  if (input.firstDate) {
    return `Place ${input.firstDate} accurately within ${input.objective} and explain why it matters to ${input.topic}.`;
  }

  if (input.processLabels.length > 0) {
    return `Explain the ${joinList(input.processLabels)} linked to ${input.objective} and connect them back to ${input.topic}.`;
  }

  return `Explain the main ideas in ${input.objective} and connect them to the wider topic of ${input.topic}.`;
}

function joinList(values: readonly string[]) {
  if (values.length <= 1) {
    return values[0] ?? "";
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}
