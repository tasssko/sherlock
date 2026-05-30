import type { TaskGraphSnapshot } from "../../../domain/primitives/TaskGraph.js";
import type { TaskSnapshot } from "../../../domain/primitives/Task.js";

export interface TaskGraphViewProps {
  blockedTaskIds: readonly string[];
  taskGraph: TaskGraphSnapshot;
  tasks: readonly TaskSnapshot[];
}

export function TaskGraphView(props: TaskGraphViewProps) {
  const { blockedTaskIds, taskGraph, tasks } = props;
  const taskById = new Map(tasks.map((task) => [task.id, task]));

  return (
    <div className="card">
      <h3>Task Graph</h3>
      <ul className="graph-list">
        {taskGraph.nodes.map((node) => {
          const task = taskById.get(node.taskId);
          const isRoot = node.taskId === taskGraph.rootTaskId;
          const isBlocked = blockedTaskIds.includes(node.taskId);

          return (
            <li key={node.taskId}>
              <strong>{task?.title ?? node.taskId}</strong>
              <span>
                {task?.state ?? "unknown"}
                {isRoot ? " · root" : ""}
                {isBlocked ? " · blocked" : ""}
              </span>
              <span>
                Parent: {node.parentTaskId ?? "none"} · Children:{" "}
                {node.childTaskIds.length > 0 ? node.childTaskIds.join(", ") : "none"}
              </span>
              <span>
                Dependencies: {node.dependencies.length > 0 ? node.dependencies.join(", ") : "none"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

