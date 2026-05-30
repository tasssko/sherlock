import type { NextActionProjection } from "../../../domain/study/NextAction.js";

export interface NextActionViewProps {
  learningLoopId: string;
  nextAction: NextActionProjection;
  phase: string;
}

export function NextActionView(props: NextActionViewProps) {
  const { learningLoopId, nextAction, phase } = props;

  return (
    <div className="card accent-card">
      <h3>Next Action</h3>
      <p>
        Loop {learningLoopId} · phase {phase}
      </p>
      <p>
        <strong>{nextAction.kind}</strong>
      </p>
      <p>{nextAction.summary}</p>
      {nextAction.relatedId ? <p>Related: {nextAction.relatedId}</p> : null}
    </div>
  );
}
