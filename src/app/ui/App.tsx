import { useEffect, useState, type FormEvent } from "react";
import type { UploadMasterDataCommand } from "../../domain/study/MasterDataUpload.js";
import type { CompletePracticeActivityCommand } from "../../domain/study/PracticeActivities.js";
import type { LearningLoopResumeResponse } from "../../domain/study/LearningLoops.js";
import type { StudyDay } from "../../domain/study/StudySchedule.js";
import {
  completePracticeActivity,
  generateInitialAssessment,
  generatePracticeActivity,
  generateStudyPlan,
  getLearningLoop,
  submitAssessmentAttempt,
  uploadMasterData
} from "./api/loopStudyClient.js";
import { LoopJourneyPage } from "./components/LoopJourneyPage.js";
import { year7DemoLoopSetup, year7DemoMasterData, year7DemoTopics } from "./demo/year7DemoSeed.js";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:3001";
const lastLoopStorageKey = "loop.study:last-learning-loop-id";

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

const initialLoopValues: LoopSetupValues = year7DemoLoopSetup;

const initialMasterDataValues: MasterDataPasteValues = {
  sourceName: "Year 7 Fractions Pack",
  lines: [
    "Simplify 6/8. || three quarters || Fractions can be simplified by dividing numerator and denominator by the same number. || simplify, equivalent fractions",
    "Which is larger: 2/3 or 3/5? || two thirds || Compare fractions by finding common denominators or decimal equivalents. || compare fractions",
    "What is 1/4 of 20? || 5 || A fraction of a quantity means divide by the denominator then multiply by the numerator. || fraction of an amount",
    "Write 0.5 as a fraction. || one half || Decimals and fractions can represent the same value. || decimals, equivalents",
    "Which fraction is equivalent to 3/4? || 6/8 || Equivalent fractions name the same amount in different forms. || equivalent fractions"
  ].join("\n")
};

export function App() {
  const [loopValues, setLoopValues] = useState(initialLoopValues);
  const [masterDataValues, setMasterDataValues] = useState(initialMasterDataValues);
  const [resumeLoopId, setResumeLoopId] = useState("");
  const [resumePending, setResumePending] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [loopState, setLoopState] = useState<LearningLoopResumeResponse | null>(null);
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

  async function handleResumeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resumeLoopId.trim()) {
      return;
    }

    await loadLearningLoop(resumeLoopId.trim());
  }

  function parseMasterDataItems(
    topic: string,
    lines: string
  ): UploadMasterDataCommand["items"] {
    return lines
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [prompt = "", canonicalAnswer = "", visibleMaterial = "", keywords = ""] = line
          .split("||")
          .map((part) => part.trim());

        return {
          topic,
          prompt,
          canonicalAnswer,
          visibleMaterial,
          keywords: keywords
            ? keywords
                .split(",")
                .map((keyword) => keyword.trim())
                .filter(Boolean)
            : undefined
        };
      });
  }

  async function handleMasterDataSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMasterDataPending(true);
    setMasterDataError(null);

    try {
      const uploaded = await uploadMasterData(apiBaseUrl, {
        sourceName: masterDataValues.sourceName,
        items: parseMasterDataItems(loopValues.topic, masterDataValues.lines)
      });
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
      const response = await generateInitialAssessment(apiBaseUrl, {
        learnerName: loopValues.learnerName,
        yearGroup: loopValues.yearGroup,
        topic: loopValues.topic,
        questionCount: loopValues.questionCount
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
    setLoopValues(year7DemoLoopSetup);
    setMasterDataValues({
      sourceName: year7DemoMasterData.sourceName,
      lines: year7DemoMasterData.items
        .filter((item) => item.topic === "fractions")
        .map(
          (item) =>
            `${item.prompt} || ${item.canonicalAnswer} || ${item.visibleMaterial} || ${item.keywords?.join(", ") ?? ""}`
        )
        .join("\n")
    });
    setMasterDataStatus(
      "The Year 7 demo is loaded. Save the study prompts to move into the first round."
    );
  }

  async function handleDemoUpload() {
    setMasterDataPending(true);
    setMasterDataError(null);

    try {
      const uploaded = await uploadMasterData(apiBaseUrl, year7DemoMasterData);
      setMasterDataStatus(
        `${uploaded.items.length} demo prompts are ready across ${year7DemoTopics.join(", ")}.`
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
      demoTopics={year7DemoTopics}
      loopState={loopState}
      loopValues={loopValues}
      masterDataError={masterDataError}
      masterDataPending={masterDataPending}
      masterDataStatus={masterDataStatus}
      masterDataValues={masterDataValues}
      practiceError={practiceError}
      practicePending={practicePending}
      resumeError={resumeError}
      resumeLoopId={resumeLoopId}
      resumePending={resumePending}
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
      onMasterDataValuesChange={setMasterDataValues}
      onResumeLoopIdChange={setResumeLoopId}
      onResumeSubmit={handleResumeSubmit}
      onReviewSubmit={handlePracticeCompletionSubmit}
    />
  );
}
