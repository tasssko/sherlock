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
            Assessment questions
            <input
              type="number"
              min={1}
              max={10}
              value={values.questionCount}
              onChange={(event) =>
                onValuesChange({
                  ...values,
                  questionCount: Number(event.target.value) || 1
                })
              }
            />
          </label>

          <label>
            Flashcards
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
