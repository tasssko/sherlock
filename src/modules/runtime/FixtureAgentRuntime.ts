import type {
  AssessmentItem,
  AssessmentQuestionType,
  AssessmentOption,
  EvaluationItemResult
} from "../../domain/learning/Assessment.js";
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
  LearningLoopBatchGenerationCandidate,
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

function buildRecallAnchor(item: MasterDataItem): string {
  return item.person ?? item.term ?? item.date ?? item.subtopic ?? item.topic;
}

function isGenericRecallPrompt(prompt: string): boolean {
  const normalized = normalize(prompt);
  return (
    normalized.startsWith("what should you remember about ") ||
    normalized.startsWith("what is one key fact from ")
  );
}

function buildSpecificRecallPrompt(item: MasterDataItem, mode: "assessment" | "practice"): string {
  const context = item.subtopic ?? item.topic;
  const anchor = buildRecallAnchor(item);

  switch (item.itemType) {
    case "person":
      return `Who was ${item.person ?? anchor}?`;
    case "key_term":
      return mode === "practice"
        ? `Define ${item.term ?? anchor} in your own words.`
        : `What does ${item.term ?? anchor} mean?`;
    case "date":
      return mode === "practice"
        ? `Why does ${item.date ?? anchor} matter in ${context}?`
        : `What happened in ${item.date ?? anchor}?`;
    case "cause":
      return `What caused ${context}?`;
    case "event":
      return anchor && normalize(anchor) !== normalize(context)
        ? `What happened to ${anchor} in ${context}?`
        : `What happened in ${context}?`;
    case "consequence":
      return `What was one consequence of ${context}?`;
    case "legacy":
      return `What legacy did ${context} leave behind?`;
    case "fact":
    default:
      if (anchor && normalize(anchor) !== normalize(context) && normalize(anchor) !== normalize(item.topic)) {
        return mode === "practice"
          ? `Explain how ${anchor} relates to ${context}.`
          : `How does ${anchor} help explain ${context}?`;
      }

      return mode === "practice"
        ? `Explain one key idea about ${context} in your own words.`
        : `Explain one key idea about ${context}.`;
  }
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
  const prompt = isGenericRecallPrompt(item.prompt)
    ? buildSpecificRecallPrompt(item, "assessment")
    : item.prompt;

  return item.sourceRef ? `${prompt} [Source: ${item.sourceRef}]` : prompt;
}

function buildHint(item: MasterDataItem): string {
  const fact = item.content ?? item.canonicalAnswer;
  const sourceRef = item.sourceRef ? ` (${item.sourceRef})` : "";
  return `Hint${sourceRef}: ${fact}`;
}

function extractSelectablePhrases(value?: string): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(/,|;|\band\b|\bor\b/gi)
    .map((part) => part.trim())
    .filter((part) => part.length > 2);
}

function deriveAnswerText(item: {
  canonicalAnswer?: string;
  content?: string;
  date?: string;
  definition?: string;
  person?: string;
  subtopic?: string;
  term?: string;
  topic: string;
}): string {
  return (
    item.canonicalAnswer ??
    item.definition ??
    item.person ??
    item.date ??
    item.term ??
    item.content ??
    item.subtopic ??
    item.topic
  );
}

function shuffleSeeded<T>(values: readonly T[], seed: string): T[] {
  const next = [...values];
  let state = Array.from(seed).reduce((total, character) => total + character.charCodeAt(0), 0) || 1;

  for (let index = next.length - 1; index > 0; index -= 1) {
    state = (state * 1664525 + 1013904223) % 4294967296;
    const swapIndex = state % (index + 1);
    const current = next[index];
    next[index] = next[swapIndex] as T;
    next[swapIndex] = current as T;
  }

  return next;
}

function buildAssessmentOptions<
  TItem extends {
    canonicalAnswer?: string;
    content?: string;
    date?: string;
    definition?: string;
    id?: string;
    person?: string;
    subtopic?: string;
    term?: string;
    topic: string;
  }
>(
  item: TItem,
  sourceItems: readonly TItem[],
  index: number
): Pick<AssessmentItem, "correctOptionIds" | "options" | "questionType"> {
  const itemAnswerText = deriveAnswerText(item);
  const otherPhrases = unique(
    sourceItems
      .filter((candidate) => candidate.id !== item.id)
      .flatMap((candidate) => {
        const structuredPhrases = [
          candidate.term,
          candidate.person,
          candidate.date,
          candidate.subtopic
        ].filter((value): value is string => Boolean(value));

        const answerPhrases = extractSelectablePhrases(deriveAnswerText(candidate));
        return [...structuredPhrases, ...answerPhrases];
      })
      .filter((value) => normalize(value) !== normalize(itemAnswerText))
  );

  const correctPhrases = unique(
    [
      item.term,
      item.person,
      item.date,
      ...extractSelectablePhrases(itemAnswerText)
    ].filter((value): value is string => Boolean(value))
  );

  if (correctPhrases.length >= 2 && otherPhrases.length >= 2) {
    const correctOptions = correctPhrases.slice(0, 3).map((text, optionIndex) => ({
      id: `option_correct_${index + 1}_${optionIndex + 1}`,
      text
    }));
    const distractors = shuffleSeeded(otherPhrases, `${item.id}:multi-select`)
      .slice(0, 3)
      .map((text, optionIndex) => ({
        id: `option_distractor_${index + 1}_${optionIndex + 1}`,
        text
      }));
    const options = shuffleSeeded(
      [...correctOptions, ...distractors],
      `${item.id}:multi-select:options`
    );

    return {
      questionType: "multiple_select",
      options,
      correctOptionIds: correctOptions.map((option) => option.id)
    };
  }

  const correctOptionText =
    item.term ?? item.person ?? item.date ?? correctPhrases[0] ?? itemAnswerText;
  const distractorTexts = unique([
    ...shuffleSeeded(otherPhrases, `${item.id}:multiple-choice`).slice(0, 3),
    ...buildSyntheticDistractors(item, correctOptionText)
  ]).filter((value) => normalize(value) !== normalize(correctOptionText));
  if (correctOptionText && distractorTexts.length >= 2) {
    const options: AssessmentOption[] = shuffleSeeded(
      [
        { id: `option_correct_${index + 1}`, text: correctOptionText },
        ...distractorTexts.map((text, optionIndex) => ({
          id: `option_distractor_${index + 1}_${optionIndex + 1}`,
          text
        }))
      ],
      `${item.id}:multiple-choice:options`
    );

    const correct = options.find((option) => normalize(option.text) === normalize(correctOptionText));
    return {
      questionType: "multiple_choice",
      options,
      correctOptionIds: correct ? [correct.id] : []
    };
  }

  return {
    questionType: "free_form"
  };
}

function buildSyntheticDistractors<
  TItem extends {
    itemType?: string;
    person?: string;
    subtopic?: string;
    term?: string;
    topic: string;
  }
>(item: TItem, correctOptionText: string): readonly string[] {
  const focus = item.term ?? item.person ?? item.subtopic ?? item.topic;
  const synthetic = [
    item.itemType === "person"
      ? `${focus} was mainly known for something else.`
      : undefined,
    item.itemType === "key_term"
      ? `${focus} means a different idea in ${item.topic}.`
      : undefined,
    item.itemType === "date"
      ? `${focus} links to a different event in ${item.topic}.`
      : undefined,
    `A different detail from ${item.topic}.`,
    `${focus} is explained in another way.`,
    `An example that does not match ${focus}.`
  ].filter((value): value is string => Boolean(value));

  return synthetic.filter((value) => normalize(value) !== normalize(correctOptionText));
}

function buildLoopQuickCheck(
  item: {
    canonicalAnswer?: string;
    content?: string;
    date?: string;
    definition?: string;
    itemType?: string;
    person?: string;
    prompt?: string;
    sourceRef?: string;
    subtopic?: string;
    term?: string;
    topic: string;
  },
  sourceItems: readonly {
    canonicalAnswer?: string;
    content?: string;
    date?: string;
    definition?: string;
    itemType?: string;
    person?: string;
    prompt?: string;
    sourceRef?: string;
    subtopic?: string;
    term?: string;
    topic: string;
  }[],
  index: number
): {
  prompt: string;
  questionType?: AssessmentQuestionType;
  options?: AssessmentOption[];
  correctOptionIds?: string[];
  hint?: string;
  sourceFact?: string;
} {
  const questionShape = buildAssessmentOptions(item, sourceItems, index);
  const prompt =
    "prompt" in item && item.prompt
      ? item.prompt
      : item.itemType === "key_term"
        ? `Which definition best matches ${item.term ?? item.subtopic ?? item.topic}?`
        : item.itemType === "person"
          ? `Which statement best describes ${item.person ?? item.subtopic ?? item.topic}?`
          : item.itemType === "date"
            ? `Which event matches ${item.date ?? item.subtopic ?? item.topic}?`
            : `Which detail best explains ${item.subtopic ?? item.topic}?`;
  const sourceFact = item.content ?? item.definition ?? deriveAnswerText(item);
  const sourceRef = item.sourceRef ? ` (${item.sourceRef})` : "";

  return {
    prompt: sourceRef ? `${prompt} [Source: ${item.sourceRef}]` : prompt,
    questionType: questionShape.questionType,
    options: questionShape.options?.map((option) => ({ ...option })),
    correctOptionIds: questionShape.correctOptionIds ? [...questionShape.correctOptionIds] : undefined,
    hint: `Hint${sourceRef}: ${sourceFact}`,
    sourceFact
  };
}

function buildPracticeFront(item: MasterDataItem): string {
  return isGenericRecallPrompt(item.prompt)
    ? buildSpecificRecallPrompt(item, "practice")
    : item.prompt;
}

function buildPracticeBack(item: MasterDataItem): string {
  return item.content ?? item.definition ?? item.canonicalAnswer;
}

function isAssessmentAnswerCorrect(item: AssessmentItem, answer: string): boolean {
  if (item.questionType === "multiple_choice" || item.questionType === "multiple_select") {
    const submittedParts = unique(
      answer
        .split(/\s*\|\|\s*|\s*;\s*/g)
        .map((part) => part.trim())
        .filter(Boolean)
    );
    const selectedOptionIds = new Set(
      (item.options ?? [])
        .filter((option) =>
          submittedParts.some((part) => normalize(part) === normalize(option.text))
        )
        .map((option) => option.id)
    );
    const correctOptionIds = new Set(item.correctOptionIds ?? []);

    if (correctOptionIds.size > 0) {
      return (
        correctOptionIds.size === selectedOptionIds.size &&
        [...correctOptionIds].every((optionId) => selectedOptionIds.has(optionId))
      );
    }
  }

  return normalize(answer) === normalize(item.canonicalAnswer);
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
    materialInterpretation?: MasterDataInterpretationCandidate;
    learningLoopId: string;
    responses: readonly {
      answer: string;
      itemId: string;
    }[];
    sourceEvidence?: readonly {
      content: string;
      excerpt: string;
      sourceMasterDataItemId?: string;
      sourceRef: string;
      subtopic: string;
      topic: string;
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
      const correct = isAssessmentAnswerCorrect(item, answer);

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
    const selectedSourceItems = input.sourceItems.slice(0, input.context.questionCount);
    const items = selectedSourceItems.map((item, index) => {
      const questionShape = buildAssessmentOptions(item, input.sourceItems, index);

      return {
        id: `assessment_item_${index + 1}`,
        topic: item.topic,
        prompt: buildAssessmentPrompt(item),
        canonicalAnswer: item.canonicalAnswer,
        visibleMaterial: item.visibleMaterial,
        difficulty: difficultyScale[index] ?? "stretch",
        sourceMasterDataItemId: item.id,
        questionType: questionShape.questionType,
        options: questionShape.options,
        correctOptionIds: questionShape.correctOptionIds,
        hint: buildHint(item),
        sourceFact: item.content ?? item.canonicalAnswer
      };
    });

    return ok({
      runtimeTrace: {
        provider: "fixture",
        operation: "generateInitialAssessment",
        runtimeArtifacts: []
      },
      items,
      blueprint: buildAssessmentBlueprint({
        maxQuestionCount: input.context.questionCount,
        items,
        sourceItems: selectedSourceItems,
        topic: input.context.topic
      }),
      artifactContent: {
        topic: input.context.topic,
        questionCount: items.length,
        instructions: `Complete all ${items.length} questions without notes. The goal is to diagnose current understanding in ${input.context.topic}.`,
        items: items.map((item) => ({
          id: item.id,
          prompt: item.prompt,
          difficulty: item.difficulty,
          questionType: item.questionType,
          hint: item.hint
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

  generateLearningLoopBatch(input: {
    desiredLoopCount: number;
    learningLoopId: string;
    materialInterpretation: MasterDataInterpretationCandidate;
    targetLoopDurationMinutes: number;
    diagnosedGaps: readonly {
      description: string;
      evidence: string;
      id: string;
      severity: "high" | "medium" | "low";
      topic: string;
    }[];
    evaluation: {
      itemResults: readonly EvaluationItemResult[];
      score: number;
    };
    learnerYearGroup: string;
  }): Result<LearningLoopBatchGenerationCandidate> {
    if (input.diagnosedGaps.length === 0) {
      return err({
        code: "VALIDATION_ERROR",
        message: "At least one diagnosed gap is required to build a loop batch."
      });
    }

    const objectives = input.materialInterpretation.learningObjectives;
    const interpretationItems = input.materialInterpretation.items;
    const sourceMap = new Map(
      input.materialInterpretation.sourceMap.map((entry) => [entry.sourceRef, entry.excerpt])
    );
    const units: LearningLoopBatchGenerationCandidate["units"] = input.diagnosedGaps
      .slice(0, input.desiredLoopCount)
      .map((gap, index) => {
        const state: "ready" | "locked" = index === 0 ? "ready" : "locked";
        const matchingObjective =
          objectives.find((objective) =>
            normalize(objective.objective).includes(normalize(gap.topic))
          ) ?? objectives[index % objectives.length] ?? objectives[0];
        const objectiveRefs = matchingObjective ? [matchingObjective.id] : [];
        const objectiveSourceRefs = matchingObjective?.sourceRefs ?? [];
        const matchingItems = interpretationItems.filter((item) =>
          objectiveSourceRefs.includes(item.sourceRef) ||
          normalize(item.topic) === normalize(gap.topic) ||
          normalize(item.subtopic).includes(normalize(gap.description))
        );
        const sourceRefs = unique(
          (matchingItems.length > 0 ? matchingItems : interpretationItems.slice(index, index + 2)).map(
            (item) => item.sourceRef
          )
        ).slice(0, 3);
        const explanationSource = sourceRefs
          .map((sourceRef) => sourceMap.get(sourceRef))
          .find(Boolean) ?? input.materialInterpretation.learnerFacingMaterialSummary;
        const focus = matchingItems[0]?.subtopic ?? gap.topic;

        return {
          focus,
          reason: `${gap.description} was one of the least secure ideas in the check-up.`,
          objectiveRefs,
          sourceRefs,
          shortExplanation: explanationSource,
          learnerTask: `Spend ${input.targetLoopDurationMinutes} minutes explaining ${focus} in your own words, then write one example from the source without looking back.`,
          quickCheckQuestions: (matchingItems.length > 0 ? matchingItems : interpretationItems.slice(index, index + 2))
            .slice(0, 2)
            .map((item, questionIndex) => buildLoopQuickCheck(item, interpretationItems, questionIndex)),
          reviewItems:
            sourceRefs.length > 0
              ? [
                  {
                    prompt: `Which precise detail about ${focus} should you be able to recall without looking?`,
                    answer: explanationSource
                  }
                ]
              : [],
          targetKnowledgeGapIds: [gap.id],
          state
        };
      });

    return ok({
      runtimeTrace: {
        provider: "fixture",
        operation: "generateLearningLoopBatch",
        runtimeArtifacts: []
      },
      overview:
        input.evaluation.score < 0.5
          ? `Start with short loops on the biggest ${input.materialInterpretation.mainTopic} gaps before moving on.`
          : `Work through a short batch to tighten the remaining ${input.materialInterpretation.mainTopic} gaps.`,
      targetDurationMinutes: input.targetLoopDurationMinutes,
      units
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

function buildAssessmentBlueprint(input: {
  items: InitialAssessmentGenerationCandidate["items"];
  maxQuestionCount: number;
  sourceItems: readonly MasterDataItem[];
  topic: string;
}) {
  const coveredSubtopics = unique(
    input.sourceItems.map((item) => item.subtopic?.trim() || item.topic.trim()).filter(Boolean)
  );
  const sourceRefs = unique(
    input.sourceItems.map((item) => item.sourceRef).filter((value): value is string => Boolean(value))
  );
  const questionTypeMix = uniqueQuestionTypes(input.items.map((item) => item.questionType ?? "free_form"));
  const difficultyProfile = {
    easy: proportionOf(input.items, "easy"),
    medium: proportionOf(input.items, "medium"),
    stretch: proportionOf(input.items, "stretch")
  };

  return {
    questionCount: input.items.length,
    maxQuestionCount: input.maxQuestionCount,
    targetDurationMinutes: Math.max(5, input.items.length),
    questionTypeMix,
    coveredSubtopics,
    objectiveRefs: [],
    sourceRefs,
    difficultyProfile,
    rationale: `Use a short mixed diagnostic for ${input.topic} that covers distinct source-backed ideas before repeating a narrow fact.`
  };
}

function proportionOf(
  items: readonly { difficulty: "easy" | "medium" | "stretch" }[],
  difficulty: "easy" | "medium" | "stretch"
) {
  if (items.length === 0) {
    return 0;
  }

  return Number(
    (items.filter((item) => item.difficulty === difficulty).length / items.length).toFixed(2)
  );
}

function uniqueQuestionTypes(values: readonly AssessmentQuestionType[]): AssessmentQuestionType[] {
  return [...new Set(values)];
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
