import type { ArtifactSnapshot } from "../../../domain/primitives/Artifact.js";
import type { StudyPlanArtifactContent } from "../../../domain/study/StudyPlanning.js";

export interface ArtifactViewProps {
  artifact: ArtifactSnapshot<StudyPlanArtifactContent, "study-plan">;
}

export function ArtifactView(props: ArtifactViewProps) {
  const { artifact } = props;

  return (
    <div className="card">
      <h3>Study Plan Artifact</h3>
      <p>{artifact.content.summary}</p>
      <ul>
        {artifact.content.sessions.map((session) => (
          <li key={`${session.day}-${session.topic}`}>
            <strong>
              {session.day} · {session.minutes}m · {session.topic}
            </strong>
            <span>{session.activity}</span>
          </li>
        ))}
      </ul>
      <p>Provenance</p>
      <ul>
        <li>Controller: {artifact.provenance.controller}</li>
        <li>Version: {artifact.version}</li>
        <li>Decisions: {artifact.provenance.decisions.join(" | ")}</li>
      </ul>
    </div>
  );
}

