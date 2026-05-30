import type { WorkspaceSnapshot } from "../../../domain/primitives/Workspace.js";
import type { AgentSnapshot } from "../../../domain/primitives/Agent.js";

export interface WorkspaceSnapshotViewProps {
  agent?: AgentSnapshot;
  workspace: WorkspaceSnapshot;
}

export function WorkspaceSnapshotView(props: WorkspaceSnapshotViewProps) {
  const { agent, workspace } = props;

  return (
    <div className="card">
      <h3>{workspace.title}</h3>
      <p>{workspace.activeObjective}</p>
      <p>
        Learner: {workspace.learner.name} · {workspace.learner.yearGroup}
      </p>
      <p>Support role: {agent?.role ?? "Learning guide"}</p>
      <p>
        Workspace attachments: {workspace.taskIds.length} tasks · {workspace.workPlanIds.length} work
        plan · {workspace.artifactIds.length} artifact
      </p>
    </div>
  );
}
