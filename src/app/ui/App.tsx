import { useState } from "react";
import type { FormEvent } from "react";
import type { StudyPlanResponse } from "../../domain/study/StudyPlanning.js";
import type { StudyDay } from "../../domain/study/StudySchedule.js";
import { requestStudyPlan, type StudyPlanRequestFormValues } from "./api/studyPlanClient.js";
import { ArtifactView } from "./components/ArtifactView.js";
import { EventTimeline } from "./components/EventTimeline.js";
import { LearningLoopView } from "./components/LearningLoopView.js";
import { StudyPlanRequestForm } from "./components/StudyPlanRequestForm.js";
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

const initialValues: StudyPlanRequestFormValues = {
  learnerName: "Year 7 learner",
  yearGroup: "Year 7",
  objective: "Create a balanced weekly study plan for fractions, forces, and French vocabulary.",
  topics: "fractions, forces, French vocabulary",
  minutes: initialMinutes
};

export function App() {
  const [values, setValues] = useState(initialValues);
  const [studyPlanResult, setStudyPlanResult] = useState<StudyPlanResponse | null>(null);
  const [studyPlanPending, setStudyPlanPending] = useState(false);
  const [studyPlanError, setStudyPlanError] = useState<string | null>(null);

  async function handleStudyPlanSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStudyPlanPending(true);
    setStudyPlanError(null);

    try {
      setStudyPlanResult(await requestStudyPlan(apiBaseUrl, values));
    } catch (requestError) {
      setStudyPlanError(
        requestError instanceof Error ? requestError.message : "Unknown request failure."
      );
    } finally {
      setStudyPlanPending(false);
    }
  }

  function setDayMinutes(day: StudyDay, value: string) {
    const parsed = Number(value);

    setValues((current) => ({
      ...current,
      minutes: {
        ...current.minutes,
        [day]: Number.isFinite(parsed) ? parsed : 0
      }
    }));
  }

  return (
    <div className="shell">
      <header className="hero">
        <p className="eyebrow">Sherlock Foundation</p>
        <h1>Visible study planning, not a prompt-shaped black box.</h1>
        <p className="lede">
          Planning now attaches to a learning loop so diagnostic evidence, knowledge gaps, and
          mastery state can shape the next study plan.
        </p>
      </header>

      <main className="grid">
        <StudyPlanRequestForm
          disabled={studyPlanPending}
          error={studyPlanError}
          values={values}
          onMinutesChange={setDayMinutes}
          onSubmit={handleStudyPlanSubmit}
          onValuesChange={setValues}
        />

        <section className="panel panel-result">
          <h2>Workspace Snapshot</h2>
          {!studyPlanResult ? (
            <p className="placeholder">
              Submit the study-plan request to inspect the learning loop, task graph, work plan,
              artifact, and event trail.
            </p>
          ) : (
            <div className="result-stack">
              <WorkspaceSnapshotView agent={studyPlanResult.agent} workspace={studyPlanResult.workspace} />
              <LearningLoopView
                knowledgeGaps={studyPlanResult.knowledgeGaps}
                learningLoop={studyPlanResult.learningLoop}
                masteryProfile={studyPlanResult.masteryProfile}
              />
              <TaskGraphView
                blockedTaskIds={studyPlanResult.blockedTaskIds}
                taskGraph={studyPlanResult.taskGraph}
                tasks={studyPlanResult.tasks}
              />
              <WorkPlanView workPlan={studyPlanResult.workPlan} />
              <ArtifactView artifact={studyPlanResult.artifact} />
              <EventTimeline events={studyPlanResult.events} />
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
