import { afterEach, describe, expect, it } from "vitest";
import { createServer, type RuntimeBootLogger } from "../src/app/api/createServer.js";
import {
  createLoopStudyRelayRuntimeProfile,
  defaultLoopStudyRelayRuntimeProfile
} from "../src/modules/runtime/LoopStudyRelayRuntimeProfile.js";
import { RelayWorkspaceBinding } from "../src/modules/runtime/RelayWorkspaceBinding.js";

const originalRuntimeMode = process.env.LOOP_STUDY_AGENT_RUNTIME;
const originalIntelligenceMode = process.env.LOOP_STUDY_INTELLIGENCE;
const originalOpenAiKey = process.env.OPENAI_API_KEY;
const originalRelayApiUrl = process.env.LOOP_STUDY_RELAY_API_URL;

function createRelayBinding(): RelayWorkspaceBinding {
  return RelayWorkspaceBinding.create({
    baseUrl: "http://relay.test",
    profile: createLoopStudyRelayRuntimeProfile({
      ...defaultLoopStudyRelayRuntimeProfile,
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

afterEach(() => {
  if (originalIntelligenceMode === undefined) {
    delete process.env.LOOP_STUDY_INTELLIGENCE;
  } else {
    process.env.LOOP_STUDY_INTELLIGENCE = originalIntelligenceMode;
  }

  if (originalRuntimeMode === undefined) {
    delete process.env.LOOP_STUDY_AGENT_RUNTIME;
  } else {
    process.env.LOOP_STUDY_AGENT_RUNTIME = originalRuntimeMode;
  }

  if (originalOpenAiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalOpenAiKey;
  }

  if (originalRelayApiUrl === undefined) {
    delete process.env.LOOP_STUDY_RELAY_API_URL;
    return;
  }

  process.env.LOOP_STUDY_RELAY_API_URL = originalRelayApiUrl;
});

describe("Runtime boot logging", () => {
  it("logs FixtureAgentRuntime startup in fixture mode", async () => {
    delete process.env.LOOP_STUDY_INTELLIGENCE;
    delete process.env.LOOP_STUDY_AGENT_RUNTIME;
    const messages: { bindings: Record<string, unknown>; message: string }[] = [];
    const runtimeBootLogger: RuntimeBootLogger = {
      info(bindings, message) {
        messages.push({ bindings, message });
      }
    };

    const server = await createServer({
      runtimeBootLogger
    });

    try {
      expect(messages).toEqual([
        {
          bindings: {
            runtimeMode: "fixture"
          },
          message: "loop.study booted with FixtureAgentRuntime."
        }
      ]);
    } finally {
      await server.close();
    }
  });

  it("logs OpenAIStudyIntelligence startup in openai mode", async () => {
    process.env.LOOP_STUDY_INTELLIGENCE = "openai";
    process.env.OPENAI_API_KEY = "test-key";
    const messages: { bindings: Record<string, unknown>; message: string }[] = [];
    const runtimeBootLogger: RuntimeBootLogger = {
      info(bindings, message) {
        messages.push({ bindings, message });
      }
    };

    const server = await createServer({
      runtimeBootLogger
    });

    try {
      expect(messages).toEqual([
        {
          bindings: {
            runtimeMode: "openai"
          },
          message: "loop.study booted with OpenAIStudyIntelligence."
        }
      ]);
    } finally {
      await server.close();
    }
  });

  it("logs RelayAgentRuntime startup with the provisioned binding in relay mode", async () => {
    process.env.LOOP_STUDY_INTELLIGENCE = "relay";
    process.env.LOOP_STUDY_RELAY_API_URL = "http://relay.test";
    const messages: { bindings: Record<string, unknown>; message: string }[] = [];
    const runtimeBootLogger: RuntimeBootLogger = {
      info(bindings, message) {
        messages.push({ bindings, message });
      }
    };
    const binding = createRelayBinding();

    const server = await createServer({
      runtimeBootLogger,
      relayWorkspaceProvisioner: {
        ensureProvisionedBinding: async () => binding
      }
    });

    try {
      expect(messages).toEqual([
        {
          bindings: {
            runtimeMode: "relay",
            relayWorkspaceId: "workspace_study_advisor",
            defaultAgentHandle: "tutor"
          },
          message:
            "loop.study booted with RelayAgentRuntime and provisioned the Relay workspace binding."
        }
      ]);
    } finally {
      await server.close();
    }
  });
});
