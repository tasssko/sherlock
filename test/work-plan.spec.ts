import { describe, expect, it } from "vitest";
import { createDomainEventRecorder } from "../src/domain/primitives/Event.js";
import { WorkPlan } from "../src/domain/primitives/WorkPlan.js";
import type { ArtifactId, WorkspaceId } from "../src/domain/primitives/ids.js";

function createWorkspaceId(): WorkspaceId {
  return "workspace_workplan" as WorkspaceId;
}

function createArtifactId(): ArtifactId {
  return "artifact_workplan" as ArtifactId;
}

describe("WorkPlan behaviour", () => {
  it("records assumptions and artifact links through intentional methods", () => {
    const events = createDomainEventRecorder(createWorkspaceId());
    let workPlan = WorkPlan.create(
      {
        workspaceId: createWorkspaceId(),
        objective: "Build a study plan.",
        facts: [{ label: "objective", value: "Build a study plan." }],
        requiredCapabilities: ["study-plan.generate"],
        stages: [
          {
            id: "stage_1",
            title: "Fractions",
            objective: "Create the fractions study block.",
            taskIds: []
          }
        ],
        acceptanceCriteria: [
          {
            id: "criterion_1",
            description: "Return a structured result."
          }
        ]
      },
      events
    );

    workPlan = workPlan.recordAssumption(
      {
        id: "assumption_1",
        statement: "The learner can complete one session per day."
      },
      events
    );
    workPlan = workPlan.attachArtifact(createArtifactId(), events);

    expect(workPlan.toSnapshot().assumptions).toHaveLength(1);
    expect(workPlan.toSnapshot().artifactIds).toEqual([createArtifactId()]);
    expect(events.all().map((event) => event.type)).toEqual([
      "work-plan.created",
      "work-plan.assumption-recorded",
      "work-plan.artifact-attached"
    ]);
  });
});

