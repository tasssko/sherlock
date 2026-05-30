import { describe, expect, it } from "vitest";
import {
  Artifact,
  ArtifactProvenance
} from "../src/domain/primitives/Artifact.js";
import { createDomainEventRecorder } from "../src/domain/primitives/Event.js";
import type { WorkspaceId } from "../src/domain/primitives/ids.js";

function workspaceA(): WorkspaceId {
  return "workspace_artifact_a" as WorkspaceId;
}

function workspaceB(): WorkspaceId {
  return "workspace_artifact_b" as WorkspaceId;
}

describe("Artifact behaviour", () => {
  it("preserves provenance invariants and emits revision events", () => {
    const events = createDomainEventRecorder(workspaceA());
    const provenance = ArtifactProvenance.create({
      controller: "StudyPlanController",
      facts: ["learner: Year 7"],
      assumptions: ["One focused session per day."],
      decisions: ["Start with fractions."]
    });

    const created = Artifact.create(
      {
        workspaceId: workspaceA(),
        type: "study-plan",
        content: {
          summary: "Initial plan"
        },
        provenance
      },
      events
    );
    const revised = created.revise(
      {
        summary: "Revised plan"
      },
      ["Shift revision to Saturday."],
      events
    );

    expect(created.toSnapshot().version).toBe(1);
    expect(revised.toSnapshot().version).toBe(2);
    expect(revised.toSnapshot().provenance.controller).toBe("StudyPlanController");
    expect(revised.toSnapshot().provenance.facts).toEqual(["learner: Year 7"]);
    expect(revised.toSnapshot().provenance.decisions).toEqual(["Shift revision to Saturday."]);
    expect(events.all().map((event) => event.type)).toEqual([
      "artifact.generated",
      "artifact.revised"
    ]);
    expect(events.all().every((event) => event.workspaceId === workspaceA())).toBe(true);
  });

  it("rejects event recording against the wrong workspace", () => {
    const events = createDomainEventRecorder(workspaceA());
    const provenance = ArtifactProvenance.create({
      controller: "StudyPlanController",
      facts: [],
      assumptions: [],
      decisions: []
    });

    expect(() =>
      Artifact.create(
        {
          workspaceId: workspaceB(),
          type: "study-plan",
          content: {
            summary: "Invalid plan"
          },
          provenance
        },
        events
      )
    ).toThrow(/bound to workspace/);
  });
});

