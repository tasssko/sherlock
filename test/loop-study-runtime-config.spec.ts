import { describe, expect, it } from "vitest";
import { loadLoopStudyRuntimeConfig } from "../src/modules/runtime/LoopStudyRuntimeConfig.js";

describe("Loop study runtime config", () => {
  it("defaults to fixture mode with no Relay environment", () => {
    const config = loadLoopStudyRuntimeConfig({});

    expect(config).toEqual({
      runtimeMode: "fixture",
      compatibilityWarnings: []
    });
  });

  it("boots Relay mode with only the loop.study runtime flag and Relay API URL", () => {
    const config = loadLoopStudyRuntimeConfig({
      LOOP_STUDY_AGENT_RUNTIME: "relay",
      LOOP_STUDY_RELAY_API_URL: "http://relay.test"
    });

    expect(config.runtimeMode).toBe("relay");
    expect(config.compatibilityWarnings).toEqual([]);
    expect(config.relay?.baseUrl).toBe("http://relay.test");
    expect(config.relay?.profile.workspace.id).toBe("workspace_study_advisor");
    expect(config.relay?.profile.capabilityRoutes.generateInitialAssessment.agentHandle).toBe(
      "supervisor"
    );
    expect(config.relay?.profile.capabilityRoutes.evaluateAssessmentAttempt.agentHandle).toBe(
      "supervisor"
    );
    expect(config.relay?.profile.capabilityRoutes.generateStudyPlan.agentHandle).toBe(
      "supervisor"
    );
    expect(config.relay?.profile.capabilityRoutes.generatePracticeActivity.agentHandle).toBe(
      "supervisor"
    );
  });

  it("supports deprecated Relay variables through a compatibility layer", () => {
    const config = loadLoopStudyRuntimeConfig({
      SHERLOCK_AGENT_RUNTIME: "relay",
      RELAY_API_URL: "http://relay-legacy.test",
      RELAY_WORKSPACE_ID: "workspace_legacy",
      RELAY_DEFAULT_AGENT_HANDLE: "legacy-supervisor",
      RELAY_CONTROLLER_ID: "controller.legacy",
      RELAY_ASSESSMENT_AGENT_HANDLE: "assessor",
      RELAY_REVIEW_AGENT_HANDLE: "reviewer",
      RELAY_PRACTICE_AGENT_HANDLE: "coach",
      RELAY_STUDY_PLAN_AGENT_HANDLE: "planner"
    });

    expect(config.runtimeMode).toBe("relay");
    expect(config.relay?.baseUrl).toBe("http://relay-legacy.test");
    expect(config.relay?.profile.workspace.id).toBe("workspace_legacy");
    expect(config.relay?.profile.defaultAgentHandle).toBe("legacy-supervisor");
    expect(config.relay?.profile.defaultControllerId).toBe("controller.legacy");
    expect(config.relay?.profile.capabilityRoutes.generateInitialAssessment.agentHandle).toBe(
      "assessor"
    );
    expect(config.relay?.profile.capabilityRoutes.evaluateAssessmentAttempt.agentHandle).toBe(
      "reviewer"
    );
    expect(config.relay?.profile.capabilityRoutes.generatePracticeActivity.agentHandle).toBe(
      "coach"
    );
    expect(config.relay?.profile.capabilityRoutes.generateStudyPlan.agentHandle).toBe(
      "planner"
    );
    expect(config.compatibilityWarnings).toEqual(
      expect.arrayContaining([
        "SHERLOCK_AGENT_RUNTIME is deprecated. Use LOOP_STUDY_AGENT_RUNTIME.",
        "RELAY_API_URL is deprecated. Use LOOP_STUDY_RELAY_API_URL.",
        "RELAY_WORKSPACE_ID is deprecated. Use LOOP_STUDY_RELAY_WORKSPACE_ID.",
        "RELAY_DEFAULT_AGENT_HANDLE is deprecated. Use LOOP_STUDY_RELAY_TEMPLATE_PATH or a versioned profile instead."
      ])
    );
  });

  it("loads a custom Relay runtime profile from LOOP_STUDY_RELAY_TEMPLATE_PATH", () => {
    const config = loadLoopStudyRuntimeConfig(
      {
        LOOP_STUDY_AGENT_RUNTIME: "relay",
        LOOP_STUDY_RELAY_API_URL: "http://relay.test",
        LOOP_STUDY_RELAY_TEMPLATE_PATH: "/tmp/loop-study-profile.json"
      },
      {
        readTextFile: () =>
          JSON.stringify({
            id: "custom-profile",
            workspace: {
              id: "workspace_custom",
              name: "Custom Workspace",
              slug: "custom-workspace"
            },
            defaultAgentHandle: "custom-supervisor",
            defaultControllerId: "controller.custom",
            capabilityRoutes: {
              generateInitialAssessment: { agentHandle: "custom-supervisor" },
              evaluateAssessmentAttempt: { agentHandle: "custom-reviewer" },
              evaluateActiveReviewSession: { agentHandle: "custom-reviewer" },
              generateStudyPlan: { agentHandle: "custom-planner" },
              generatePracticeActivity: { agentHandle: "custom-coach" }
            },
            requiredAgentHandles: [
              "custom-supervisor",
              "custom-reviewer",
              "custom-planner",
              "custom-coach"
            ],
            requiredControllerIds: ["controller.custom"],
            requiredSkillIds: ["skill.loop_study"],
            operatingInstructions: ["Keep loop.study responses structured."],
            defaultPolicy: {
              requireApprovalForSideEffects: [],
              allowTaskCreationFromConversation: true,
              allowMessageOnlyResponses: true,
              allowSupervisorDelegation: true,
              allowAgentToAgentDelegation: false
            }
          })
      }
    );

    expect(config.runtimeMode).toBe("relay");
    expect(config.relay?.profile.id).toBe("custom-profile");
    expect(config.relay?.profile.workspace.id).toBe("workspace_custom");
    expect(config.relay?.profile.requiredSkillIds).toEqual(["skill.loop_study"]);
    expect(config.relay?.profile.capabilityRoutes.generatePracticeActivity.agentHandle).toBe(
      "custom-coach"
    );
  });
});
