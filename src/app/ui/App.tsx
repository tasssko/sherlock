import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { UploadMasterDataCommand } from "../../domain/study/MasterDataUpload.js";
import type { CompletePracticeActivityCommand } from "../../domain/study/PracticeActivities.js";
import type { LearningLoopResumeResponse } from "../../domain/study/LearningLoops.js";
import type { StudyDay } from "../../domain/study/StudySchedule.js";
import {
  decodeInterpretationSummaryFromItems,
  type MasterDataInterpretationSummary
} from "../../modules/masterData/MasterDataInterpretation.js";
import { parseMasterDataInput } from "../../modules/masterData/structuredRevision.js";
import {
  completePracticeActivity,
  generatePracticeActivity,
  generateStudyPlan,
  getLearningLoop,
  startLearningLoop,
  submitAssessmentAttempt,
  uploadMasterData
} from "./api/loopStudyClient.js";
import { LoopJourneyPage } from "./components/LoopJourneyPage.js";
import {
  demoMasterDataLibrary,
  findDemoMasterDataDocument,
  type DemoMasterDataDocument
} from "./demo/demoMasterDataLibrary.js";
import { getPersistentPlayfulLearnerName } from "./playfulLearnerName.js";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:3001";
const lastLoopStorageKey = "loop.study:last-learning-loop-id";
const defaultDemoDocument =
  findDemoMasterDataDocument("history-mary-i-md") ?? demoMasterDataLibrary[0];

const initialMinutes: Record<StudyDay, number> = {
  Monday: 30,
  Tuesday: 30,
  Wednesday: 30,
  Thursday: 30,
  Friday: 30,
  Saturday: 60,
  Sunday: 0
};

export interface LoopSetupValues {
  learnerName: string;
  objective: string;
  practiceCardCount: number;
  questionCount: number;
  topic: string;
  yearGroup: string;
  availableMinutesByDay: Record<StudyDay, number>;
}

export interface MasterDataPasteValues {
  sourceName: string;
  lines: string;
}

function buildLoopObjective(topic: string): string {
  return `Build more secure recall in ${topic} through short study sessions and active review.`;
}

const initialMasterDataValues: MasterDataPasteValues = {
  sourceName: defaultDemoDocument?.sourceName ?? "Year 7 study material",
  lines: ""
};

function buildInitialLoopValues(): LoopSetupValues {
  const storage = typeof window === "undefined" ? null : window.localStorage;

  return {
    learnerName: getPersistentPlayfulLearnerName(storage),
    yearGroup: defaultDemoDocument?.yearGroup ?? "Year 7",
    topic: defaultDemoDocument?.topic ?? "Mary I",
    objective: buildLoopObjective(defaultDemoDocument?.topic ?? "Mary I"),
    questionCount: 8,
    practiceCardCount: 8,
    availableMinutesByDay: initialMinutes
  };
}

function buildUploadCommand(input: {
  fallbackSubject?: string;
  fallbackTopic: string;
  fallbackYearGroup?: string;
  lines: string;
  sourceName: string;
}): UploadMasterDataCommand {
  const parsed = parseMasterDataInput(input);
  const detectedTopic = parsed.summary.mainTopic?.trim() || input.fallbackTopic;
  const fallbackItem =
    parsed.items[0] ??
    {
      topic: detectedTopic,
      prompt: `What is one key idea from ${detectedTopic}?`,
      canonicalAnswer:
        input.lines
          .split(/\r?\n/)
          .map((line) => line.trim())
          .find(Boolean) ?? input.sourceName,
      visibleMaterial: input.lines.slice(0, 280) || input.sourceName
    };

  return {
    rawSourceContent: input.lines,
    contentType: input.lines.includes("||") ? "text/plain" : "text/markdown",
    learnerYearGroup: input.fallbackYearGroup,
    userHints: {
      subject: input.fallbackSubject,
      topic: detectedTopic
    },
    sourceName: input.sourceName,
    items: (parsed.items.length > 0 ? parsed.items : [fallbackItem]).map((item) => ({
      ...item,
      topic: detectedTopic || item.topic
    }))
  };
}

function applyDemoDocumentToForm(document: DemoMasterDataDocument): {
  loopValues: Pick<LoopSetupValues, "objective" | "topic" | "yearGroup">;
  masterDataValues: MasterDataPasteValues;
} {
  return {
    loopValues: {
      topic: document.topic,
      yearGroup: document.yearGroup,
      objective: buildLoopObjective(document.topic)
    },
    masterDataValues: {
      sourceName: document.sourceName,
      lines: document.content
    }
  };
}

export function App() {
  const [loopValues, setLoopValues] = useState<LoopSetupValues>(() => buildInitialLoopValues());
  const [masterDataValues, setMasterDataValues] = useState(initialMasterDataValues);
  const [selectedDemoMaterialId, setSelectedDemoMaterialId] = useState(defaultDemoDocument?.id ?? "");
  const [resumeLoopId, setResumeLoopId] = useState("");
  const [resumePending, setResumePending] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [loopState, setLoopState] = useState<LearningLoopResumeResponse | null>(null);
  const [uploadedMasterDataSummary, setUploadedMasterDataSummary] =
    useState<MasterDataInterpretationSummary | null>(null);
  const [masterDataStatus, setMasterDataStatus] = useState<string | null>(null);
  const [masterDataPending, setMasterDataPending] = useState(false);
  const [masterDataError, setMasterDataError] = useState<string | null>(null);
  const [assessmentPending, setAssessmentPending] = useState(false);
  const [assessmentError, setAssessmentError] = useState<string | null>(null);
  const [attemptPending, setAttemptPending] = useState(false);
  const [attemptError, setAttemptError] = useState<string | null>(null);
  const [studyPlanPending, setStudyPlanPending] = useState(false);
  const [studyPlanError, setStudyPlanError] = useState<string | null>(null);
  const [practicePending, setPracticePending] = useState(false);
  const [practiceError, setPracticeError] = useState<string | null>(null);
  const [completionPending, setCompletionPending] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);

  const selectedDemoDocument =
    findDemoMasterDataDocument(selectedDemoMaterialId) ?? defaultDemoDocument;
  const demoTopics = [...new Set(demoMasterDataLibrary.map((entry) => entry.topic))];
  const parsedMasterData = useMemo(
    () =>
      parseMasterDataInput({
        sourceName: masterDataValues.sourceName,
        lines: masterDataValues.lines,
        fallbackSubject: selectedDemoDocument?.subject,
        fallbackTopic: loopValues.topic,
        fallbackYearGroup: loopValues.yearGroup
      }),
    [
      loopValues.topic,
      loopValues.yearGroup,
      masterDataValues.lines,
      masterDataValues.sourceName,
      selectedDemoDocument?.subject
    ]
  );
  const effectiveMasterDataSummary = uploadedMasterDataSummary ?? parsedMasterData.summary;
  const effectiveMasterDataSummaryMode = uploadedMasterDataSummary
    ? "structured"
    : parsedMasterData.mode;

  async function loadLearningLoop(learningLoopId: string) {
    setResumePending(true);
    setResumeError(null);

    try {
      const response = await getLearningLoop(apiBaseUrl, learningLoopId);
      setLoopState(response);
      setResumeLoopId(learningLoopId);
      setLoopValues((current) => ({
        ...current,
        learnerName: response.workspace.learner.name,
        yearGroup: response.workspace.learner.yearGroup,
        topic: response.learningLoop.topic,
        objective: response.learningLoop.objective,
        availableMinutesByDay: {
          ...initialMinutes,
          ...response.workspace.learner.availableMinutesByDay
        }
      }));
      window.localStorage.setItem(lastLoopStorageKey, learningLoopId);
      const url = new URL(window.location.href);
      url.searchParams.set("loop", learningLoopId);
      window.history.replaceState({}, "", url);
      return response;
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Unknown request failure.";
      setResumeError(message);
      throw requestError;
    } finally {
      setResumePending(false);
    }
  }

  useEffect(() => {
    const url = new URL(window.location.href);
    const searchLoopId = url.searchParams.get("loop");
    const storedLoopId = window.localStorage.getItem(lastLoopStorageKey);
    const loopId = searchLoopId ?? storedLoopId;

    if (!loopId) {
      return;
    }

    void loadLearningLoop(loopId);
  }, []);

  function resetActiveLoop() {
    setLoopState(null);
    setResumeLoopId("");
    setResumeError(null);
    setAssessmentError(null);
    setAttemptError(null);
    setStudyPlanError(null);
    setPracticeError(null);
    setCompletionError(null);
    window.localStorage.removeItem(lastLoopStorageKey);
    const url = new URL(window.location.href);
    url.searchParams.delete("loop");
    window.history.replaceState({}, "", url);
  }

  async function handleResumeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resumeLoopId.trim()) {
      return;
    }

    await loadLearningLoop(resumeLoopId.trim());
  }

  async function handleMasterDataSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMasterDataPending(true);
    setMasterDataError(null);

    try {
      const detectedTopic = parsedMasterData.summary.mainTopic?.trim() || loopValues.topic;
      const detectedYearGroup = parsedMasterData.summary.yearGroup?.trim() || loopValues.yearGroup;
      const command = buildUploadCommand({
        sourceName: masterDataValues.sourceName,
        lines: masterDataValues.lines,
        fallbackSubject: selectedDemoDocument?.subject,
        fallbackTopic: loopValues.topic,
        fallbackYearGroup: loopValues.yearGroup
      });
      const uploaded = await uploadMasterData(apiBaseUrl, command);
      const interpretedSummary = decodeInterpretationSummaryFromItems(uploaded.items);
      setLoopValues((current) => ({
        ...current,
        topic: interpretedSummary?.mainTopic?.trim() || detectedTopic,
        yearGroup: interpretedSummary?.yearGroup?.trim() || detectedYearGroup
      }));
      setUploadedMasterDataSummary(interpretedSummary ?? null);
      setMasterDataStatus(
        `${uploaded.items.length} study prompts are ready in ${uploaded.source.name}.`
      );
    } catch (requestError) {
      setMasterDataError(
        requestError instanceof Error ? requestError.message : "Unknown request failure."
      );
    } finally {
      setMasterDataPending(false);
    }
  }

  async function handleAssessmentGenerate() {
    setAssessmentPending(true);
    setAssessmentError(null);

    try {
      const response = await startLearningLoop(apiBaseUrl, {
        learnerName: loopValues.learnerName,
        yearGroup: loopValues.yearGroup,
        topic: loopValues.topic,
        objective: loopValues.objective,
        desiredLoopCount: Math.max(1, Math.min(loopValues.questionCount, 6))
      });
      await loadLearningLoop(response.learningLoopId);
    } catch (requestError) {
      setAssessmentError(
        requestError instanceof Error ? requestError.message : "Unknown request failure."
      );
    } finally {
      setAssessmentPending(false);
    }
  }

  async function handleAssessmentAttemptSubmit(
    responses: readonly { answer: string; itemId: string }[]
  ) {
    if (!loopState?.currentAssessment) {
      return;
    }

    setAttemptPending(true);
    setAttemptError(null);

    try {
      const response = await submitAssessmentAttempt(apiBaseUrl, {
        assessmentId: loopState.currentAssessment.id,
        responses
      });
      await loadLearningLoop(response.learningLoopId);
    } catch (requestError) {
      setAttemptError(
        requestError instanceof Error ? requestError.message : "Unknown request failure."
      );
    } finally {
      setAttemptPending(false);
    }
  }

  async function handleStudyPlanGenerate() {
    setStudyPlanPending(true);
    setStudyPlanError(null);

    try {
      const response = await generateStudyPlan(apiBaseUrl, {
        learnerName: loopValues.learnerName,
        yearGroup: loopValues.yearGroup,
        objective: loopValues.objective,
        focusTopics: [loopValues.topic],
        availableMinutesByDay: loopValues.availableMinutesByDay
      });
      await loadLearningLoop(response.learningLoopId);
    } catch (requestError) {
      setStudyPlanError(
        requestError instanceof Error ? requestError.message : "Unknown request failure."
      );
    } finally {
      setStudyPlanPending(false);
    }
  }

  async function handlePracticeGenerate() {
    if (!loopState) {
      return;
    }

    setPracticePending(true);
    setPracticeError(null);

    try {
      const response = await generatePracticeActivity(apiBaseUrl, {
        learningLoopId: loopState.learningLoopId,
        kind: "flashcard_set",
        cardCount: loopValues.practiceCardCount
      });
      await loadLearningLoop(response.learningLoopId);
    } catch (requestError) {
      setPracticeError(
        requestError instanceof Error ? requestError.message : "Unknown request failure."
      );
    } finally {
      setPracticePending(false);
    }
  }

  async function handlePracticeCompletionSubmit(
    responses: CompletePracticeActivityCommand["responses"]
  ) {
    if (!loopState?.currentPracticeActivity) {
      return;
    }

    setCompletionPending(true);
    setCompletionError(null);

    try {
      const response = await completePracticeActivity(apiBaseUrl, {
        practiceActivityId: loopState.currentPracticeActivity.id,
        responses
      });
      await loadLearningLoop(response.learningLoopId);
    } catch (requestError) {
      setCompletionError(
        requestError instanceof Error ? requestError.message : "Unknown request failure."
      );
    } finally {
      setCompletionPending(false);
    }
  }

  function setDayMinutes(day: StudyDay, value: string) {
    const parsed = Number(value);

    setLoopValues((current) => ({
      ...current,
      availableMinutesByDay: {
        ...current.availableMinutesByDay,
        [day]: Number.isFinite(parsed) ? parsed : 0
      }
    }));
  }

  function applyDemoSeed() {
    if (!selectedDemoDocument) {
      return;
    }

    const draft = applyDemoDocumentToForm(selectedDemoDocument);
    setLoopValues((current) => ({
      ...current,
      ...draft.loopValues
    }));
    setMasterDataValues(draft.masterDataValues);
    setUploadedMasterDataSummary(null);
    setMasterDataStatus(null);
    setMasterDataError(null);
  }

  async function handleDemoUpload() {
    if (!selectedDemoDocument) {
      return;
    }

    setMasterDataPending(true);
    setMasterDataError(null);

    try {
      const command = buildUploadCommand({
        sourceName: selectedDemoDocument.sourceName,
        lines: selectedDemoDocument.content,
        fallbackSubject: selectedDemoDocument.subject,
        fallbackTopic: selectedDemoDocument.topic,
        fallbackYearGroup: selectedDemoDocument.yearGroup
      });
      const uploaded = await uploadMasterData(apiBaseUrl, command);
      const interpretedSummary = decodeInterpretationSummaryFromItems(uploaded.items);
      const draft = applyDemoDocumentToForm(selectedDemoDocument);
      setLoopValues((current) => ({
        ...current,
        ...draft.loopValues,
        topic: interpretedSummary?.mainTopic?.trim() || draft.loopValues.topic,
        yearGroup: interpretedSummary?.yearGroup?.trim() || draft.loopValues.yearGroup
      }));
      setMasterDataValues(draft.masterDataValues);
      setUploadedMasterDataSummary(interpretedSummary ?? null);
      setMasterDataStatus(
        `${uploaded.items.length} study prompts are ready from ${selectedDemoDocument.label}.`
      );
    } catch (requestError) {
      setMasterDataError(
        requestError instanceof Error ? requestError.message : "Unknown request failure."
      );
    } finally {
      setMasterDataPending(false);
    }
  }

  return (
    <LoopJourneyPage
      assessmentError={assessmentError}
      assessmentPending={assessmentPending}
      attemptError={attemptError}
      attemptPending={attemptPending}
      completionError={completionError}
      completionPending={completionPending}
      demoMaterials={demoMasterDataLibrary}
      demoTopics={demoTopics}
      loopState={loopState}
      loopValues={loopValues}
      masterDataError={masterDataError}
      masterDataPending={masterDataPending}
      masterDataStatus={masterDataStatus}
      masterDataSummary={effectiveMasterDataSummary}
      masterDataSummaryMode={effectiveMasterDataSummaryMode}
      masterDataValues={masterDataValues}
      practiceError={practiceError}
      practicePending={practicePending}
      resumeError={resumeError}
      resumeLoopId={resumeLoopId}
      resumePending={resumePending}
      selectedDemoMaterialId={selectedDemoDocument?.id ?? ""}
      studyPlanError={studyPlanError}
      studyPlanPending={studyPlanPending}
      onApplyDemoSeed={applyDemoSeed}
      onAssessmentSubmit={handleAssessmentAttemptSubmit}
      onBuildPlan={handleStudyPlanGenerate}
      onDayMinutesChange={setDayMinutes}
      onDemoUpload={handleDemoUpload}
      onGenerateCheckUp={handleAssessmentGenerate}
      onGenerateReview={handlePracticeGenerate}
      onLoopValuesChange={setLoopValues}
      onMasterDataSubmit={handleMasterDataSubmit}
      onMasterDataValuesChange={(nextValues) => {
        setUploadedMasterDataSummary(null);
        setMasterDataValues(nextValues);
      }}
      onResumeLoopIdChange={setResumeLoopId}
      onResumeSubmit={handleResumeSubmit}
      onReviewSubmit={handlePracticeCompletionSubmit}
      onStartNewRound={resetActiveLoop}
      onSelectedDemoMaterialChange={(id) => {
        setUploadedMasterDataSummary(null);
        setSelectedDemoMaterialId(id);
      }}
    />
  );
}
