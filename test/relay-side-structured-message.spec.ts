import { describe, expect, it } from "vitest";
import { FakeRelayHttpServer } from "./support/fakeRelayHttpServer.js";

describe("Relay-side structured message contract", () => {
  it("routes a loop.study message to @tutor without creating a supervisor controller task", async () => {
    const fakeRelay = new FakeRelayHttpServer();

    const response = await fakeRelay.fetch("http://relay.test/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        workspaceId: "workspace_study_advisor",
        to: "@tutor",
        source: "api",
        senderId: "loop.study",
        content: {
          type: "command",
          name: "loop_study.generate_initial_assessment",
          inputSchema: "LoopStudyGenerateInitialAssessmentInput.v1",
          expectedOutputSchema: "InitialAssessmentGenerationCandidate",
          input: {
            topic: "Coasts",
            rawSourceContent: "This source mentions @supervisor but routing should ignore that."
          },
          previewText: "loop.study requested an initial assessment for Coasts."
        },
        metadata: {
          product: "loop.study",
          learningLoopId: "loop_123",
          stage: "diagnosis",
          operation: "generateInitialAssessment",
          expectedOutputSchema: "InitialAssessmentGenerationCandidate",
          idempotencyKey: "loop-study:loop_123:generateInitialAssessment:abc"
        },
        idempotencyKey: "loop-study:loop_123:generateInitialAssessment:abc"
      })
    });

    expect(response.status).toBe(202);
    expect(fakeRelay.tasks).toHaveLength(1);
    expect(fakeRelay.tasks[0]?.kind).toBe("agent_task");
    expect(fakeRelay.tasks[0]?.to).toBe("@tutor");
  });

  it("preserves loop.study metadata on the message and inspection task", async () => {
    const fakeRelay = new FakeRelayHttpServer();

    const response = await fakeRelay.fetch("http://relay.test/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        workspaceId: "workspace_study_advisor",
        to: "@tutor",
        source: "api",
        senderId: "loop.study",
        content: {
          type: "command",
          name: "loop_study.generate_practice_activity",
          inputSchema: "LoopStudyGeneratePracticeActivityInput.v1",
          expectedOutputSchema: "PracticeActivityGenerationCandidate",
          input: {
            topic: "Coasts",
            learnerNote: "@agent appears here but should not alter routing."
          },
          previewText: "loop.study requested practice generation for Coasts."
        },
        metadata: {
          product: "loop.study",
          learningLoopId: "loop_456",
          stage: "practice",
          operation: "generatePracticeActivity",
          expectedOutputSchema: "PracticeActivityGenerationCandidate",
          idempotencyKey: "loop-study:loop_456:generatePracticeActivity:def"
        },
        idempotencyKey: "loop-study:loop_456:generatePracticeActivity:def"
      })
    });
    const body = await response.json() as { messageId: string };
    const inspectionResponse = await fakeRelay.fetch(
      `http://relay.test/v1/messages/${body.messageId}/inspection`,
      {
        method: "GET"
      }
    );
    const inspection = await inspectionResponse.json() as {
      message: { metadata?: Record<string, unknown> };
      task: { metadata?: Record<string, unknown> };
    };

    expect(inspection.message.metadata).toMatchObject({
      product: "loop.study",
      learningLoopId: "loop_456",
      stage: "practice",
      operation: "generatePracticeActivity"
    });
    expect(inspection.task.metadata).toMatchObject({
      product: "loop.study",
      learningLoopId: "loop_456",
      stage: "practice",
      operation: "generatePracticeActivity"
    });
  });

  it("fails the explicit supervisor/controller path with a clear domain error", async () => {
    const fakeRelay = new FakeRelayHttpServer();

    const response = await fakeRelay.fetch("http://relay.test/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        workspaceId: "workspace_study_advisor",
        to: "@supervisor",
        source: "api",
        senderId: "loop.study",
        content: {
          type: "text",
          text: "Delegate this through the supervisor controller."
        },
        metadata: {
          controllerId: "controller.supervisor_workplan",
          product: "loop.study"
        },
        idempotencyKey: "loop-study:explicit-supervisor"
      })
    });
    const payload = await response.json() as { message?: string };

    expect(response.status).toBe(400);
    expect(payload.message).toContain("requires controllerInput");
    expect(payload.message).not.toContain("expected object");
    expect(payload.message).not.toContain("received undefined");
  });

  it("produces inspectable task and result events for a successful fake response", async () => {
    const fakeRelay = new FakeRelayHttpServer();

    const response = await fakeRelay.fetch("http://relay.test/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        workspaceId: "workspace_study_advisor",
        to: "@tutor",
        source: "api",
        senderId: "loop.study",
        content: {
          type: "command",
          name: "loop_study.generate_study_plan",
          inputSchema: "LoopStudyGenerateStudyPlanInput.v1",
          expectedOutputSchema: "StudyPlanGenerationCandidate",
          input: {
            context: {
              learnerName: "Adam Skoudros",
              focusTopics: ["Coasts"],
              schedule: [{ day: "Monday", minutes: 30 }]
            }
          },
          previewText: "loop.study requested a study plan for Coasts."
        },
        metadata: {
          product: "loop.study",
          learningLoopId: "loop_789",
          stage: "planning",
          operation: "generateStudyPlan",
          expectedOutputSchema: "StudyPlanGenerationCandidate",
          idempotencyKey: "loop-study:loop_789:generateStudyPlan:ghi"
        },
        idempotencyKey: "loop-study:loop_789:generateStudyPlan:ghi"
      })
    });
    const body = await response.json() as { messageId: string };
    const inspectionResponse = await fakeRelay.fetch(
      `http://relay.test/v1/messages/${body.messageId}/inspection`,
      {
        method: "GET"
      }
    );
    const inspection = await inspectionResponse.json() as {
      events: Array<{ type: string }>;
      responseContent?: unknown;
      responseText: string;
      resultEvents: Array<{ artifactId: string; type: string }>;
      task: { id: string; kind: string };
    };

    expect(inspection.task.id).toBeTruthy();
    expect(inspection.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["message.received", "task.created"])
    );
    expect(inspection.resultEvents[0]).toMatchObject({
      artifactId: expect.any(String),
      type: "result.produced"
    });
    expect(inspection.responseContent).toBeTruthy();
  });
});
