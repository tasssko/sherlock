import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RelayAgentRuntime } from "../src/modules/runtime/RelayAgentRuntime.js";
import {
  createLoopStudyRelayRuntimeProfile,
  defaultLoopStudyRelayRuntimeProfile
} from "../src/modules/runtime/LoopStudyRelayRuntimeProfile.js";
import { RelayWorkspaceBinding } from "../src/modules/runtime/RelayWorkspaceBinding.js";
import {
  FakeRelayHttpServer,
  buildLoopStudyRelayResult
} from "./support/fakeRelayHttpServer.js";

const coastsRawSource = readFileSync(
  "docs/demo-master-data/@Y7 GEOGRAPHY COASTS – MASTER REVISION DOCUMENT.md",
  "utf8"
);
const relayCompatibilityCoastsResponse = JSON.parse(
  readFileSync("test/fixtures/relay-coasts-compat-response.json", "utf8")
) as Record<string, unknown>;

function createTutorRelayRuntime(
  fetcher: typeof fetch,
  diagnostics: {
    info(bindings: Record<string, unknown>, message: string): void;
    warn(bindings: Record<string, unknown>, message: string): void;
  }
): RelayAgentRuntime {
  return new RelayAgentRuntime({
    binding: RelayWorkspaceBinding.create({
      baseUrl: "http://relay.test",
      profile: createLoopStudyRelayRuntimeProfile({
        ...defaultLoopStudyRelayRuntimeProfile,
        capabilityRoutes: {
          ...defaultLoopStudyRelayRuntimeProfile.capabilityRoutes,
          interpretMasterData: { agentHandle: "tutor" }
        },
        requiredAgentHandles: [
          ...defaultLoopStudyRelayRuntimeProfile.requiredAgentHandles,
          "tutor"
        ]
      })
    }),
    fetcher,
    diagnosticsLogger: diagnostics
  });
}

async function interpretWithRuntime(
  runtime: RelayAgentRuntime,
  rawSourceContent = coastsRawSource
) {
  return runtime.interpretMasterData({
    sourceId: "upload:year-7-geography-coasts",
    sourceName: "Year 7 Geography: Coasts",
    rawSourceContent,
    contentType: "text/markdown",
    learnerYearGroup: "Year 7",
    userHints: {
      subject: "Geography",
      topic: "Coasts"
    },
    expectedOutputSchema: "MasterDataInterpretationCandidate.v1"
  });
}

describe("Relay structured response handling", () => {
  it("normalizes a direct Relay compatibility response from responseContent.value", async () => {
    const diagnostics: Array<{
      bindings: Record<string, unknown>;
      level: "info" | "warn";
      message: string;
    }> = [];
    const fakeRelay = new FakeRelayHttpServer({
      resolver: ({ operation, packet }) => ({
        result: buildLoopStudyRelayResult(operation, packet),
        responseContent: {
          type: "json",
          schema: "MasterDataInterpretationCandidate.v1",
          value: relayCompatibilityCoastsResponse
        },
        responseText: "__invalid_json_that_should_not_be_used__"
      })
    });
    const runtime = createTutorRelayRuntime(fakeRelay.fetch, {
      info(bindings, message) {
        diagnostics.push({ level: "info", bindings, message });
      },
      warn(bindings, message) {
        diagnostics.push({ level: "warn", bindings, message });
      }
    });

    const result = await interpretWithRuntime(runtime);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.interpretation.mainTopic).toBe("Coasts");
    expect(result.value.interpretation.detectedSubject).toBe("Geography");
    expect(result.value.interpretation.detectedYearGroup).toBe("Year 7");
    expect(result.value.interpretation.subtopics).toEqual(
      expect.arrayContaining([
        "Erosion",
        "Weathering",
        "Transportation",
        "Longshore Drift",
        "Coastal Defences"
      ])
    );
    expect(result.value.interpretation.learnerFacingMaterialSummary).toContain(
      "longshore drift"
    );
    expect(result.value.interpretation.learningObjectives).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: expect.any(String),
          objective: expect.stringContaining("longshore drift"),
          sourceRefs: expect.arrayContaining([expect.any(String)])
        })
      ])
    );
    expect(result.value.interpretation.sourceMap.length).toBeGreaterThan(0);
    expect(result.value.interpretation.keyTerms).toEqual(
      expect.arrayContaining(["erosion", "longshore drift", "hard engineering"])
    );
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: "info",
          bindings: {
            responseContentType: "json",
            responseContentSchema: "MasterDataInterpretationCandidate.v1",
            responseContentTopLevelKeys: ["schema", "type", "value"]
          }
        })
      ])
    );
    expect(JSON.stringify(diagnostics)).not.toContain("Hydraulic Action");
  });

  it("accepts a wrapped result envelope inside responseContent.value", async () => {
    const fakeRelay = new FakeRelayHttpServer({
      resolver: ({ operation, packet }) => ({
        result: buildLoopStudyRelayResult(operation, packet),
        responseContent: {
          type: "json",
          schema: "MasterDataInterpretationCandidate.v1",
          value: {
            result: relayCompatibilityCoastsResponse
          }
        },
        responseText: "__invalid_json_that_should_not_be_used__"
      })
    });
    const runtime = createTutorRelayRuntime(fakeRelay.fetch, {
      info() {},
      warn() {}
    });

    const result = await interpretWithRuntime(runtime);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.interpretation.mainTopic).toBe("Coasts");
    expect(result.value.interpretation.learningObjectives).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          objective: expect.stringContaining("hard engineering")
        })
      ])
    );
  });

  it("accepts transition-era structuredOutput.valueJson wrappers", async () => {
    const fakeRelay = new FakeRelayHttpServer({
      resolver: ({ operation, packet }) => ({
        result: buildLoopStudyRelayResult(operation, packet),
        responseContent: {
          type: "json",
          schema: "MasterDataInterpretationCandidate.v1",
          structuredOutput: {
            valueJson: relayCompatibilityCoastsResponse
          }
        },
        responseText: "__invalid_json_that_should_not_be_used__"
      })
    });
    const runtime = createTutorRelayRuntime(fakeRelay.fetch, {
      info() {},
      warn() {}
    });

    const result = await interpretWithRuntime(runtime);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.interpretation.mainTopic).toBe("Coasts");
    expect(result.value.interpretation.sourceMap.length).toBeGreaterThan(0);
  });

  it("prefers structuredOutput on text responseContent before falling back to plain text parsing", async () => {
    const fakeRelay = new FakeRelayHttpServer({
      resolver: ({ operation, packet }) => ({
        result: buildLoopStudyRelayResult(operation, packet),
        responseContent: {
          type: "text",
          schema: "MasterDataInterpretationCandidate.v1",
          value: "Human-readable tutor summary that is not valid JSON.",
          structuredOutput: {
            valueJson: relayCompatibilityCoastsResponse
          }
        },
        responseText: "__invalid_json_that_should_not_be_used__"
      })
    });
    const runtime = createTutorRelayRuntime(fakeRelay.fetch, {
      info() {},
      warn() {}
    });

    const result = await interpretWithRuntime(runtime);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.interpretation.mainTopic).toBe("Coasts");
    expect(result.value.interpretation.detectedSubject).toBe("Geography");
  });

  it("accepts JSON embedded inside successful text responseContent", async () => {
    const candidate = relayCompatibilityCoastsResponse;
    const fakeRelay = new FakeRelayHttpServer({
      resolver: ({ operation, packet }) => ({
        result: buildLoopStudyRelayResult(operation, packet),
        responseContent: {
          type: "text",
          schema: "MasterDataInterpretationCandidate.v1",
          value: `Tutor summary:\n\n\`\`\`json\n${JSON.stringify(candidate, null, 2)}\n\`\`\``
        },
        responseText: "__invalid_json_that_should_not_be_used__"
      })
    });
    const runtime = createTutorRelayRuntime(fakeRelay.fetch, {
      info() {},
      warn() {}
    });

    const result = await interpretWithRuntime(runtime);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.interpretation.mainTopic).toBe("Coasts");
    expect(result.value.interpretation.learningObjectives.length).toBeGreaterThan(0);
  });

  it("rejects vague Relay compatibility output even after normalization", async () => {
    const fakeRelay = new FakeRelayHttpServer({
      resolver: ({ operation, packet }) => ({
        result: buildLoopStudyRelayResult(operation, packet),
        responseContent: {
          type: "json",
          schema: "MasterDataInterpretationCandidate.v1",
          value: {
            sourceId: "upload:year-7-geography-coasts",
            sourceName: "Year 7 Geography: Coasts",
            learnerYearGroup: "Year 7",
            topic: "Study",
            summary: "General study material for the topic.",
            learningObjectives: ["Revise the material carefully."],
            keyConcepts: ["Study"],
            mustKnow: ["Know the content."],
            vocabulary: [],
            tags: ["Study"]
          }
        },
        responseText: "__invalid_json_that_should_not_be_used__"
      })
    });
    const runtime = createTutorRelayRuntime(fakeRelay.fetch, {
      info() {},
      warn() {}
    });

    const result = await interpretWithRuntime(runtime);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("VALIDATION_ERROR");
    expect(result.error.message).toContain("specific main topic");
  });

  it("surfaces a learner-safe error for failed text responseContent", async () => {
    const diagnostics: Array<{
      bindings: Record<string, unknown>;
      level: "info" | "warn";
      message: string;
    }> = [];
    const fakeRelay = new FakeRelayHttpServer({
      resolver: ({ operation, packet }) => ({
        result: buildLoopStudyRelayResult(operation, packet),
        responseContent: {
          type: "text",
          schema: "MasterDataInterpretationCandidate.v1",
          status: "failed",
          value: "Model failed while interpreting source material."
        },
        responseText: "{\"result\":\"should_not_be_used\"}"
      })
    });
    const runtime = createTutorRelayRuntime(fakeRelay.fetch, {
      info(bindings, message) {
        diagnostics.push({ level: "info", bindings, message });
      },
      warn(bindings, message) {
        diagnostics.push({ level: "warn", bindings, message });
      }
    });

    const result = await interpretWithRuntime(runtime);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("STATE_CONFLICT");
    expect(result.error.message).toContain(
      "The material interpretation service could not prepare this study pack right now."
    );
    expect(result.error.message).toContain("Relay runtime returned a failed text response.");
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: "warn",
          bindings: {
            responseContentType: "text",
            responseContentSchema: "MasterDataInterpretationCandidate.v1",
            responseContentTopLevelKeys: ["schema", "status", "type", "value"]
          }
        })
      ])
    );
  });
});
