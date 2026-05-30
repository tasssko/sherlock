import { describe, expect, it } from "vitest";
import { createDomainEventRecorder } from "../src/domain/primitives/Event.js";
import { Task } from "../src/domain/primitives/Task.js";
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
    const events = createDomainEventRecorder(createWorkspaceId());
    const task = Task.create(
      {
        workspaceId: createWorkspaceId(),
        title: "Complete dependent task",
        kind: "topic-plan",
        dependencies: [dependencyId],
        input: {
          objective: "Finish the dependent task.",
          facts: []
        },
        state: "running"
      },
      events
    );

    const result = task.complete(
      {
        artifactIds: [],
        summary: "Complete the task."
      },
      new Set(),
      events
    );

    expect(result.ok).toBe(false);
  });

  it("allows completion once dependencies are complete", () => {
    const dependencyId = createDependencyId();
    const events = createDomainEventRecorder(createWorkspaceId());
    const task = Task.create(
      {
        workspaceId: createWorkspaceId(),
        title: "Complete dependent task",
        kind: "topic-plan",
        dependencies: [dependencyId],
        input: {
          objective: "Finish the dependent task.",
          facts: []
        },
        state: "running"
      },
      events
    );

    const result = task.complete(
      {
        artifactIds: [],
        summary: "Complete the task."
      },
      new Set([dependencyId]),
      events
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.toSnapshot().state).toBe("completed");
    }
  });
});

