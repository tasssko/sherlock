import type { PracticeActivitySnapshot } from "../../../domain/learning/PracticeActivity.js";

export interface PracticeActivityViewProps {
  practiceActivity: PracticeActivitySnapshot;
}

export function PracticeActivityView(props: PracticeActivityViewProps) {
  const { practiceActivity } = props;

  return (
    <div className="card">
      <h3>Practice Activity</h3>
      <p>
        {practiceActivity.title} · {practiceActivity.kind} · next review {new Date(practiceActivity.nextReviewAt).toLocaleString()}
      </p>
      <p>{practiceActivity.flashcardSet.instructions}</p>
      <ul>
        {practiceActivity.flashcardSet.cards.map((card) => (
          <li key={card.id}>
            <strong>{card.front}</strong>
            <span>
              Target gap: {card.knowledgeGapId} · Source: {card.sourceMasterDataItemId}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
