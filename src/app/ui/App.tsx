import { useState, type FormEvent } from "react";
import type { DomainEvent } from "../../domain/primitives/Event.js";
import type {
  AssessmentAttemptResponse,
  InitialAssessmentResponse
} from "../../domain/study/AssessmentGeneration.js";
import type { UploadMasterDataCommand } from "../../domain/study/MasterDataUpload.js";
import type {
  CompletePracticeActivityCommand,
  PracticeActivityCompletionResponse,
  PracticeActivityResponse
} from "../../domain/study/PracticeActivities.js";
import type { StudyPlanResponse } from "../../domain/study/StudyPlanning.js";
import type { StudyDay } from "../../domain/study/StudySchedule.js";
import {
  completePracticeActivity,
  generateInitialAssessment,
  generatePracticeActivity,
  generateStudyPlan,
  submitAssessmentAttempt,
  uploadMasterData
} from "./api/loopStudyClient.js";
import { ArtifactView } from "./components/ArtifactView.js";
import { AssessmentAttemptForm } from "./components/AssessmentAttemptForm.js";
import { EventTimeline } from "./components/EventTimeline.js";
import { LearningLoopView } from "./components/LearningLoopView.js";
import { LoopSetupForm, type LoopSetupValues } from "./components/LoopSetupForm.js";
import { MasterDataPasteForm, type MasterDataPasteValues } from "./components/MasterDataPasteForm.js";
import { NextActionView } from "./components/NextActionView.js";
import { PracticeActivityView } from "./components/PracticeActivityView.js";
import { PracticeCompletionForm } from "./components/PracticeCompletionForm.js";
import { TaskGraphView } from "./components/TaskGraphView.js";
import { WorkPlanView } from "./components/WorkPlanView.js";
import { WorkspaceSnapshotView } from "./components/WorkspaceSnapshotView.js";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:3000";

const initialMinutes: Record<StudyDay, number> = {
  Monday: 30,
  Tuesday: 30,
  Wednesday: 30,
  Thursday: 30,
  Friday: 30,
  Saturday: 60,
  Sunday: 0
};

const initialLoopValues: LoopSetupValues = {
  learnerName: "Year 7 learner",
  yearGroup: "Year 7",
  topic: "fractions",
  objective: "Build secure understanding of fractions through diagnosis, short study sessions, and active review.",
  questionCount: 5,
  practiceCardCount: 5,
  availableMinutesByDay: initialMinutes
};

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
  const [masterDataStatus, setMasterDataStatus] = useState<string | null>(null);
  const [masterDataPending, setMasterDataPending] = useState(false);
  const [masterDataError, setMasterDataError] = useState<string | null>(null);
  const [assessmentResult, setAssessmentResult] = useState<InitialAssessmentResponse | null>(null);
  const [assessmentPending, setAssessmentPending] = useState(false);
  const [assessmentError, setAssessmentError] = useState<string | null>(null);
  const [attemptResult, setAttemptResult] = useState<AssessmentAttemptResponse | null>(null);
  const [attemptPending, setAttemptPending] = useState(false);
  const [attemptError, setAttemptError] = useState<string | null>(null);
  const [studyPlanResult, setStudyPlanResult] = useState<StudyPlanResponse | null>(null);
  const [studyPlanPending, setStudyPlanPending] = useState(false);
  const [studyPlanError, setStudyPlanError] = useState<string | null>(null);
  const [practiceResult, setPracticeResult] = useState<PracticeActivityResponse | null>(null);
  const [practicePending, setPracticePending] = useState(false);
  const [practiceError, setPracticeError] = useState<string | null>(null);
  const [completionResult, setCompletionResult] = useState<PracticeActivityCompletionResponse | null>(null);
  const [completionPending, setCompletionPending] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<readonly DomainEvent[]>([]);

  function appendEvents(events: readonly DomainEvent[]) {
    setTimelineEvents((current) => [...current, ...events]);
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
        `${uploaded.items.length} approved master-data items loaded from ${uploaded.source.name}.`
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
      setAssessmentResult(response);
      setAttemptResult(null);
      setStudyPlanResult(null);
      setPracticeResult(null);
      setCompletionResult(null);
      setTimelineEvents(response.events);
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
    if (!assessmentResult) {
      return;
    }

    setAttemptPending(true);
    setAttemptError(null);

    try {
      const response = await submitAssessmentAttempt(apiBaseUrl, {
        assessmentId: assessmentResult.assessment.id,
        responses
      });
      setAttemptResult(response);
      appendEvents(response.events);
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
      setStudyPlanResult(response);
      appendEvents(response.events);
    } catch (requestError) {
      setStudyPlanError(
        requestError instanceof Error ? requestError.message : "Unknown request failure."
      );
    } finally {
      setStudyPlanPending(false);
    }
  }

  async function handlePracticeGenerate() {
    if (!assessmentResult) {
      return;
    }

    setPracticePending(true);
    setPracticeError(null);

    try {
      const response = await generatePracticeActivity(apiBaseUrl, {
        learningLoopId: assessmentResult.learningLoop.id,
        kind: "flashcard_set",
        cardCount: loopValues.practiceCardCount
      });
      setPracticeResult(response);
      setCompletionResult(null);
      appendEvents(response.events);
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
    if (!practiceResult) {
      return;
    }

    setCompletionPending(true);
    setCompletionError(null);

    try {
      const response = await completePracticeActivity(apiBaseUrl, {
        practiceActivityId: practiceResult.practiceActivity.id,
        responses
      });
      setCompletionResult(response);
      appendEvents(response.events);
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

  const latestProjection =
    completionResult ?? practiceResult ?? studyPlanResult ?? attemptResult ?? assessmentResult;
  const latestKnowledgeGaps = studyPlanResult?.knowledgeGaps ?? attemptResult?.knowledgeGaps ?? [];
  const remainingGapIds = completionResult?.activeReviewSession.remainingKnowledgeGapIds ?? [];
  const remainingGaps = latestKnowledgeGaps.filter((gap) => remainingGapIds.includes(gap.id));
  const latestLearningLoop = latestProjection?.learningLoop;
  const latestMasteryProfile =
    completionResult?.masteryProfile ?? studyPlanResult?.masteryProfile ?? attemptResult?.masteryProfile;
  const latestWorkspace = latestProjection?.workspace;
  const latestAgent = practiceResult?.agent ?? studyPlanResult?.agent ?? assessmentResult?.agent;

  return (
    <div className="shell">
      <header className="hero">
        <p className="eyebrow">loop.study MVP</p>
        <h1>One learner loop from source material to next review.</h1>
        <p className="lede">
          This golden path keeps Relay behind the runtime boundary and shows the learner-facing loop:
          source material, diagnostic assessment, gaps, adapted plan, flashcard practice, active review,
          and the next review action.
        </p>
      </header>

      <main className="grid">
        <div className="control-stack">
          <LoopSetupForm
            values={loopValues}
            onMinutesChange={setDayMinutes}
            onValuesChange={setLoopValues}
          />
          <MasterDataPasteForm
            disabled={masterDataPending}
            error={masterDataError}
            status={masterDataStatus}
            values={masterDataValues}
            onSubmit={handleMasterDataSubmit}
            onValuesChange={setMasterDataValues}
          />

          <section className="panel panel-form">
            <h2>3. Generate Initial Assessment</h2>
            <div className="panel-body">
              <button type="button" disabled={assessmentPending} onClick={handleAssessmentGenerate}>
                {assessmentPending ? "Generating..." : "Create loop and generate assessment"}
              </button>
              {assessmentError ? <p className="error">{assessmentError}</p> : null}
            </div>
          </section>

          {assessmentResult ? (
            <AssessmentAttemptForm
              key={assessmentResult.assessment.id}
              assessment={assessmentResult.assessment}
              disabled={attemptPending}
              error={attemptError}
              onSubmit={handleAssessmentAttemptSubmit}
            />
          ) : null}

          {attemptResult ? (
            <section className="panel panel-form">
              <h2>6. Generate Adapted Study Plan</h2>
              <div className="panel-body">
                <button type="button" disabled={studyPlanPending} onClick={handleStudyPlanGenerate}>
                  {studyPlanPending ? "Generating..." : "Generate adapted study plan"}
                </button>
                {studyPlanError ? <p className="error">{studyPlanError}</p> : null}
              </div>
            </section>
          ) : null}

          {studyPlanResult ? (
            <section className="panel panel-form">
              <h2>7. Generate Flashcard Practice</h2>
              <div className="panel-body">
                <button type="button" disabled={practicePending} onClick={handlePracticeGenerate}>
                  {practicePending ? "Generating..." : "Generate flashcard practice activity"}
                </button>
                {practiceError ? <p className="error">{practiceError}</p> : null}
              </div>
            </section>
          ) : null}

          {practiceResult ? (
            <PracticeCompletionForm
              key={practiceResult.practiceActivity.id}
              disabled={completionPending}
              error={completionError}
              practiceActivity={practiceResult.practiceActivity}
              onSubmit={handlePracticeCompletionSubmit}
            />
          ) : null}
        </div>

        <section className="panel panel-result">
          <h2>Golden Path Snapshot</h2>
          {!latestProjection ? (
            <p className="placeholder">
              Start with loop setup and master data. The learner-facing route responses will fill in
              the loop state step by step.
            </p>
          ) : (
            <div className="result-stack">
              <NextActionView
                learningLoopId={latestProjection.learningLoopId}
                phase={latestProjection.phase}
                nextAction={latestProjection.nextAction}
              />

              {latestWorkspace && latestAgent ? (
                <WorkspaceSnapshotView agent={latestAgent} workspace={latestWorkspace} />
              ) : null}

              {latestLearningLoop ? (
                <LearningLoopView
                  knowledgeGaps={remainingGaps.length > 0 ? remainingGaps : latestKnowledgeGaps}
                  learningLoop={latestLearningLoop}
                  masteryProfile={latestMasteryProfile}
                />
              ) : null}

              {assessmentResult ? (
                <div className="card">
                  <h3>Initial Assessment</h3>
                  <p>{assessmentResult.artifact.content.instructions}</p>
                  <ul>
                    {assessmentResult.artifact.content.items.map((item) => (
                      <li key={item.id}>
                        <strong>{item.prompt}</strong>
                        <span>Difficulty: {item.difficulty}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {attemptResult ? (
                <div className="card">
                  <h3>Diagnosed Gaps</h3>
                  <p>Assessment score: {Math.round(attemptResult.evaluation.score * 100)}%</p>
                  <ul>
                    {attemptResult.knowledgeGaps.map((gap) => (
                      <li key={gap.id}>
                        <strong>{gap.topic}</strong>
                        <span>{gap.description}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {studyPlanResult ? (
                <>
                  <TaskGraphView
                    blockedTaskIds={studyPlanResult.blockedTaskIds}
                    taskGraph={studyPlanResult.taskGraph}
                    tasks={studyPlanResult.tasks}
                  />
                  <WorkPlanView workPlan={studyPlanResult.workPlan} />
                  <ArtifactView artifact={studyPlanResult.artifact} />
                </>
              ) : null}

              {practiceResult ? <PracticeActivityView practiceActivity={practiceResult.practiceActivity} /> : null}

              {completionResult ? (
                <div className="card">
                  <h3>9. Review Outcome</h3>
                  <p>{completionResult.activeReviewSession.evidenceSummary}</p>
                  <p>
                    Mastery score: {Math.round(completionResult.activeReviewSession.masteryScore * 100)}% ·
                    Next review {new Date(completionResult.activeReviewSession.nextReviewAt).toLocaleString()}
                  </p>
                  <p>
                    Remaining gaps: {remainingGaps.length > 0 ? remainingGaps.map((gap) => gap.description).join(" | ") : "None"}
                  </p>
                </div>
              ) : null}

              <EventTimeline events={timelineEvents} />
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
