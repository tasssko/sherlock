import { describe, expect, it } from "vitest";
import { createTask, transitionTask } from "../src/domain/primitives/Task.js";
import type { TaskId, WorkspaceId } from "../src/domain/primitives/ids.js";

function createWorkspaceId(): WorkspaceId {
  return "workspace_test" as WorkspaceId;
}

function createDependencyId(): TaskId {
  return "task_dependency" as TaskId;
}

describe("Task lifecycle", () => {
  it("prevents completion before dependencies are complete", () => {
    const dependencyId = createDependencyId();
    const task = createTask({
      workspaceId: createWorkspaceId(),
      title: "Complete dependent task",
      kind: "topic-plan",
      dependencies: [dependencyId],
      input: {
        objective: "Finish the dependent task.",
        facts: []
      },
      state: "running"
    });

    const result = transitionTask(task, "completed", new Set());

    expect(result.ok).toBe(false);
  });

  it("allows completion once dependencies are complete", () => {
    const dependencyId = createDependencyId();
    const task = createTask({
      workspaceId: createWorkspaceId(),
      title: "Complete dependent task",
      kind: "topic-plan",
      dependencies: [dependencyId],
      input: {
        objective: "Finish the dependent task.",
        facts: []
      },
      state: "running"
    });

    const result = transitionTask(task, "completed", new Set([dependencyId]));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.state).toBe("completed");
    }
  });
});

