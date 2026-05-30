import type { TaskId } from "./ids.js";
import { Task, type TaskSnapshot } from "./Task.js";
import { err, ok, type Result } from "./result.js";

export interface TaskGraphNodeSnapshot {
  taskId: TaskId;
  parentTaskId?: TaskId;
  childTaskIds: readonly TaskId[];
  dependencies: readonly TaskId[];
}

export interface TaskGraphSnapshot {
  rootTaskId: TaskId;
  nodes: readonly TaskGraphNodeSnapshot[];
}

export class TaskGraph {
  private constructor(private readonly snapshot: TaskGraphSnapshot) {}

  static create(rootTaskId: TaskId, tasks: readonly Task[]): Result<TaskGraph> {
    const taskSnapshots = tasks.map((task) => task.toSnapshot());
    const taskIds = new Set(taskSnapshots.map((task) => task.id));

    if (!taskIds.has(rootTaskId)) {
      return err({
        code: "VALIDATION_ERROR",
        message: `Task graph root ${rootTaskId} was not found in the task list.`
      });
    }

    for (const task of taskSnapshots) {
      if (task.parentTaskId && !taskIds.has(task.parentTaskId)) {
        return err({
          code: "VALIDATION_ERROR",
          message: `Task ${task.id} references missing parent ${task.parentTaskId}.`
        });
      }

      for (const dependencyId of task.dependencies) {
        if (!taskIds.has(dependencyId)) {
          return err({
            code: "VALIDATION_ERROR",
            message: `Task ${task.id} references missing dependency ${dependencyId}.`
          });
        }
      }
    }

    return ok(
      new TaskGraph({
        rootTaskId,
        nodes: taskSnapshots.map((task) => ({
          taskId: task.id,
          parentTaskId: task.parentTaskId,
          childTaskIds: [...task.childTaskIds],
          dependencies: [...task.dependencies]
        }))
      })
    );
  }

  blockedTaskIds(tasks: readonly Task[]): readonly TaskId[] {
    const taskSnapshots = tasks.map((task) => task.toSnapshot());
    const completedTaskIds = new Set(
      taskSnapshots.filter((task) => task.state === "completed").map((task) => task.id)
    );
    const taskById = new Map(taskSnapshots.map((task) => [task.id, task]));

    return this.snapshot.nodes
      .filter((node) => {
        const task = taskById.get(node.taskId);

        if (!task || node.dependencies.length === 0) {
          return false;
        }

        return node.dependencies.some((dependencyId) => !completedTaskIds.has(dependencyId));
      })
      .map((node) => node.taskId);
  }

  toSnapshot(): TaskGraphSnapshot {
    return {
      rootTaskId: this.snapshot.rootTaskId,
      nodes: this.snapshot.nodes.map((node) => ({
        ...node,
        childTaskIds: [...node.childTaskIds],
        dependencies: [...node.dependencies]
      }))
    };
  }
}
