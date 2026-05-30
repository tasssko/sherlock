import { useState, type FormEvent } from "react";
import type { AssessmentSnapshot } from "../../../domain/learning/Assessment.js";

export interface AssessmentAttemptFormProps {
  assessment: AssessmentSnapshot;
  disabled: boolean;
  error: string | null;
  onSubmit: (responses: readonly { answer: string; itemId: string }[]) => Promise<void>;
}

export function AssessmentAttemptForm(props: AssessmentAttemptFormProps) {
  const { assessment, disabled, error, onSubmit } = props;
  const [answers, setAnswers] = useState<Record<string, string>>(
    Object.fromEntries(assessment.items.map((item) => [item.id, ""]))
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit(
      assessment.items.map((item) => ({
        itemId: item.id,
        answer: answers[item.id] ?? ""
      }))
    );
  }

  return (
    <section className="panel panel-form">
      <h2>4. Submit Assessment</h2>
      <form onSubmit={handleSubmit}>
        {assessment.items.map((item, index) => (
          <label key={item.id}>
            Question {index + 1}: {item.prompt}
            <textarea
              rows={3}
              value={answers[item.id] ?? ""}
              onChange={(event) =>
                setAnswers((current) => ({
                  ...current,
                  [item.id]: event.target.value
                }))
              }
            />
          </label>
        ))}

        <button type="submit" disabled={disabled}>
          {disabled ? "Submitting..." : "Submit assessment attempt"}
        </button>
      </form>

      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
