import { describe, expect, it } from "vitest";
import { FakeRelayHttpServer } from "./support/fakeRelayHttpServer.js";

describe("Relay-side structured message contract", () => {
  it("routes a generic runtime command to @tutor without creating a supervisor controller task", async () => {
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
          name: "runtime.generate_structured_candidate",
          inputSchema: "RuntimeGenerateStructuredCandidateInput.v1",
          expectedOutputSchema: "InitialAssessmentGenerationCandidate",
          input: {
            candidateKind: "initial_assessment",
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
    const body = await response.json() as { messageId: string };
    const inspectionResponse = await fakeRelay.fetch(
      `http://relay.test/v1/messages/${body.messageId}/inspection`,
      {
        method: "GET"
      }
    );
    const inspection = await inspectionResponse.json() as {
      events: Array<{ type: string }>;
    };
    expect(inspection.events.map((event) => event.type)).toContain("command.executed_directly");
    expect(inspection.events.map((event) => event.type)).not.toContain(
      "supervisor.decision_made"
    );
  });

  it("routes runtime.evaluate_structured_response to @tutor as a direct agent task", async () => {
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
          name: "runtime.evaluate_structured_response",
          inputSchema: "RuntimeEvaluateStructuredResponseInput.v1",
          expectedOutputSchema: "AssessmentAttemptEvaluationCandidate",
          input: {
            candidateKind: "assessment_attempt_evaluation",
            assessment: {
              topic: "Coasts",
              items: []
            },
            responses: []
          }
        },
        metadata: {
          product: "loop.study",
          learningLoopId: "loop_eval_1",
          stage: "diagnosis",
          operation: "evaluateAssessmentAttempt",
          expectedOutputSchema: "AssessmentAttemptEvaluationCandidate"
        }
      })
    });

    expect(response.status).toBe(202);
    expect(fakeRelay.tasks[0]?.kind).toBe("agent_task");
    expect(fakeRelay.tasks[0]?.to).toBe("@tutor");
    const body = await response.json() as { messageId: string };
    const inspectionResponse = await fakeRelay.fetch(
      `http://relay.test/v1/messages/${body.messageId}/inspection`,
      { method: "GET" }
    );
    const inspection = await inspectionResponse.json() as {
      events: Array<{ type: string }>;
      responseContent?: unknown;
    };

    expect(inspection.events.map((event) => event.type)).toContain(
      "command.executed_directly"
    );
    expect(inspection.events.map((event) => event.type)).not.toContain(
      "supervisor.decision_made"
    );
    expect(inspection.responseContent).toBeTruthy();
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
          name: "runtime.generate_structured_candidate",
          inputSchema: "RuntimeGenerateStructuredCandidateInput.v1",
          expectedOutputSchema: "PracticeActivityGenerationCandidate",
          input: {
            candidateKind: "practice_activity",
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
          name: "runtime.generate_structured_candidate",
          inputSchema: "RuntimeGenerateStructuredCandidateInput.v1",
          expectedOutputSchema: "StudyPlanGenerationCandidate",
          input: {
            candidateKind: "study_plan",
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

  it("still uses supervisor inference for normal text messages", async () => {
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
          type: "text",
          text: "Please help with an assessment for Coasts."
        },
        metadata: {
          product: "loop.study",
          learningLoopId: "loop_text_1"
        }
      })
    });

    expect(response.status).toBe(202);
    expect(fakeRelay.tasks[0]?.kind).toBe("controller_task");
    const body = await response.json() as { messageId: string };
    const inspectionResponse = await fakeRelay.fetch(
      `http://relay.test/v1/messages/${body.messageId}/inspection`,
      { method: "GET" }
    );
    const inspection = await inspectionResponse.json() as {
      events: Array<{ type: string }>;
    };

    expect(inspection.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["work_requirement.inferred", "supervisor.decision_made"])
    );
  });

  it("does not let supervisor delegation policy block direct structured command execution", async () => {
    const fakeRelay = new FakeRelayHttpServer({
      commandExecutionPolicy: {
        allowDirectCommandExecution: true,
        allowedCommandNames: ["runtime.generate_structured_candidate"]
      }
    });

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
          name: "runtime.generate_structured_candidate",
          inputSchema: "RuntimeGenerateStructuredCandidateInput.v1",
          expectedOutputSchema: "InitialAssessmentGenerationCandidate",
          input: {
            candidateKind: "initial_assessment",
            topic: "Coasts"
          }
        },
        metadata: {
          product: "loop.study",
          operation: "generateInitialAssessment"
        }
      })
    });

    expect(response.status).toBe(202);
    expect(fakeRelay.tasks[0]?.kind).toBe("agent_task");
  });

  it("fails a disallowed command with a clear structured error", async () => {
    const fakeRelay = new FakeRelayHttpServer({
      commandExecutionPolicy: {
        allowDirectCommandExecution: true,
        registeredCommandNames: ["runtime.generate_structured_candidate", "runtime.unknown_command"],
        allowedCommandNames: ["runtime.generate_structured_candidate"]
      }
    });

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
          name: "runtime.unknown_command",
          inputSchema: "RuntimeGenerateStructuredCandidateInput.v1",
          expectedOutputSchema: "InitialAssessmentGenerationCandidate",
          input: {
            candidateKind: "initial_assessment",
            topic: "Coasts"
          }
        },
        metadata: {
          product: "loop.study",
          operation: "generateInitialAssessment"
        }
      })
    });
    const payload = await response.json() as {
      code?: string;
      message?: string;
      schema?: string;
    };

    expect(response.status).toBe(403);
    expect(payload.schema).toBe("RelayCommandError.v1");
    expect(payload.code).toBe("COMMAND_NOT_ALLOWED");
    expect(payload.message).toContain("runtime.unknown_command");
  });

  it("fails an unregistered command with RelayCommandError.v1", async () => {
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
          name: "runtime.unknown_command",
          inputSchema: "RuntimeGenerateStructuredCandidateInput.v1",
          expectedOutputSchema: "InitialAssessmentGenerationCandidate",
          input: {
            candidateKind: "initial_assessment",
            topic: "Coasts"
          }
        },
        metadata: {
          product: "loop.study",
          operation: "generateInitialAssessment"
        }
      })
    });
    const payload = await response.json() as {
      code?: string;
      message?: string;
      schema?: string;
    };

    expect(response.status).toBe(404);
    expect(payload.schema).toBe("RelayCommandError.v1");
    expect(payload.code).toBe("COMMAND_NOT_REGISTERED");
    expect(payload.message).toContain("runtime.unknown_command");
  });

  it("fails a direct command with no capable route using a structured routing error", async () => {
    const fakeRelay = new FakeRelayHttpServer();

    const response = await fakeRelay.fetch("http://relay.test/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        workspaceId: "workspace_study_advisor",
        source: "api",
        senderId: "loop.study",
        content: {
          type: "command",
          name: "runtime.generate_structured_candidate",
          inputSchema: "RuntimeGenerateStructuredCandidateInput.v1",
          expectedOutputSchema: "InitialAssessmentGenerationCandidate",
          input: {
            candidateKind: "initial_assessment",
            topic: "Coasts"
          }
        },
        metadata: {
          product: "loop.study",
          operation: "generateInitialAssessment"
        }
      })
    });
    const payload = await response.json() as {
      code?: string;
      message?: string;
      schema?: string;
    };

    expect(response.status).toBe(422);
    expect(payload.schema).toBe("RelayCommandError.v1");
    expect(payload.code).toBe("NO_CAPABLE_ROUTE");
    expect(payload.message).toContain("runtime.generate_structured_candidate");
  });
});
