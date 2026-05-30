import { useState } from "react";
import type { StudyDay, StudyPlanResponse } from "../../domain/study/StudyPlanning.js";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:3000";

const studyDays: readonly StudyDay[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
];

const initialMinutes: Record<StudyDay, number> = {
  Monday: 30,
  Tuesday: 30,
  Wednesday: 30,
  Thursday: 30,
  Friday: 30,
  Saturday: 60,
  Sunday: 0
};

export function App() {
  const [learnerName, setLearnerName] = useState("Year 7 learner");
  const [yearGroup, setYearGroup] = useState("Year 7");
  const [objective, setObjective] = useState(
    "Create a balanced weekly study plan for fractions, forces, and French vocabulary."
  );
  const [topics, setTopics] = useState("fractions, forces, French vocabulary");
  const [minutes, setMinutes] = useState(initialMinutes);
  const [result, setResult] = useState<StudyPlanResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/v1/study-plans`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          learnerName,
          yearGroup,
          objective,
          focusTopics: topics
            .split(",")
            .map((topic) => topic.trim())
            .filter(Boolean),
          availableMinutesByDay: minutes
        })
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Request failed.");
      }

      setResult((await response.json()) as StudyPlanResponse);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error ? submissionError.message : "Unknown request failure."
      );
    } finally {
      setPending(false);
    }
  }

  function setDayMinutes(day: StudyDay, value: string) {
    const parsed = Number(value);

    setMinutes((current) => ({
      ...current,
      [day]: Number.isFinite(parsed) ? parsed : 0
    }));
  }

  return (
    <div className="shell">
      <header className="hero">
        <p className="eyebrow">Sherlock Foundation</p>
        <h1>Visible study planning, not a prompt-shaped black box.</h1>
        <p className="lede">
          The first slice stays narrow: create a weekly study plan and expose the workspace,
          tasks, work plan, artifact, and event trail together.
        </p>
      </header>

      <main className="grid">
        <section className="panel panel-form">
          <h2>Plan Request</h2>
          <form onSubmit={handleSubmit}>
            <label>
              Learner
              <input value={learnerName} onChange={(event) => setLearnerName(event.target.value)} />
            </label>

            <label>
              Year group
              <input value={yearGroup} onChange={(event) => setYearGroup(event.target.value)} />
            </label>

            <label>
              Objective
              <textarea
                rows={4}
                value={objective}
                onChange={(event) => setObjective(event.target.value)}
              />
            </label>

            <label>
              Topics
              <input value={topics} onChange={(event) => setTopics(event.target.value)} />
            </label>

            <div className="minutes-grid">
              {studyDays.map((day) => (
                <label key={day}>
                  {day}
                  <input
                    type="number"
                    min={0}
                    value={minutes[day]}
                    onChange={(event) => setDayMinutes(day, event.target.value)}
                  />
                </label>
              ))}
            </div>

            <button type="submit" disabled={pending}>
              {pending ? "Creating plan..." : "Create weekly study plan"}
            </button>
          </form>

          {error ? <p className="error">{error}</p> : null}
        </section>

        <section className="panel panel-result">
          <h2>Workspace Snapshot</h2>
          {!result ? (
            <p className="placeholder">
              Submit the request to inspect the controller output and domain lifecycle.
            </p>
          ) : (
            <div className="result-stack">
              <div className="card">
                <h3>{result.workspace.title}</h3>
                <p>{result.workspace.activeObjective}</p>
                <p>
                  Learner: {result.workspace.learner.name} · {result.workspace.learner.yearGroup}
                </p>
                <p>Agent: {result.agent.role}</p>
              </div>

              <div className="card">
                <h3>Task Graph</h3>
                <ul>
                  {result.tasks.map((task) => (
                    <li key={task.id}>
                      <strong>{task.title}</strong> · {task.state}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="card">
                <h3>Work Plan</h3>
                <ul>
                  {result.workPlan.stages.map((stage) => (
                    <li key={stage.id}>
                      <strong>{stage.title}</strong> · {stage.objective}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="card">
                <h3>Study Plan Artifact</h3>
                <p>{result.artifact.content.summary}</p>
                <ul>
                  {result.artifact.content.sessions.map((session) => (
                    <li key={`${session.day}-${session.topic}`}>
                      <strong>
                        {session.day} · {session.minutes}m · {session.topic}
                      </strong>
                      <span>{session.activity}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="card">
                <h3>Events</h3>
                <ul>
                  {result.events.map((domainEvent) => (
                    <li key={domainEvent.id}>
                      <strong>{domainEvent.type}</strong> · {domainEvent.occurredAt}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

