import { describe, expect, it } from "vitest";
import { createDomainEventRecorder } from "../src/domain/primitives/Event.js";
import { Workspace } from "../src/domain/primitives/Workspace.js";
import type { ArtifactId, TaskId, WorkPlanId } from "../src/domain/primitives/ids.js";

function taskId(): TaskId {
  return "task_workspace" as TaskId;
}

function workPlanId(): WorkPlanId {
  return "workplan_workspace" as WorkPlanId;
}

function artifactId(): ArtifactId {
  return "artifact_workspace" as ArtifactId;
}

describe("Workspace attachments", () => {
  it("owns attachment of tasks, work plans, artifacts, and event ids", () => {
    let workspace = Workspace.create({
      title: "Learner workspace",
      learner: {
        name: "Year 7 learner",
        yearGroup: "Year 7",
        availableMinutesByDay: { Monday: 30 }
      },
      activeObjective: "Build a study plan."
    });
    const events = createDomainEventRecorder(workspace.id);

    workspace = workspace.attachTask(taskId(), events);
    workspace = workspace.attachTask(taskId(), events);
    workspace = workspace.attachWorkPlan(workPlanId(), events);
    workspace = workspace.attachArtifact(artifactId(), events);
    workspace = workspace.recordEventLedger(events.all().map((event) => event.id));

    const snapshot = workspace.toSnapshot();
    expect(snapshot.taskIds).toEqual([taskId()]);
    expect(snapshot.workPlanIds).toEqual([workPlanId()]);
    expect(snapshot.artifactIds).toEqual([artifactId()]);
    expect(snapshot.eventIds).toHaveLength(3);
    expect(events.all().map((event) => event.type)).toEqual([
      "workspace.task-attached",
      "workspace.work-plan-attached",
      "workspace.artifact-attached"
    ]);
  });

  it("appends new event ids without losing the existing ledger", () => {
    let workspace = Workspace.create({
      title: "Learner workspace",
      learner: {
        name: "Year 7 learner",
        yearGroup: "Year 7",
        availableMinutesByDay: { Monday: 30 }
      },
      activeObjective: "Build a study plan."
    });

    workspace = workspace.recordEventLedger(["event_existing" as never]);
    workspace = workspace.appendEventLedger([
      "event_existing" as never,
      "event_new" as never
    ]);

    expect(workspace.toSnapshot().eventIds).toEqual([
      "event_existing",
      "event_new"
    ]);
  });
});
