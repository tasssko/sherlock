import { useState, type FormEvent } from "react";
import type { PracticeActivitySnapshot, ReviewConfidence } from "../../../domain/learning/PracticeActivity.js";

export interface PracticeCompletionFormProps {
  disabled: boolean;
  error: string | null;
  practiceActivity: PracticeActivitySnapshot;
  onSubmit: (
    responses: readonly {
      confidence: ReviewConfidence;
      note?: string;
      practiceItemId: string;
      responseText: string;
    }[]
  ) => Promise<void>;
}

export function PracticeCompletionForm(props: PracticeCompletionFormProps) {
  const { disabled, error, onSubmit, practiceActivity } = props;
  function currentResponse(
    state: Record<string, { confidence: ReviewConfidence; note: string; responseText: string }>,
    itemId: string
  ) {
    return state[itemId] ?? {
      responseText: "",
      confidence: "medium" as ReviewConfidence,
      note: ""
    };
  }

  const [responses, setResponses] = useState<
    Record<string, { confidence: ReviewConfidence; note: string; responseText: string }>
  >(
    Object.fromEntries(
      practiceActivity.flashcardSet.cards.map((card) => [
        card.id,
        {
          responseText: "",
          confidence: "medium" as ReviewConfidence,
          note: ""
        }
      ])
    )
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit(
      practiceActivity.flashcardSet.cards.map((card) => ({
        practiceItemId: card.id,
        responseText: responses[card.id]?.responseText ?? "",
        confidence: responses[card.id]?.confidence ?? "medium",
        note: responses[card.id]?.note || undefined
      }))
    );
  }

  return (
    <section className="panel panel-form">
      <h2>8. Complete Active Review</h2>
      <form onSubmit={handleSubmit}>
        {practiceActivity.flashcardSet.cards.map((card, index) => (
          <div key={card.id} className="response-card">
            <p className="response-title">Card {index + 1}</p>
            <p>{card.front}</p>
            <label>
              Your response
              <textarea
                rows={3}
                value={responses[card.id]?.responseText ?? ""}
                onChange={(event) =>
                  setResponses((current) => ({
                    ...current,
                    [card.id]: {
                      ...currentResponse(current, card.id),
                      responseText: event.target.value
                    }
                  }))
                }
              />
            </label>

            <label>
              How sure are you?
              <select
                value={responses[card.id]?.confidence ?? "medium"}
                onChange={(event) =>
                  setResponses((current) => ({
                    ...current,
                    [card.id]: {
                      ...currentResponse(current, card.id),
                      confidence: event.target.value as ReviewConfidence
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
              Note
              <input
                value={responses[card.id]?.note ?? ""}
                onChange={(event) =>
                  setResponses((current) => ({
                    ...current,
                    [card.id]: {
                      ...currentResponse(current, card.id),
                      note: event.target.value
                    }
                  }))
                }
              />
            </label>
          </div>
        ))}

        <button type="submit" disabled={disabled}>
          {disabled ? "Saving review..." : "Save active review"}
        </button>
      </form>

      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
