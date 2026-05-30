import type { FormEvent } from "react";
import type { StudyDay } from "../../../domain/study/StudySchedule.js";
import { studyDays } from "../../../domain/study/StudySchedule.js";
import type { StudyPlanRequestFormValues } from "../api/studyPlanClient.js";

export interface StudyPlanRequestFormProps {
  disabled: boolean;
  error: string | null;
  values: StudyPlanRequestFormValues;
  onMinutesChange: (day: StudyDay, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onValuesChange: (nextValues: StudyPlanRequestFormValues) => void;
}

export function StudyPlanRequestForm(props: StudyPlanRequestFormProps) {
  const { disabled, error, values, onMinutesChange, onSubmit, onValuesChange } = props;

  return (
    <section className="panel panel-form">
      <h2>Plan Request</h2>
      <form onSubmit={onSubmit}>
        <label>
          Learner
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
          Objective
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

        <label>
          Topics
          <input
            value={values.topics}
            onChange={(event) =>
              onValuesChange({
                ...values,
                topics: event.target.value
              })
            }
          />
        </label>

        <div className="minutes-grid">
          {studyDays.map((day) => (
            <label key={day}>
              {day}
              <input
                type="number"
                min={0}
                value={values.minutes[day]}
                onChange={(event) => onMinutesChange(day, event.target.value)}
              />
            </label>
          ))}
        </div>

        <button type="submit" disabled={disabled}>
          {disabled ? "Creating plan..." : "Create weekly study plan"}
        </button>
      </form>

      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}

