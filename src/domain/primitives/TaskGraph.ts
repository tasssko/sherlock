import type { TaskId } from "./ids.js";
import type { Task } from "./Task.js";
import { err, ok, type Result } from "./result.js";

export interface TaskGraphNode {
  taskId: TaskId;
  parentTaskId?: TaskId;
  childTaskIds: readonly TaskId[];
  dependencies: readonly TaskId[];
}

export interface TaskGraph {
  rootTaskId: TaskId;
  nodes: readonly TaskGraphNode[];
}

export function createTaskGraph(rootTaskId: TaskId, tasks: readonly Task[]): Result<TaskGraph> {
  const taskIds = new Set(tasks.map((task) => task.id));

  if (!taskIds.has(rootTaskId)) {
    return err({
      code: "VALIDATION_ERROR",
      message: `Task graph root ${rootTaskId} was not found in the task list.`
    });
  }

  for (const task of tasks) {
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

  return ok({
    rootTaskId,
    nodes: tasks.map((task) => ({
      taskId: task.id,
      parentTaskId: task.parentTaskId,
      childTaskIds: task.childTaskIds,
      dependencies: task.dependencies
    }))
  });
}

export function listBlockedTaskIds(
  graph: TaskGraph,
  tasks: readonly Task[]
): readonly TaskId[] {
  const completedTaskIds = new Set(
    tasks.filter((task) => task.state === "completed").map((task) => task.id)
  );
  const taskById = new Map(tasks.map((task) => [task.id, task]));

  return graph.nodes
    .filter((node) => {
      const task = taskById.get(node.taskId);

      if (!task || node.dependencies.length === 0) {
        return false;
      }

      return node.dependencies.some((dependencyId) => !completedTaskIds.has(dependencyId));
    })
    .map((node) => node.taskId);
}

