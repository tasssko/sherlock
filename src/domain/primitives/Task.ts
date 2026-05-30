import type { ArtifactId } from "./ids.js";
import type { TaskId, WorkspaceId } from "./ids.js";
import { createTaskId } from "./ids.js";
import { err, ok, type Result } from "./result.js";

export type TaskState =
  | "blocked"
  | "cancelled"
  | "completed"
  | "created"
  | "failed"
  | "planned"
  | "ready"
  | "running";

export type TaskKind = "study-plan" | "topic-plan";

export interface TaskInput {
  objective: string;
  facts: readonly string[];
  topic?: string;
}

export interface TaskOutput {
  artifactIds: readonly ArtifactId[];
  summary: string;
}

export interface Task {
  id: TaskId;
  workspaceId: WorkspaceId;
  title: string;
  kind: TaskKind;
  state: TaskState;
  parentTaskId?: TaskId;
  childTaskIds: readonly TaskId[];
  dependencies: readonly TaskId[];
  input: TaskInput;
  output?: TaskOutput;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskInput {
  workspaceId: WorkspaceId;
  title: string;
  kind: TaskKind;
  input: TaskInput;
  parentTaskId?: TaskId;
  childTaskIds?: readonly TaskId[];
  dependencies?: readonly TaskId[];
  state?: TaskState;
}

const allowedTransitions: Record<TaskState, readonly TaskState[]> = {
  blocked: ["cancelled", "failed", "ready"],
  cancelled: [],
  completed: [],
  created: ["cancelled", "planned"],
  failed: [],
  planned: ["blocked", "cancelled", "ready"],
  ready: ["blocked", "cancelled", "running"],
  running: ["blocked", "completed", "failed"]
};

export function createTask(input: CreateTaskInput): Task {
  const now = new Date().toISOString();

  return {
    id: createTaskId(),
    workspaceId: input.workspaceId,
    title: input.title,
    kind: input.kind,
    state: input.state ?? "created",
    parentTaskId: input.parentTaskId,
    childTaskIds: input.childTaskIds ?? [],
    dependencies: input.dependencies ?? [],
    input: input.input,
    createdAt: now,
    updatedAt: now
  };
}

export function withTaskChildren(task: Task, childTaskIds: readonly TaskId[]): Task {
  return {
    ...task,
    childTaskIds,
    updatedAt: new Date().toISOString()
  };
}

export function withTaskOutput(task: Task, output: TaskOutput): Task {
  return {
    ...task,
    output,
    updatedAt: new Date().toISOString()
  };
}

export function transitionTask(
  task: Task,
  nextState: TaskState,
  completedDependencyIds: ReadonlySet<TaskId>
): Result<Task> {
  if (task.state === nextState) {
    return ok(task);
  }

  if (!allowedTransitions[task.state].includes(nextState)) {
    return err({
      code: "STATE_CONFLICT",
      message: `Task ${task.id} cannot transition from ${task.state} to ${nextState}.`
    });
  }

  if ((nextState === "ready" || nextState === "completed") && task.dependencies.length > 0) {
    const unresolved = task.dependencies.find(
      (dependencyId) => !completedDependencyIds.has(dependencyId)
    );

    if (unresolved) {
      return err({
        code: "STATE_CONFLICT",
        message: `Task ${task.id} cannot enter ${nextState} while dependency ${unresolved} is incomplete.`
      });
    }
  }

  return ok({
    ...task,
    state: nextState,
    updatedAt: new Date().toISOString()
  });
}

