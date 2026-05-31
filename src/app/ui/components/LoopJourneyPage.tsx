import React, { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { AssessmentItem } from "../../../domain/learning/Assessment.js";
import type { LearningLoopResumeResponse } from "../../../domain/study/LearningLoops.js";
import type { PracticeActivitySnapshot, ReviewConfidence } from "../../../domain/learning/PracticeActivity.js";
import type { LearningLoopUnitQuickCheckSnapshot } from "../../../domain/study/LoopBatches.js";
import type { StudyDay } from "../../../domain/study/StudySchedule.js";
import { studyDays } from "../../../domain/study/StudySchedule.js";
import type { ParsedMasterDataSummary } from "../../../modules/masterData/structuredRevision.js";
import type { DemoMasterDataDocument } from "../demo/demoMasterDataLibrary.js";

type JourneyStageKey =
  | "material-intake"
  | "material-summary"
  | "learner-focus"
  | "focus-areas"
  | "loop-batch"
  | "active-review"
  | "progress-update"
  | "next-loop";

export type JourneyStageState = "locked" | "current" | "complete" | "needs_attention";

export interface LoopJourneyStage {
  description: string;
  key: JourneyStageKey;
  label: string;
  state: JourneyStageState;
  summary: string;
}

export interface LoopJourneyModel {
  currentStageKey: JourneyStageKey;
  completedCount: number;
  stages: readonly LoopJourneyStage[];
}

interface CoachThreadMessage {
  body: string;
  role: "action" | "coach" | "learner";
  title: string;
}

interface AssessmentDraftAnswer {
  answerText: string;
  checked: boolean;
  hintShown: boolean;
  selectedOptionIds: string[];
}

interface LoopQuickCheckDraft extends AssessmentDraftAnswer {}

type LoopPace = "quick" | "standard" | "deep";

export interface LoopJourneyPageProps {
  assessmentError: string | null;
  assessmentPending: boolean;
  attemptError: string | null;
  attemptPending: boolean;
  completionError: string | null;
  completionPending: boolean;
  demoMaterials: readonly DemoMasterDataDocument[];
  demoTopics: readonly string[];
  loopState: LearningLoopResumeResponse | null;
  loopValues: {
    learnerName: string;
    objective: string;
    practiceCardCount: number;
    questionCount: number;
    topic: string;
    yearGroup: string;
    availableMinutesByDay: Record<StudyDay, number>;
  };
  masterDataError: string | null;
  masterDataPending: boolean;
  masterDataStatus: string | null;
  masterDataSummary: ParsedMasterDataSummary;
  masterDataSummaryMode: "legacy" | "structured";
  masterDataValues: {
    sourceName: string;
    lines: string;
  };
  practiceError: string | null;
  practicePending: boolean;
  resumeError: string | null;
  resumeLoopId: string;
  resumePending: boolean;
  selectedDemoMaterialId: string;
  studyPlanError: string | null;
  studyPlanPending: boolean;
  onApplyDemoSeed: () => void;
  onAssessmentSubmit: (
    responses: readonly {
      answer: string;
      itemId: string;
    }[]
  ) => Promise<void>;
  onBuildPlan: () => Promise<void>;
  onDayMinutesChange: (day: StudyDay, value: string) => void;
  onDemoUpload: () => Promise<void>;
  onGenerateCheckUp: () => Promise<void>;
  onGenerateReview: () => Promise<void>;
  onLoopValuesChange: (nextValues: LoopJourneyPageProps["loopValues"]) => void;
  onMasterDataSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onMasterDataValuesChange: (nextValues: LoopJourneyPageProps["masterDataValues"]) => void;
  onResumeLoopIdChange: (value: string) => void;
  onResumeSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onReviewSubmit: (
    responses: readonly {
      confidence: ReviewConfidence;
      note?: string;
      practiceItemId: string;
      responseText: string;
    }[]
  ) => Promise<void>;
  onStartNewRound: () => void;
  onSelectedDemoMaterialChange: (id: string) => void;
}

const stageOrder: readonly JourneyStageKey[] = [
  "material-intake",
  "material-summary",
  "learner-focus",
  "focus-areas",
  "loop-batch",
  "active-review",
  "progress-update",
  "next-loop"
];

function formatDateTime(value?: string): string {
  if (!value) {
    return "Not scheduled yet";
  }

  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function materialLineCount(lines: string): number {
  return lines
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean).length;
}

function deriveLoopPace(questionCount: number): LoopPace {
  if (questionCount <= 2) {
    return "quick";
  }

  if (questionCount <= 4) {
    return "standard";
  }

  return "deep";
}

function loopCountForPace(pace: LoopPace): number {
  switch (pace) {
    case "quick":
      return 2;
    case "standard":
      return 4;
    case "deep":
      return 6;
  }
}

function previewPrompts(lines: string): readonly string[] {
  return lines
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((line) => line.split("||")[0]?.trim() ?? line);
}

function renderSummaryList(title: string, values: readonly string[]) {
  if (values.length === 0) {
    return null;
  }

  const visibleValues = values.slice(0, 8);

  return (
    <section className="completion-card">
      <p className="subtle-heading">{title}</p>
      <div className="checkpoint-row">
        {visibleValues.map((value) => (
          <span key={value} className="checkpoint-chip">
            {value}
          </span>
        ))}
      </div>
      {values.length > visibleValues.length ? (
        <p>{values.length - visibleValues.length} more appear in the full material.</p>
      ) : null}
    </section>
  );
}

function remainingFocusAreas(loopState: LearningLoopResumeResponse | null): readonly string[] {
  if (!loopState?.latestActiveReviewSession) {
    return loopState?.knowledgeGaps.map((gap) => gap.description) ?? [];
  }

  const remainingIds = new Set(loopState.latestActiveReviewSession.remainingKnowledgeGapIds);
  const matches = loopState.knowledgeGaps
    .filter((gap) => remainingIds.has(gap.id))
    .map((gap) => gap.description);

  return matches.length > 0 ? matches : loopState.knowledgeGaps.map((gap) => gap.description);
}

function currentPracticeReviewed(loopState: LearningLoopResumeResponse | null): boolean {
  const currentPractice = loopState?.currentPracticeActivity;
  const latestReview = loopState?.latestActiveReviewSession;

  if (!currentPractice || !latestReview) {
    return false;
  }

  const lastReviewId = currentPractice.reviewSessionIds.at(-1);
  return lastReviewId === latestReview.id;
}

function currentLoopUnit(loopState: LearningLoopResumeResponse | null) {
  return (
    loopState?.loopBatch?.units.find((unit) => unit.state === "in_progress") ??
    loopState?.loopBatch?.units.find((unit) => unit.state === "ready")
  );
}

function buildCoachThread(input: {
  loopState: LearningLoopResumeResponse | null;
  loopValues: LoopJourneyPageProps["loopValues"];
  stage: LoopJourneyStage;
}): readonly CoachThreadMessage[] {
  const { loopState, loopValues, stage } = input;
  const learnerName = loopState?.workspace.learner.name || loopValues.learnerName;
  const topic = loopState?.learningLoop.topic || loopValues.topic;
  const focusAreas = remainingFocusAreas(loopState);
  const reviewCount = loopState?.currentPracticeActivity?.flashcardSet.cards.length ?? 0;
  const activeLoopUnit = currentLoopUnit(loopState);

  switch (stage.key) {
    case "material-intake":
      return [
        {
          role: "coach",
          title: "Coach",
          body: "Start by loading one clear set of material so this round stays focused."
        },
        {
          role: "action",
          title: "Next move",
          body: `Choose a demo document or paste the revision material for ${topic || "this topic"}.`
        }
      ];
    case "material-summary":
      return [
        {
          role: "coach",
          title: "Coach",
          body: stage.summary
        }
      ];
    case "learner-focus":
      return [
        {
          role: "coach",
          title: "Coach",
          body: "Set the round target and the time you can realistically protect this week."
        },
        {
          role: "learner",
          title: learnerName,
          body: loopValues.objective || `I want ${topic} to feel easier by the end of this round.`
        }
      ];
    case "focus-areas":
      return [
        {
          role: "coach",
          title: "Coach",
          body:
            focusAreas.length > 0
              ? `These are the ideas to tighten next: ${focusAreas.slice(0, 3).join("; ")}${focusAreas.length > 3 ? "..." : ""}`
              : "The check-up did not surface any major gaps for this round."
        }
      ];
    case "loop-batch":
      return [
        {
          role: "coach",
          title: "Coach",
          body: "Turn the diagnosed gaps into short loops you can work through straight away."
        },
        {
          role: "action",
          title: "Next move",
          body:
            activeLoopUnit
              ? `Start with ${activeLoopUnit.focus}. ${activeLoopUnit.learnerTask}`
              : stage.summary
        }
      ];
    case "active-review":
      return [
        {
          role: "coach",
          title: "Coach",
          body: `Work through ${reviewCount || loopValues.practiceCardCount} active recall prompt${(reviewCount || loopValues.practiceCardCount) === 1 ? "" : "s"} and answer before you reveal the back.`
        }
      ];
    case "progress-update":
      return [
        {
          role: "coach",
          title: "Coach",
          body: stage.summary
        }
      ];
    case "next-loop":
      return [
        {
          role: "coach",
          title: "Coach",
          body: "Use this review evidence to decide whether the next loop should revisit the same gaps or move forward."
        },
        {
          role: "action",
          title: "Next move",
          body: stage.summary
        }
      ];
  }
}

export function buildLoopJourneyModel(input: {
  loopState: LearningLoopResumeResponse | null;
  loopValues: LoopJourneyPageProps["loopValues"];
  masterDataStatus: string | null;
  masterDataValues: LoopJourneyPageProps["masterDataValues"];
}): LoopJourneyModel {
  const { loopState, loopValues, masterDataStatus, masterDataValues } = input;
  const savedMaterial = Boolean(loopState) || Boolean(masterDataStatus);
  const reviewedCurrentPractice = currentPracticeReviewed(loopState);
  const latestReview = loopState?.latestActiveReviewSession;
  const needsMoreWork = (latestReview?.remainingKnowledgeGapIds.length ?? 0) > 0;

  let currentStageKey: JourneyStageKey;
  if (!loopState) {
    currentStageKey = savedMaterial ? "learner-focus" : "material-intake";
  } else if (
    loopState.nextAction.kind === "track-mastery" ||
    loopState.learningLoop.phase === "mastery-tracking"
  ) {
    currentStageKey = "next-loop";
  } else if (loopState.currentAssessment && !loopState.latestEvaluation) {
    currentStageKey = "loop-batch";
  } else if (reviewedCurrentPractice) {
    currentStageKey = "next-loop";
  } else if (loopState.loopBatch) {
    currentStageKey = loopState.currentPracticeActivity ? "active-review" : "loop-batch";
  } else if (loopState.latestEvaluation && !loopState.loopBatch) {
    currentStageKey = "focus-areas";
  } else {
    currentStageKey = "next-loop";
  }

  const currentIndex = stageOrder.indexOf(currentStageKey);
  const previewedPrompts = previewPrompts(masterDataValues.lines);
  const materialCount = materialLineCount(masterDataValues.lines);
  const focusAreas = remainingFocusAreas(loopState);

  const summaryByStage: Record<JourneyStageKey, string> = {
    "material-intake": loopState
      ? `${loopState.learningLoop.topic} is loaded and ready for this round.`
      : savedMaterial
        ? `${materialCount} study prompt${materialCount === 1 ? "" : "s"} saved for ${loopValues.topic}.`
        : "Choose a topic and save the study material for this round.",
    "material-summary": loopState
      ? `This round is built around ${loopState.learningLoop.topic}.`
      : savedMaterial
        ? `${previewedPrompts.length} sample prompt${previewedPrompts.length === 1 ? "" : "s"} checked and ready.`
        : "Your saved study material will be checked here.",
    "learner-focus": loopState
      ? `${loopState.workspace.learner.name} is aiming for ${loopState.learningLoop.objective}.`
      : "Set the goal and choose how many short loops to start with.",
    "focus-areas": loopState?.latestEvaluation
      ? focusAreas.length > 0
        ? `${focusAreas.length} focus area${focusAreas.length === 1 ? "" : "s"} need more practice.`
        : "The latest round found secure recall across the current prompts."
      : "The next focus areas will appear after the first loop is complete.",
    "loop-batch": loopState?.loopBatch
      ? `${loopState.loopBatch.units.length} short loop${loopState.loopBatch.units.length === 1 ? "" : "s"} ready from the diagnosed gaps.`
      : "The next short loops will appear here once the material is ready.",
    "active-review": loopState?.currentPracticeActivity
      ? `${loopState.currentPracticeActivity.flashcardSet.cards.length} review prompt${loopState.currentPracticeActivity.flashcardSet.cards.length === 1 ? "" : "s"} prepared.`
      : "The review set will appear here once the plan is ready.",
    "progress-update": latestReview
      ? `${formatPercent(latestReview.masteryScore)} recall · ${focusAreas.length} area${focusAreas.length === 1 ? "" : "s"} still to tighten.`
      : "This stage will show what changed after the review.",
    "next-loop": latestReview
      ? needsMoreWork
        ? `Use this review to start the next round on ${formatDateTime(latestReview.nextReviewAt)}.`
        : `The next refresh is lined up for ${formatDateTime(latestReview.nextReviewAt)}.`
      : "The next round preview will appear here."
  };

  const stages = stageOrder.map((key, index) => {
    const descriptionByStage: Record<JourneyStageKey, string> = {
      "material-intake": "Add what you're studying",
      "material-summary": "Check what we found",
      "learner-focus": "Set your goal",
      "focus-areas": "See what to practise",
      "loop-batch": "Start a short loop",
      "active-review": "Do your review",
      "progress-update": "See what changed",
      "next-loop": "Next loop"
    };

    let state: JourneyStageState;
    if (index < currentIndex) {
      if (key === "focus-areas" && (loopState?.knowledgeGaps.length ?? 0) > 0) {
        state = "needs_attention";
      } else if (key === "progress-update" && needsMoreWork) {
        state = "needs_attention";
      } else {
        state = "complete";
      }
    } else if (index === currentIndex) {
      state = "current";
    } else {
      state = "locked";
    }

    if (key === "material-summary" && !savedMaterial && index > currentIndex) {
      state = "locked";
    }

    return {
      description: descriptionByStage[key],
      key,
      label: `${index + 1}. ${descriptionByStage[key]}`,
      state,
      summary: summaryByStage[key]
    };
  });

  return {
    currentStageKey,
    completedCount: stages.filter((stage) => stage.state === "complete" || stage.state === "needs_attention").length,
    stages
  };
}

function statusLabel(state: JourneyStageState): string {
  switch (state) {
    case "complete":
      return "Done";
    case "current":
      return "Now";
    case "locked":
      return "Later";
    case "needs_attention":
      return "Keep watch";
  }
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function answerTokenOverlap(left: string, right: string): number {
  const leftTokens = new Set(normalize(left).split(" ").filter(Boolean));
  const rightTokens = new Set(normalize(right).split(" ").filter(Boolean));

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return shared / Math.max(rightTokens.size, 1);
}

function quickCheckQuestionTypeLabel(question: LearningLoopUnitQuickCheckSnapshot): string {
  switch (question.questionType) {
    case "multiple_choice":
      return "Single choice";
    case "multiple_select":
      return "Multi-select";
    default:
      return "Free form";
  }
}

function buildAssessmentAnswerText(
  item: AssessmentItem,
  draft: AssessmentDraftAnswer | undefined
): string {
  if (!draft) {
    return "";
  }

  if (item.questionType === "multiple_choice" || item.questionType === "multiple_select") {
    return (item.options ?? [])
      .filter((option) => draft.selectedOptionIds.includes(option.id))
      .map((option) => option.text)
      .join(" || ");
  }

  return draft.answerText.trim();
}

function assessmentAnswerProvided(item: AssessmentItem, draft: AssessmentDraftAnswer | undefined): boolean {
  const answerText = buildAssessmentAnswerText(item, draft);
  return answerText.trim().length > 0;
}

function isAssessmentLikelyCorrect(item: AssessmentItem, draft: AssessmentDraftAnswer | undefined): boolean {
  if (!draft) {
    return false;
  }

  if ((item.questionType === "multiple_choice" || item.questionType === "multiple_select") && item.correctOptionIds?.length) {
    const selected = new Set(draft.selectedOptionIds);
    const correct = new Set(item.correctOptionIds);
    return (
      selected.size === correct.size &&
      [...correct].every((optionId) => selected.has(optionId))
    );
  }

  const answerText = buildAssessmentAnswerText(item, draft);
  const normalizedAnswer = normalize(answerText);
  const normalizedCanonical = normalize(item.canonicalAnswer);
  if (!normalizedAnswer || !normalizedCanonical) {
    return false;
  }

  if (
    normalizedAnswer === normalizedCanonical ||
    normalizedAnswer.includes(normalizedCanonical) ||
    normalizedCanonical.includes(normalizedAnswer)
  ) {
    return true;
  }

  return answerTokenOverlap(answerText, item.canonicalAnswer) >= 0.6;
}

function assessmentFeedbackCopy(item: AssessmentItem, draft: AssessmentDraftAnswer | undefined): {
  body: string;
  title: string;
  tone: "correct" | "needs_work";
} {
  if (isAssessmentLikelyCorrect(item, draft)) {
    return {
      title: "Secure enough to move on",
      body:
        item.sourceFact ??
        item.canonicalAnswer,
      tone: "correct"
    };
  }

  return {
    title: "Needs another look",
    body:
      item.hint ??
      item.sourceFact ??
      item.canonicalAnswer,
    tone: "needs_work"
  };
}

function useAssessmentAnswers(loopState: LearningLoopResumeResponse | null) {
  const assessment = loopState?.currentAssessment;
  const [answers, setAnswers] = useState<Record<string, AssessmentDraftAnswer>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  useEffect(() => {
    setAnswers(
      Object.fromEntries(
        (assessment?.items ?? []).map((item) => [
          item.id,
          {
            answerText: "",
            checked: false,
            hintShown: false,
            selectedOptionIds: []
          }
        ])
      )
    );
    setCurrentQuestionIndex(0);
  }, [assessment?.id]);

  return { answers, currentQuestionIndex, setAnswers, setCurrentQuestionIndex };
}

function useReviewResponses(practiceActivity: PracticeActivitySnapshot | undefined) {
  const [responses, setResponses] = useState<
    Record<string, { confidence: ReviewConfidence; note: string; responseText: string }>
  >({});

  useEffect(() => {
    setResponses(
      Object.fromEntries(
        (practiceActivity?.flashcardSet.cards ?? []).map((card) => [
          card.id,
          {
            responseText: "",
            confidence: "medium" as ReviewConfidence,
            note: ""
          }
        ])
      )
    );
  }, [practiceActivity?.id]);

  return { responses, setResponses };
}

function useLoopQuickCheckAnswers(loopState: LearningLoopResumeResponse | null) {
  const activeUnit = currentLoopUnit(loopState);
  const [answers, setAnswers] = useState<Record<string, LoopQuickCheckDraft>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const currentQuestion = activeUnit?.quickCheckQuestions[currentQuestionIndex];

  useEffect(() => {
    setAnswers(
      Object.fromEntries(
        (activeUnit?.quickCheckQuestions ?? []).map((question) => [
          question.id,
          {
            answerText: "",
            checked: false,
            hintShown: false,
            selectedOptionIds: []
          }
        ])
      )
    );
    setCurrentQuestionIndex(0);
  }, [activeUnit?.id]);

  return { activeUnit, answers, currentQuestion, currentQuestionIndex, setAnswers, setCurrentQuestionIndex };
}

function buildLoopQuickCheckAnswerText(
  question: LearningLoopUnitQuickCheckSnapshot,
  draft: LoopQuickCheckDraft | undefined
): string {
  if (!draft) {
    return "";
  }

  if (question.questionType === "multiple_choice" || question.questionType === "multiple_select") {
    return (question.options ?? [])
      .filter((option) => draft.selectedOptionIds.includes(option.id))
      .map((option) => option.text)
      .join(" || ");
  }

  return draft.answerText.trim();
}

function loopQuickCheckAnswerProvided(
  question: LearningLoopUnitQuickCheckSnapshot,
  draft: LoopQuickCheckDraft | undefined
): boolean {
  return buildLoopQuickCheckAnswerText(question, draft).trim().length > 0;
}

function isLoopQuickCheckLikelyCorrect(
  question: LearningLoopUnitQuickCheckSnapshot,
  draft: LoopQuickCheckDraft | undefined
): boolean {
  if (!draft) {
    return false;
  }

  if (
    (question.questionType === "multiple_choice" || question.questionType === "multiple_select") &&
    question.correctOptionIds?.length
  ) {
    const selected = new Set(draft.selectedOptionIds);
    const correct = new Set(question.correctOptionIds);
    return selected.size === correct.size && [...correct].every((optionId) => selected.has(optionId));
  }

  return false;
}

function loopQuickCheckFeedbackCopy(
  question: LearningLoopUnitQuickCheckSnapshot,
  draft: LoopQuickCheckDraft | undefined
): {
  body: string;
  title: string;
  tone: "correct" | "needs_work";
} {
  if (isLoopQuickCheckLikelyCorrect(question, draft)) {
    return {
      title: "Secure enough to move on",
      body: question.sourceFact ?? question.hint ?? "That matches the source-grounded answer.",
      tone: "correct"
    };
  }

  return {
    title: "Use the source fact",
    body: question.hint ?? question.sourceFact ?? "Check the short explanation, then try again in the review set.",
    tone: "needs_work"
  };
}

export function LoopJourneyPage(props: LoopJourneyPageProps) {
  const {
    assessmentError,
    assessmentPending,
    attemptError,
    attemptPending,
    completionError,
    completionPending,
    demoMaterials,
    demoTopics,
    loopState,
    loopValues,
    masterDataError,
    masterDataPending,
    masterDataStatus,
    masterDataSummary,
    masterDataSummaryMode,
    masterDataValues,
    practiceError,
    practicePending,
    resumeError,
    resumeLoopId,
    resumePending,
    selectedDemoMaterialId,
    studyPlanError,
    studyPlanPending,
    onApplyDemoSeed,
    onAssessmentSubmit,
    onBuildPlan,
    onDayMinutesChange,
    onDemoUpload,
    onGenerateCheckUp,
    onGenerateReview,
    onLoopValuesChange,
    onMasterDataSubmit,
    onMasterDataValuesChange,
    onResumeLoopIdChange,
    onResumeSubmit,
    onReviewSubmit,
    onStartNewRound,
    onSelectedDemoMaterialChange
  } = props;

  const journey = useMemo(
    () =>
      buildLoopJourneyModel({
        loopState,
        loopValues,
        masterDataStatus,
        masterDataValues
      }),
    [loopState, loopValues, masterDataStatus, masterDataValues]
  );
  const currentStageRef = useRef<HTMLElement | null>(null);
  const { answers, currentQuestionIndex, setAnswers, setCurrentQuestionIndex } = useAssessmentAnswers(loopState);
  const { responses, setResponses } = useReviewResponses(loopState?.currentPracticeActivity);
  const {
    activeUnit,
    answers: loopQuickCheckAnswers,
    currentQuestion: currentLoopQuickCheck,
    currentQuestionIndex: currentLoopQuickCheckIndex,
    setAnswers: setLoopQuickCheckAnswers,
    setCurrentQuestionIndex: setCurrentLoopQuickCheckIndex
  } = useLoopQuickCheckAnswers(loopState);
  const focusAreas = remainingFocusAreas(loopState);
  const improvedItems = loopState?.latestActiveReviewSession?.itemResults.filter((result) => result.correct) ?? [];
  const nextLoopStart = loopState?.latestActiveReviewSession?.nextReviewAt;
  const hasStructuredSummary =
    masterDataSummaryMode === "structured" &&
    Boolean(
      masterDataSummary.subject ||
        masterDataSummary.yearGroup ||
        masterDataSummary.mainTopic ||
        masterDataSummary.subtopics.length ||
        masterDataSummary.keyPeople.length ||
        masterDataSummary.keyTerms.length ||
        masterDataSummary.importantDates.length
    );

  useEffect(() => {
    currentStageRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }, [journey.currentStageKey]);

  async function handleAssessmentFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loopState?.currentAssessment) {
      return;
    }

    await onAssessmentSubmit(
      loopState.currentAssessment.items.map((item) => ({
        itemId: item.id,
        answer: buildAssessmentAnswerText(item, answers[item.id])
      }))
    );
  }

  async function handleReviewFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const practiceActivity = loopState?.currentPracticeActivity;
    if (!practiceActivity) {
      return;
    }

    await onReviewSubmit(
      practiceActivity.flashcardSet.cards.map((card) => ({
        practiceItemId: card.id,
        responseText: responses[card.id]?.responseText ?? "",
        confidence: responses[card.id]?.confidence ?? "medium",
        note: responses[card.id]?.note || undefined
      }))
    );
  }

  return (
    <div className="journey-shell">
      <header className="loop-header">
        <div className="loop-header-copy">
          <p className="eyebrow">loop.study</p>
          <h1>Move through one review loop at a time.</h1>
          <p className="lede">
            Completed steps fold upward, the live step opens up, and the next round is carried
            forward from the review evidence you just created.
          </p>
          <div className="header-tags">
            <span className="tag">
              {loopState?.workspace.learner.name || loopValues.learnerName} ·{" "}
              {loopState?.workspace.learner.yearGroup || loopValues.yearGroup}
            </span>
            <span className="tag">{loopState?.learningLoop.topic || loopValues.topic}</span>
            <span className="tag">
              Stage {journey.completedCount + 1} of {journey.stages.length}
            </span>
          </div>
        </div>

        <div className="header-utilities">
          <form className="utility-form" onSubmit={onResumeSubmit}>
            <label>
              Resume a saved round
              <input
                value={resumeLoopId}
                onChange={(event) => onResumeLoopIdChange(event.target.value)}
                placeholder="loop_..."
              />
            </label>
            <button type="submit" className="secondary-cta" disabled={resumePending}>
              {resumePending ? "Loading..." : "Resume"}
            </button>
          </form>
          {loopState ? (
            <button type="button" className="secondary-cta" onClick={onStartNewRound}>
              Start a new round
            </button>
          ) : null}
          <p className="hint">
            Demo materials available across {demoTopics.join(", ")}.
          </p>
          {resumeError ? <p className="error">{resumeError}</p> : null}
        </div>
      </header>

      <main className="journey-layout">
        <aside className="progress-rail" aria-label="Loop progress">
          <div className="rail-card">
            <p className="rail-title">This round</p>
            <ol className="rail-list">
              {journey.stages.map((stage) => (
                <li
                  key={stage.key}
                  className="rail-item"
                  data-stage-key={stage.key}
                  data-stage-state={stage.state}
                >
                  <span className="rail-index">{stage.label.split(".")[0]}</span>
                  <div>
                    <p>{stage.description}</p>
                    <span>{statusLabel(stage.state)}</span>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </aside>

        <section className="journey-column">
          {journey.stages.map((stage) => {
            const isCurrent = stage.state === "current";

            return (
              <article
                key={stage.key}
                ref={isCurrent ? currentStageRef : null}
                className="journey-stage"
                data-stage-key={stage.key}
                data-stage-state={stage.state}
              >
                <div className="journey-stage-head">
                  <div>
                    <p className="stage-label">{stage.label}</p>
                    <h2>{stage.description}</h2>
                  </div>
                  <span className="state-pill">{statusLabel(stage.state)}</span>
                </div>

                <p className="stage-summary">{stage.summary}</p>

                {isCurrent ? (
                  <div className="current-stage-panel">
                    <section className="coach-thread" aria-label="Coach thread">
                      {buildCoachThread({
                        loopState,
                        loopValues,
                        stage
                      }).map((message, index) => (
                        <div
                          key={`${stage.key}_${message.role}_${index}`}
                          className="coach-bubble"
                          data-coach-role={message.role}
                        >
                          <p className="coach-bubble-label">{message.title}</p>
                          <p className="coach-bubble-body">{message.body}</p>
                        </div>
                      ))}
                    </section>

                    {stage.key === "material-intake" ? (
                      <form className="stage-form" onSubmit={onMasterDataSubmit}>
                        <div className="split-callout">
                          <div>
                            <p className="subtle-heading">Source pack</p>
                            <p>
                              Save the prompts, answers, and visible notes that should shape this
                              round.
                            </p>
                          </div>
                        </div>

                        <section className="completion-card">
                          <p className="subtle-heading">Choose a demo document</p>
                          <div className="field-grid">
                            <label>
                              Demo material
                              <select
                                value={selectedDemoMaterialId}
                                onChange={(event) =>
                                  onSelectedDemoMaterialChange(event.target.value)
                                }
                              >
                                {demoMaterials.map((material) => (
                                  <option key={material.id} value={material.id}>
                                    {material.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <div className="journey-list compact-list">
                              {demoMaterials
                                .filter((material) => material.id === selectedDemoMaterialId)
                                .map((material) => (
                                  <div key={material.id} className="list-card">
                                    <p className="list-title">{material.label}</p>
                                    <p>
                                      {material.subject} · {material.yearGroup}
                                    </p>
                                    <p>Main topic: {material.topic}</p>
                                  </div>
                                ))}
                            </div>
                          </div>
                          <div className="checkpoint-row">
                            <button type="button" className="secondary-cta" onClick={onApplyDemoSeed}>
                              Use this demo document
                            </button>
                            <button
                              type="button"
                              className="secondary-cta"
                              disabled={masterDataPending}
                              onClick={() => void onDemoUpload()}
                            >
                              {masterDataPending ? "Saving..." : "Save this demo document"}
                            </button>
                          </div>
                        </section>

                        <div className="field-grid">
                          <label>
                            Topic
                            <input
                              value={loopValues.topic}
                              onChange={(event) =>
                                onLoopValuesChange({
                                  ...loopValues,
                                  topic: event.target.value
                                })
                              }
                            />
                          </label>

                          <label>
                            Study pack name
                            <input
                              value={masterDataValues.sourceName}
                              onChange={(event) =>
                                onMasterDataValuesChange({
                                  ...masterDataValues,
                                  sourceName: event.target.value
                                })
                              }
                            />
                          </label>
                        </div>

                        <label>
                          Paste study material
                          <textarea
                            rows={10}
                            value={masterDataValues.lines}
                            onChange={(event) =>
                              onMasterDataValuesChange({
                                ...masterDataValues,
                                lines: event.target.value
                              })
                            }
                          />
                        </label>

                        <p className="hint">
                          Paste your own notes or use <code>prompt || answer || visible note || optional keywords</code>.
                        </p>
                        {hasStructuredSummary ? (
                          <section className="completion-card">
                            <p className="subtle-heading">Detected from this document</p>
                            <div className="journey-list compact-list">
                              <div className="list-card">
                                <p className="list-title">
                                  {masterDataSummary.mainTopic ?? loopValues.topic}
                                </p>
                                <p>
                                  {masterDataSummary.subject ?? "Unknown subject"} ·{" "}
                                  {masterDataSummary.yearGroup ?? loopValues.yearGroup}
                                </p>
                                {masterDataSummary.documentTitle ? (
                                  <p>Title: {masterDataSummary.documentTitle}</p>
                                ) : null}
                              </div>
                            </div>
                            {renderSummaryList("Subtopics found", masterDataSummary.subtopics)}
                            {renderSummaryList("Key people", masterDataSummary.keyPeople)}
                            {renderSummaryList("Key terms", masterDataSummary.keyTerms)}
                            {renderSummaryList("Important dates", masterDataSummary.importantDates)}
                            {renderSummaryList(
                              "Learning objectives",
                              masterDataSummary.learningObjectives ?? []
                            )}
                            {renderSummaryList(
                              "Processes",
                              masterDataSummary.processes ?? []
                            )}
                            {masterDataSummary.learnerFacingMaterialSummary ? (
                              <section className="completion-card">
                                <p className="subtle-heading">Coach summary</p>
                                <p>{masterDataSummary.learnerFacingMaterialSummary}</p>
                              </section>
                            ) : null}
                          </section>
                        ) : null}
                        <button
                          type="submit"
                          className="primary-cta"
                          data-primary-cta="true"
                          disabled={masterDataPending}
                        >
                          {masterDataPending ? "Saving..." : "Save this study pack"}
                        </button>
                        {masterDataStatus ? <p className="status">{masterDataStatus}</p> : null}
                        {masterDataError ? <p className="error">{masterDataError}</p> : null}
                      </form>
                    ) : null}

                    {stage.key === "learner-focus" ? (
                      <div className="stage-form">
                        <div className="field-grid">
                          <label>
                            Learner
                            <input
                              value={loopValues.learnerName}
                              onChange={(event) =>
                                onLoopValuesChange({
                                  ...loopValues,
                                  learnerName: event.target.value
                                })
                              }
                            />
                          </label>

                          <label>
                            Year group
                            <input
                              value={loopValues.yearGroup}
                              onChange={(event) =>
                                onLoopValuesChange({
                                  ...loopValues,
                                  yearGroup: event.target.value
                                })
                              }
                            />
                          </label>
                        </div>

                        <label>
                          What should feel easier by the end of this round?
                          <textarea
                            rows={4}
                            value={loopValues.objective}
                            onChange={(event) =>
                              onLoopValuesChange({
                                ...loopValues,
                                objective: event.target.value
                              })
                            }
                          />
                        </label>

                        <div className="field-grid">
                          <label>
                            Round pace
                            <select
                              value={deriveLoopPace(loopValues.questionCount)}
                              onChange={(event) =>
                                onLoopValuesChange({
                                  ...loopValues,
                                  questionCount: loopCountForPace(event.target.value as LoopPace)
                                })
                              }
                            >
                              <option value="quick">Quick</option>
                              <option value="standard">Standard</option>
                              <option value="deep">Deep</option>
                            </select>
                            <span className="hint">
                              Quick starts with a short batch. Deep queues more loops before the round adapts again.
                            </span>
                          </label>

                          <label>
                            Review set size
                            <input
                              type="number"
                              min={1}
                              max={12}
                              value={loopValues.practiceCardCount}
                              onChange={(event) =>
                                onLoopValuesChange({
                                  ...loopValues,
                                  practiceCardCount: Number(event.target.value) || 1
                                })
                              }
                            />
                          </label>
                        </div>

                        <button
                          type="button"
                          className="primary-cta"
                          data-primary-cta="true"
                          disabled={assessmentPending}
                          onClick={() => void onGenerateCheckUp()}
                        >
                          {assessmentPending ? "Getting ready..." : "Start my first loop"}
                        </button>
                        {assessmentError ? <p className="error">{assessmentError}</p> : null}
                      </div>
                    ) : null}

                    {stage.key === "focus-areas" ? (
                      <div className="stage-form">
                        <div className="score-banner">
                          <p className="subtle-heading">Current check-up score</p>
                          <strong>{formatPercent(loopState?.latestEvaluation?.score ?? 0)}</strong>
                        </div>
                        {loopState?.latestEvaluation && loopState.currentAssessment ? (
                          <div className="journey-list compact-list">
                            {loopState.latestEvaluation.itemResults.map((result) => {
                              const item = loopState.currentAssessment?.items.find(
                                (candidate) => candidate.id === result.itemId
                              );
                              if (!item) {
                                return null;
                              }

                              return (
                                <div
                                  key={result.itemId}
                                  className="list-card"
                                  data-feedback-tone={result.correct ? "correct" : "needs_work"}
                                >
                                  <p className="list-title">{item.prompt}</p>
                                  <p>{result.feedback}</p>
                                  <div className="checkpoint-row">
                                    <span
                                      className={
                                        result.correct
                                          ? "checkpoint-chip checkpoint-chip-success"
                                          : "checkpoint-chip checkpoint-chip-warning"
                                      }
                                    >
                                      {result.correct ? "Secure" : "Needs work"}
                                    </span>
                                    <span className="checkpoint-chip">{item.difficulty}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                        <div className="journey-list">
                          {(loopState?.knowledgeGaps ?? []).map((gap) => (
                            <div key={gap.id} className="list-card">
                              <p className="list-title">{gap.description}</p>
                              <p>Shown by the latest check-up prompts in {gap.topic}.</p>
                            </div>
                          ))}
                        </div>
                        {!loopState?.loopBatch ? (
                          <>
                            <p className="journey-note">
                              If short loop batching is unavailable for an older round, you can still
                              use the legacy study-plan route.
                            </p>
                            <button
                              type="button"
                              className="secondary-cta"
                              disabled={studyPlanPending}
                              onClick={() => void onBuildPlan()}
                            >
                              {studyPlanPending ? "Planning..." : "Use the legacy plan fallback"}
                            </button>
                            {studyPlanError ? <p className="error">{studyPlanError}</p> : null}
                          </>
                        ) : null}
                      </div>
                    ) : null}

                    {stage.key === "loop-batch" ? (
                      <div className="stage-form">
                        <p className="journey-note">
                          {loopState?.loopBatch?.overview ??
                            "The next short loops will appear here."}
                        </p>
                        {activeUnit ? (
                          <section className="quiz-game">
                            <div className="quiz-progress">
                              <div className="quiz-track" aria-hidden="true">
                                <div
                                  className="quiz-track-fill"
                                  style={{
                                    width: `${((currentLoopQuickCheckIndex + 1) / Math.max(activeUnit.quickCheckQuestions.length, 1)) * 100}%`
                                  }}
                                />
                              </div>
                              <span>
                                Quick check {Math.min(currentLoopQuickCheckIndex + 1, activeUnit.quickCheckQuestions.length)} of{" "}
                                {activeUnit.quickCheckQuestions.length}
                              </span>
                            </div>

                            {currentLoopQuickCheck ? (
                              <div className="quiz-card">
                                <p className="subtle-heading">{activeUnit.focus}</p>
                                <p className="list-title">{currentLoopQuickCheck.prompt}</p>
                                <p className="hint">
                                  {quickCheckQuestionTypeLabel(currentLoopQuickCheck)}
                                </p>

                                {currentLoopQuickCheck.questionType === "multiple_choice" ||
                                currentLoopQuickCheck.questionType === "multiple_select" ? (
                                  <div className="quiz-options">
                                    {(currentLoopQuickCheck.options ?? []).map((option) => {
                                      const isMulti = currentLoopQuickCheck.questionType === "multiple_select";
                                      const selected =
                                        loopQuickCheckAnswers[currentLoopQuickCheck.id]?.selectedOptionIds.includes(
                                          option.id
                                        ) ?? false;

                                      return (
                                        <button
                                          key={option.id}
                                          type="button"
                                          className="option-card"
                                          data-option-selected={selected}
                                          onClick={() =>
                                            setLoopQuickCheckAnswers((current) => {
                                              const questionId = currentLoopQuickCheck.id;
                                              const existing = current[questionId] ?? {
                                                answerText: "",
                                                checked: false,
                                                hintShown: false,
                                                selectedOptionIds: []
                                              };
                                              const nextSelected = isMulti
                                                ? selected
                                                  ? existing.selectedOptionIds.filter((id) => id !== option.id)
                                                  : [...existing.selectedOptionIds, option.id]
                                                : [option.id];

                                              return {
                                                ...current,
                                                [questionId]: {
                                                  ...existing,
                                                  checked: false,
                                                  selectedOptionIds: nextSelected
                                                }
                                              };
                                            })
                                          }
                                        >
                                          {option.text}
                                        </button>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <label>
                                    Your answer
                                    <textarea
                                      rows={3}
                                      value={loopQuickCheckAnswers[currentLoopQuickCheck.id]?.answerText ?? ""}
                                      onChange={(event) =>
                                        setLoopQuickCheckAnswers((current) => ({
                                          ...current,
                                          [currentLoopQuickCheck.id]: {
                                            answerText: event.target.value,
                                            checked: false,
                                            hintShown: current[currentLoopQuickCheck.id]?.hintShown ?? false,
                                            selectedOptionIds: []
                                          }
                                        }))
                                      }
                                    />
                                  </label>
                                )}

                                <div className="quiz-utility-row">
                                  <button
                                    type="button"
                                    className="secondary-cta"
                                    onClick={() =>
                                      setLoopQuickCheckAnswers((current) => ({
                                        ...current,
                                        [currentLoopQuickCheck.id]: {
                                          answerText: current[currentLoopQuickCheck.id]?.answerText ?? "",
                                          checked: current[currentLoopQuickCheck.id]?.checked ?? false,
                                          hintShown: true,
                                          selectedOptionIds:
                                            current[currentLoopQuickCheck.id]?.selectedOptionIds ?? []
                                        }
                                      }))
                                    }
                                  >
                                    Show hint
                                  </button>
                                  <button
                                    type="button"
                                    className="secondary-cta"
                                    disabled={
                                      !loopQuickCheckAnswerProvided(
                                        currentLoopQuickCheck,
                                        loopQuickCheckAnswers[currentLoopQuickCheck.id]
                                      )
                                    }
                                    onClick={() =>
                                      setLoopQuickCheckAnswers((current) => ({
                                        ...current,
                                        [currentLoopQuickCheck.id]: {
                                          answerText: current[currentLoopQuickCheck.id]?.answerText ?? "",
                                          checked: true,
                                          hintShown: current[currentLoopQuickCheck.id]?.hintShown ?? false,
                                          selectedOptionIds:
                                            current[currentLoopQuickCheck.id]?.selectedOptionIds ?? []
                                        }
                                      }))
                                    }
                                  >
                                    Check answer
                                  </button>
                                </div>

                                {loopQuickCheckAnswers[currentLoopQuickCheck.id]?.hintShown ? (
                                  <div className="quiz-hint">
                                    <p className="subtle-heading">Hint</p>
                                    <p>
                                      {currentLoopQuickCheck.hint ??
                                        currentLoopQuickCheck.sourceFact ??
                                        activeUnit.shortExplanation}
                                    </p>
                                  </div>
                                ) : null}

                                {loopQuickCheckAnswers[currentLoopQuickCheck.id]?.checked ? (
                                  <div
                                    className="quiz-feedback"
                                    data-feedback-tone={
                                      loopQuickCheckFeedbackCopy(
                                        currentLoopQuickCheck,
                                        loopQuickCheckAnswers[currentLoopQuickCheck.id]
                                      ).tone
                                    }
                                  >
                                    <p className="subtle-heading">
                                      {
                                        loopQuickCheckFeedbackCopy(
                                          currentLoopQuickCheck,
                                          loopQuickCheckAnswers[currentLoopQuickCheck.id]
                                        ).title
                                      }
                                    </p>
                                    <p>
                                      {
                                        loopQuickCheckFeedbackCopy(
                                          currentLoopQuickCheck,
                                          loopQuickCheckAnswers[currentLoopQuickCheck.id]
                                        ).body
                                      }
                                    </p>
                                  </div>
                                ) : null}

                                <div className="quiz-nav">
                                  <button
                                    type="button"
                                    className="secondary-cta"
                                    disabled={currentLoopQuickCheckIndex === 0}
                                    onClick={() =>
                                      setCurrentLoopQuickCheckIndex((current) => Math.max(current - 1, 0))
                                    }
                                  >
                                    Back
                                  </button>
                                  <div className="quiz-dots">
                                    {activeUnit.quickCheckQuestions.map((question, index) => {
                                      const draft = loopQuickCheckAnswers[question.id];
                                      const dotState =
                                        index === currentLoopQuickCheckIndex
                                          ? "current"
                                          : draft?.checked
                                            ? "done"
                                            : loopQuickCheckAnswerProvided(question, draft)
                                              ? "started"
                                              : "idle";

                                      return (
                                        <button
                                          key={question.id}
                                          type="button"
                                          className="quiz-dot"
                                          data-dot-state={dotState}
                                          onClick={() => setCurrentLoopQuickCheckIndex(index)}
                                        />
                                      );
                                    })}
                                  </div>
                                  <button
                                    type="button"
                                    className="secondary-cta"
                                    disabled={
                                      currentLoopQuickCheckIndex >= activeUnit.quickCheckQuestions.length - 1
                                    }
                                    onClick={() =>
                                      setCurrentLoopQuickCheckIndex((current) =>
                                        Math.min(current + 1, activeUnit.quickCheckQuestions.length - 1)
                                      )
                                    }
                                  >
                                    Next
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </section>
                        ) : null}
                        <div className="journey-list compact-list">
                          {loopState?.loopBatch?.units.map((unit) => (
                            <div key={unit.id} className="list-card">
                              <p className="list-title">
                                {unit.focus} · {unit.state.replace("_", " ")}
                              </p>
                              <p>{unit.reason}</p>
                              <p>{unit.shortExplanation}</p>
                              <p>
                                <strong>Do this:</strong> {unit.learnerTask}
                              </p>
                              <div className="checkpoint-row">
                                {unit.sourceRefs.map((sourceRef) => (
                                  <span key={sourceRef} className="checkpoint-chip">
                                    {sourceRef}
                                  </span>
                                ))}
                              </div>
                              <div className="journey-list compact-list">
                                {unit.quickCheckQuestions.map((question) => (
                                  <div key={question.id} className="list-card">
                                    <p className="list-title">Quick check</p>
                                    <p>{question.prompt}</p>
                                    {question.questionType ? (
                                      <p className="hint">
                                        {question.questionType === "multiple_choice"
                                          ? "Single choice"
                                          : question.questionType === "multiple_select"
                                            ? "Multi-select"
                                            : "Free form"}
                                      </p>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                              {unit.reviewItems.length ? (
                                <div className="checkpoint-row">
                                  {unit.reviewItems.map((item) => (
                                    <span key={item.id} className="checkpoint-chip">
                                      {item.prompt}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          className="primary-cta"
                          data-primary-cta="true"
                          disabled={practicePending}
                          onClick={() => void onGenerateReview()}
                        >
                          {practicePending ? "Starting..." : "Start this loop"}
                        </button>
                        {practiceError ? <p className="error">{practiceError}</p> : null}
                      </div>
                    ) : null}

                    {stage.key === "active-review" ? (
                      loopState?.currentPracticeActivity ? (
                        <form className="stage-form" onSubmit={handleReviewFormSubmit}>
                          <p className="journey-note">
                            {loopState.currentPracticeActivity.flashcardSet.instructions}
                          </p>
                          {loopState.currentPracticeActivity.flashcardSet.cards.map((card, index) => (
                            <div key={card.id} className="review-card">
                              <p className="list-title">Prompt {index + 1}</p>
                              <p>{card.front}</p>
                              <label>
                                Your answer
                                <textarea
                                  rows={3}
                                  value={responses[card.id]?.responseText ?? ""}
                                  onChange={(event) =>
                                    setResponses((current) => ({
                                      ...current,
                                      [card.id]: {
                                        confidence: current[card.id]?.confidence ?? "medium",
                                        note: current[card.id]?.note ?? "",
                                        responseText: event.target.value
                                      }
                                    }))
                                  }
                                />
                              </label>
                              <div className="field-grid">
                                <label>
                                  How sure are you?
                                  <select
                                    value={responses[card.id]?.confidence ?? "medium"}
                                    onChange={(event) =>
                                      setResponses((current) => ({
                                        ...current,
                                        [card.id]: {
                                          confidence: event.target.value as ReviewConfidence,
                                          note: current[card.id]?.note ?? "",
                                          responseText: current[card.id]?.responseText ?? ""
                                        }
                                      }))
                                    }
                                  >
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                  </select>
                                </label>

                                <label>
                                  Optional note
                                  <input
                                    value={responses[card.id]?.note ?? ""}
                                    onChange={(event) =>
                                      setResponses((current) => ({
                                        ...current,
                                        [card.id]: {
                                          confidence: current[card.id]?.confidence ?? "medium",
                                          note: event.target.value,
                                          responseText: current[card.id]?.responseText ?? ""
                                        }
                                      }))
                                    }
                                  />
                                </label>
                              </div>
                            </div>
                          ))}
                          <button
                            type="submit"
                            className="primary-cta"
                            data-primary-cta="true"
                            disabled={completionPending}
                          >
                            {completionPending ? "Saving..." : "Finish this review"}
                          </button>
                          {completionError ? <p className="error">{completionError}</p> : null}
                        </form>
                      ) : null
                    ) : null}

                    {stage.key === "next-loop" ? (
                      <div className="stage-form">
                        <section className="completion-card">
                          <p className="subtle-heading">What improved</p>
                          <div className="journey-list compact-list">
                            {improvedItems.length > 0 ? (
                              improvedItems.map((item) => (
                                <div key={item.practiceItemId} className="list-card">
                                  <p className="list-title">{item.prompt}</p>
                                  <p>Matched the expected answer with {item.confidence} confidence.</p>
                                </div>
                              ))
                            ) : (
                              <div className="list-card">
                                <p>No secure answers yet. The next round should stay narrow and focused.</p>
                              </div>
                            )}
                          </div>
                        </section>

                        <section className="completion-card">
                          <p className="subtle-heading">What still needs work</p>
                          <div className="checkpoint-row">
                            {focusAreas.length > 0 ? (
                              focusAreas.map((area) => (
                                <span key={area} className="checkpoint-chip checkpoint-chip-warning">
                                  {area}
                                </span>
                              ))
                            ) : (
                              <span className="checkpoint-chip checkpoint-chip-success">
                                Nothing urgent right now
                              </span>
                            )}
                          </div>
                        </section>

                        <section className="completion-card next-loop-preview">
                          <p className="subtle-heading">When the next loop starts</p>
                          <p className="next-loop-time">{formatDateTime(nextLoopStart)}</p>
                          <p>
                            The next round starts from the evidence in this review, not from a blank
                            slate.
                          </p>
                        </section>

                        {focusAreas.length > 0 ? (
                          <button
                            type="button"
                            className="primary-cta"
                            data-primary-cta="true"
                            disabled={practicePending}
                            onClick={() => void onGenerateReview()}
                          >
                            {practicePending ? "Starting..." : "Start the next loop"}
                          </button>
                        ) : null}
                        {practiceError ? <p className="error">{practiceError}</p> : null}
                      </div>
                    ) : null}
                  </div>
                ) : stage.key === "material-summary" && stage.state !== "locked" ? (
                  <div className="collapsed-preview">
                    {hasStructuredSummary ? (
                      <div className="journey-list compact-list">
                        <div className="list-card">
                          <p className="list-title">
                            {masterDataSummary.mainTopic ?? loopValues.topic}
                          </p>
                          <p>
                            {masterDataSummary.subject ?? "Unknown subject"} ·{" "}
                            {masterDataSummary.yearGroup ?? loopValues.yearGroup}
                          </p>
                        </div>
                        {renderSummaryList("Subtopics found", masterDataSummary.subtopics)}
                        {renderSummaryList("Key people", masterDataSummary.keyPeople)}
                        {renderSummaryList("Key terms", masterDataSummary.keyTerms)}
                        {renderSummaryList("Important dates", masterDataSummary.importantDates)}
                        {renderSummaryList(
                          "Learning objectives",
                          masterDataSummary.learningObjectives ?? []
                        )}
                        {renderSummaryList("Processes", masterDataSummary.processes ?? [])}
                      </div>
                    ) : (
                      <div className="checkpoint-row">
                        {previewPrompts(masterDataValues.lines).map((prompt) => (
                          <span key={prompt} className="checkpoint-chip">
                            {prompt}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      </main>
    </div>
  );
}
