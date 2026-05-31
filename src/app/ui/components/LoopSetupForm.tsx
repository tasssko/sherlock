import type { StudyDay } from "../../../domain/study/StudySchedule.js";
import { studyDays } from "../../../domain/study/StudySchedule.js";

export interface LoopSetupValues {
  learnerName: string;
  objective: string;
  practiceCardCount: number;
  questionCount: number;
  topic: string;
  yearGroup: string;
  availableMinutesByDay: Record<StudyDay, number>;
}

export interface LoopSetupFormProps {
  demoTopics?: readonly string[];
  values: LoopSetupValues;
  onApplyDemoSeed?: () => void;
  onMinutesChange: (day: StudyDay, value: string) => void;
  onValuesChange: (nextValues: LoopSetupValues) => void;
}

type LoopPace = "quick" | "standard" | "deep";

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

export function LoopSetupForm(props: LoopSetupFormProps) {
  const { demoTopics, onApplyDemoSeed, values, onMinutesChange, onValuesChange } = props;

  return (
    <section className="panel panel-form">
      <h2>1. Loop Setup</h2>
      <div className="form-stack panel-body">
        {onApplyDemoSeed ? (
          <div className="demo-banner">
            <div>
              <p className="subtle-heading">Demo seed</p>
              <p>
                One learner profile with approved material for {demoTopics?.join(", ") ?? "three topics"}.
              </p>
            </div>
            <button type="button" onClick={onApplyDemoSeed}>
              Load Year 7 demo
            </button>
          </div>
        ) : null}

        <label>
          Learner name
          <input
            value={values.learnerName}
            onChange={(event) =>
              onValuesChange({
                ...values,
                learnerName: event.target.value
              })
            }
          />
        </label>

        <label>
          Year group
          <input
            value={values.yearGroup}
            onChange={(event) =>
              onValuesChange({
                ...values,
                yearGroup: event.target.value
              })
            }
          />
        </label>

        <label>
          Topic to focus on now
          <input
            value={values.topic}
            onChange={(event) =>
              onValuesChange({
                ...values,
                topic: event.target.value
              })
            }
          />
        </label>

        <label>
          Study goal
          <textarea
            rows={4}
            value={values.objective}
            onChange={(event) =>
              onValuesChange({
                ...values,
                objective: event.target.value
              })
            }
          />
        </label>

        <div className="inline-grid">
          <label>
            Round pace
            <select
              value={deriveLoopPace(values.questionCount)}
              onChange={(event) =>
                onValuesChange({
                  ...values,
                  questionCount: loopCountForPace(event.target.value as LoopPace)
                })
              }
            >
              <option value="quick">Quick</option>
              <option value="standard">Standard</option>
              <option value="deep">Deep</option>
            </select>
          </label>

          <label>
            Review set size
            <input
              type="number"
              min={1}
              max={12}
              value={values.practiceCardCount}
              onChange={(event) =>
                onValuesChange({
                  ...values,
                  practiceCardCount: Number(event.target.value) || 1
                })
              }
            />
          </label>
        </div>

        <div>
          <p className="subtle-heading">Weekly study time</p>
          <div className="minutes-grid">
            {studyDays.map((day) => (
              <label key={day}>
                {day}
                <input
                  type="number"
                  min={0}
                  value={values.availableMinutesByDay[day]}
                  onChange={(event) => onMinutesChange(day, event.target.value)}
                />
              </label>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
