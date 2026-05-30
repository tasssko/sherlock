import type { ArtifactId } from "./ids.js";
import type { TaskId, WorkspaceId } from "./ids.js";
import { createTaskId } from "./ids.js";
import type { DomainEventRecorder } from "./Event.js";
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

export type TaskKind = "assessment" | "practice-activity" | "study-plan" | "topic-plan";

export interface TaskInput {
  objective: string;
  facts: readonly string[];
  topic?: string;
}

export interface TaskOutput {
  artifactIds: readonly ArtifactId[];
  summary: string;
}

export interface TaskSnapshot {
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

export class Task {
  private constructor(private readonly snapshot: TaskSnapshot) {}

  static rehydrate(snapshot: TaskSnapshot): Task {
    return new Task({
      ...snapshot,
      childTaskIds: [...snapshot.childTaskIds],
      dependencies: [...snapshot.dependencies],
      input: {
        ...snapshot.input,
        facts: [...snapshot.input.facts]
      },
      output: snapshot.output
        ? {
            ...snapshot.output,
            artifactIds: [...snapshot.output.artifactIds]
          }
        : undefined
    });
  }

  static create(input: CreateTaskInput, events: DomainEventRecorder): Task {
    events.assertWorkspace(input.workspaceId);
    const now = new Date().toISOString();
    const task = new Task({
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
    });

    events.recordTaskCreated(task.id, task.title, task.state);

    return task;
  }

  get id(): TaskId {
    return this.snapshot.id;
  }

  get workspaceId(): WorkspaceId {
    return this.snapshot.workspaceId;
  }

  get title(): string {
    return this.snapshot.title;
  }

  get state(): TaskState {
    return this.snapshot.state;
  }

  get parentTaskId(): TaskId | undefined {
    return this.snapshot.parentTaskId;
  }

  get childTaskIds(): readonly TaskId[] {
    return this.snapshot.childTaskIds;
  }

  get dependencies(): readonly TaskId[] {
    return this.snapshot.dependencies;
  }

  plan(events: DomainEventRecorder): Result<Task> {
    return this.transitionTo("planned", new Set(), events);
  }

  markReady(completedDependencyIds: ReadonlySet<TaskId>, events: DomainEventRecorder): Result<Task> {
    return this.transitionTo("ready", completedDependencyIds, events);
  }

  start(events: DomainEventRecorder): Result<Task> {
    return this.transitionTo("running", new Set(this.snapshot.dependencies), events);
  }

  complete(
    output: TaskOutput,
    completedDependencyIds: ReadonlySet<TaskId>,
    events: DomainEventRecorder
  ): Result<Task> {
    const withOutput = new Task({
      ...this.snapshot,
      output: {
        artifactIds: [...output.artifactIds],
        summary: output.summary
      },
      updatedAt: new Date().toISOString()
    });

    return withOutput.transitionTo("completed", completedDependencyIds, events);
  }

  attachChildren(childTaskIds: readonly TaskId[]): Task {
    return new Task({
      ...this.snapshot,
      childTaskIds: [...childTaskIds],
      updatedAt: new Date().toISOString()
    });
  }

  dependOn(taskIds: readonly TaskId[]): Task {
    return new Task({
      ...this.snapshot,
      dependencies: [...taskIds],
      updatedAt: new Date().toISOString()
    });
  }

  toSnapshot(): TaskSnapshot {
    return {
      ...this.snapshot,
      childTaskIds: [...this.snapshot.childTaskIds],
      dependencies: [...this.snapshot.dependencies],
      input: {
        ...this.snapshot.input,
        facts: [...this.snapshot.input.facts]
      },
      output: this.snapshot.output
        ? {
            ...this.snapshot.output,
            artifactIds: [...this.snapshot.output.artifactIds]
          }
        : undefined
    };
  }

  private transitionTo(
    nextState: TaskState,
    completedDependencyIds: ReadonlySet<TaskId>,
    events: DomainEventRecorder
  ): Result<Task> {
    if (this.snapshot.state === nextState) {
      return ok(this);
    }

    if (!allowedTransitions[this.snapshot.state].includes(nextState)) {
      return err({
        code: "STATE_CONFLICT",
        message: `Task ${this.snapshot.id} cannot transition from ${this.snapshot.state} to ${nextState}.`
      });
    }

    if ((nextState === "ready" || nextState === "completed") && this.snapshot.dependencies.length > 0) {
      const unresolved = this.snapshot.dependencies.find(
        (dependencyId) => !completedDependencyIds.has(dependencyId)
      );

      if (unresolved) {
        return err({
          code: "STATE_CONFLICT",
          message: `Task ${this.snapshot.id} cannot enter ${nextState} while dependency ${unresolved} is incomplete.`
        });
      }
    }

    const nextTask = new Task({
      ...this.snapshot,
      state: nextState,
      updatedAt: new Date().toISOString()
    });

    events.recordTaskStateChanged(this.snapshot.id, this.snapshot.state, nextState);

    return ok(nextTask);
  }
}
