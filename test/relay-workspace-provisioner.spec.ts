import { describe, expect, it } from "vitest";
import { InitialAssessmentContext } from "../src/domain/primitives/Context.js";
import { MasterDataItem, MasterDataSource } from "../src/domain/learning/MasterData.js";
import { RelayAgentRuntime } from "../src/modules/runtime/RelayAgentRuntime.js";
import {
  createLoopStudyRelayRuntimeProfile,
  defaultLoopStudyRelayRuntimeProfile
} from "../src/modules/runtime/LoopStudyRelayRuntimeProfile.js";
import { RelayWorkspaceBinding } from "../src/modules/runtime/RelayWorkspaceBinding.js";
import { RelayWorkspaceProvisioner } from "../src/modules/runtime/RelayWorkspaceProvisioner.js";
import type { RelayWorkspaceRecord } from "../src/modules/runtime/RelayWorkspaceTemplate.js";

function createWorkspaceRecord(overrides: Partial<RelayWorkspaceRecord> = {}): RelayWorkspaceRecord {
  return {
    id: "workspace_study_advisor",
    name: "Study Advisor Workspace",
    slug: "study-advisor-workspace",
    status: "active",
    defaultControllerId: undefined,
    context: {
      operatingInstructions: [],
      defaultSupervisorAgentHandle: "tutor",
      availableAgentHandles: ["tutor"]
    },
    defaultPolicy: {
      requireApprovalForSideEffects: [],
      allowTaskCreationFromConversation: true,
      allowMessageOnlyResponses: true,
      allowSupervisorDelegation: false,
      allowAgentToAgentDelegation: false
    },
    createdAt: "2026-05-30T00:00:00.000Z",
    updatedAt: "2026-05-30T00:00:00.000Z",
    ...overrides
  };
}

function createRelayBinding(overrides: {
  baseUrl?: string;
  workspaceId?: string;
} = {}): RelayWorkspaceBinding {
  return RelayWorkspaceBinding.create({
    baseUrl: overrides.baseUrl ?? "http://relay.test",
    profile: createLoopStudyRelayRuntimeProfile({
      ...defaultLoopStudyRelayRuntimeProfile,
      workspace: {
        ...defaultLoopStudyRelayRuntimeProfile.workspace,
        id:
          overrides.workspaceId ?? defaultLoopStudyRelayRuntimeProfile.workspace.id
      },
      capabilityRoutes: {
        ...defaultLoopStudyRelayRuntimeProfile.capabilityRoutes
      },
      requiredAgentHandles: [...defaultLoopStudyRelayRuntimeProfile.requiredAgentHandles],
      requiredControllerIds: [
        ...defaultLoopStudyRelayRuntimeProfile.requiredControllerIds
      ],
      requiredSkillIds: [...defaultLoopStudyRelayRuntimeProfile.requiredSkillIds],
      operatingInstructions: [
        ...defaultLoopStudyRelayRuntimeProfile.operatingInstructions
      ],
      defaultPolicy: {
        ...defaultLoopStudyRelayRuntimeProfile.defaultPolicy,
        requireApprovalForSideEffects: [
          ...defaultLoopStudyRelayRuntimeProfile.defaultPolicy.requireApprovalForSideEffects
        ]
      }
    })
  });
}

describe("Relay workspace provisioner", () => {
  it("creates a missing Relay workspace when Relay returns not found", async () => {
    const calls: { method: string; url: string }[] = [];
    const binding = createRelayBinding();
    const workspace = createWorkspaceRecord();
    const fetcher = (async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? "GET";
      calls.push({ method, url });

      if (url.endsWith("/v1/workspaces/workspace_study_advisor") && method === "GET") {
        return new Response(JSON.stringify({ error: "workspace_not_found" }), {
          status: 404,
          headers: { "content-type": "application/json" }
        });
      }

      if (url.endsWith("/v1/workspaces") && method === "POST") {
        return new Response(JSON.stringify(workspace), {
          status: 201,
          headers: { "content-type": "application/json" }
        });
      }

      if (url.endsWith("/v1/workspaces/workspace_study_advisor/status") && method === "GET") {
        return new Response(
          JSON.stringify({
            workspace,
            defaultControllerId: undefined,
            agentHandles: ["@tutor"],
            controllerIds: [],
            skillIds: [],
            toolIds: []
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }

      throw new Error(`Unexpected request ${method} ${url}`);
    }) as typeof fetch;

    const provisioner = new RelayWorkspaceProvisioner({
      binding,
      fetcher
    });

    const provisioned = await provisioner.ensureProvisionedBinding();

    expect(provisioned.workspaceId).toBe("workspace_study_advisor");
    expect(calls).toEqual([
      { method: "GET", url: "http://relay.test/v1/workspaces/workspace_study_advisor" },
      { method: "POST", url: "http://relay.test/v1/workspaces" },
      { method: "GET", url: "http://relay.test/v1/workspaces/workspace_study_advisor/status" }
    ]);
  });

  it("reuses an existing Relay workspace when it is already suitable", async () => {
    const calls: { method: string; url: string }[] = [];
    const binding = createRelayBinding();
    const workspace = createWorkspaceRecord();
    const fetcher = (async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? "GET";
      calls.push({ method, url });

      if (url.endsWith("/v1/workspaces/workspace_study_advisor") && method === "GET") {
        return new Response(JSON.stringify(workspace), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (url.endsWith("/v1/workspaces/workspace_study_advisor/status") && method === "GET") {
        return new Response(
          JSON.stringify({
            workspace,
            defaultControllerId: undefined,
            agentHandles: ["@tutor"],
            controllerIds: [],
            skillIds: [],
            toolIds: []
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }

      throw new Error(`Unexpected request ${method} ${url}`);
    }) as typeof fetch;

    const provisioner = new RelayWorkspaceProvisioner({
      binding,
      fetcher
    });

    const provisioned = await provisioner.ensureProvisionedBinding();

    expect(provisioned.workspaceId).toBe("workspace_study_advisor");
    expect(calls).toEqual([
      { method: "GET", url: "http://relay.test/v1/workspaces/workspace_study_advisor" },
      { method: "GET", url: "http://relay.test/v1/workspaces/workspace_study_advisor/status" }
    ]);
  });

  it("lets RelayAgentRuntime use a provisioned binding", async () => {
    const binding = createRelayBinding();
    const provisioner = new RelayWorkspaceProvisioner({
      binding,
      fetcher: (async (input, init) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const method = init?.method ?? "GET";

        if (url.endsWith("/v1/workspaces/workspace_study_advisor") && method === "GET") {
          return new Response(JSON.stringify(createWorkspaceRecord()), {
            status: 200,
            headers: { "content-type": "application/json" }
          });
        }

        if (url.endsWith("/v1/workspaces/workspace_study_advisor/status") && method === "GET") {
          return new Response(
            JSON.stringify({
              workspace: createWorkspaceRecord(),
              defaultControllerId: undefined,
              agentHandles: ["@tutor"],
              controllerIds: [],
              skillIds: [],
              toolIds: []
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" }
            }
          );
        }

        throw new Error(`Unexpected provisioning request ${method} ${url}`);
      }) as typeof fetch
    });
    const provisionedBinding = await provisioner.ensureProvisionedBinding();
    const calls: { to: string; workspaceId: string }[] = [];
    const runtime = new RelayAgentRuntime({
      binding: provisionedBinding,
      fetcher: (async (input, init) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        const method = init?.method ?? "GET";

        if (url.endsWith("/v1/messages/relay_message_test/inspection") && method === "GET") {
          return new Response(
            JSON.stringify({
              artifacts: [{ id: "relay_artifact_test" }],
              responseText: JSON.stringify({
                result: {
                  items: [
                    {
                      id: "assessment_item_1",
                      topic: "fractions",
                      prompt: "Simplify 6/8.",
                      canonicalAnswer: "three quarters",
                      visibleMaterial: "Fractions can describe equal parts of a whole.",
                      difficulty: "easy",
                      sourceMasterDataItemId: "master_data_1"
                    }
                  ],
                  artifactContent: {
                    topic: "fractions",
                    questionCount: 1,
                    instructions: "Complete the question without notes.",
                    items: [
                      {
                        id: "assessment_item_1",
                        prompt: "Simplify 6/8.",
                        difficulty: "easy"
                      }
                    ]
                  }
                }
              }),
              task: {
                id: "relay_task_test"
              },
              resultEvents: [{ artifactId: "relay_artifact_test" }]
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" }
            }
          );
        }

        const body = JSON.parse(String(init?.body ?? "{}")) as {
          to?: string;
          workspaceId?: string;
        };
        if (url.endsWith("/v1/messages") && method === "POST") {
          calls.push({
            to: String(body.to ?? ""),
            workspaceId: String(body.workspaceId ?? "")
          });
        }

        return new Response(
          JSON.stringify({
            conversationId: "relay_conversation_test",
            messageId: "relay_message_test",
            responseMessageId: "relay_response_test",
            taskId: "relay_task_test",
            responseText: JSON.stringify({
              result: {
                items: [
                  {
                    id: "assessment_item_1",
                    topic: "fractions",
                    prompt: "Simplify 6/8.",
                    canonicalAnswer: "three quarters",
                    visibleMaterial: "Fractions can describe equal parts of a whole.",
                    difficulty: "easy",
                    sourceMasterDataItemId: "master_data_1"
                  }
                ],
                artifactContent: {
                  topic: "fractions",
                  questionCount: 1,
                  instructions: "Complete the question without notes.",
                  items: [
                    {
                      id: "assessment_item_1",
                      prompt: "Simplify 6/8.",
                      difficulty: "easy"
                    }
                  ]
                }
              }
            })
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }) as typeof fetch
    });
    const source = MasterDataSource.create("Fractions Bank", []);
    const sourceItem = MasterDataItem.create(source.id, {
      topic: "fractions",
      prompt: "Simplify 6/8.",
      canonicalAnswer: "three quarters",
      visibleMaterial: "Fractions can describe equal parts of a whole."
    });
    const context = InitialAssessmentContext.create({
      command: {
        learnerName: "Year 7 learner",
        yearGroup: "Year 7",
        topic: "fractions",
        questionCount: 1
      },
      sourceName: source.name
    });

    const result = await runtime.generateInitialAssessment({
      context,
      learningLoopId: "loop_test",
      source,
      sourceItems: [sourceItem]
    });

    expect(result.ok).toBe(true);
    expect(calls).toEqual([
      {
        to: "@tutor",
        workspaceId: "workspace_study_advisor"
      }
    ]);
  });
});
