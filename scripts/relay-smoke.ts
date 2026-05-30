import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { createServer } from "../src/app/api/createServer.js";
import { InitialAssessmentController } from "../src/modules/assessment/InitialAssessmentController.js";
import { MasterDataUploadController } from "../src/modules/assessment/MasterDataUploadController.js";
import { LearningLoopController } from "../src/modules/learning/LearningLoopController.js";
import { parseMasterDataInput } from "../src/modules/masterData/structuredRevision.js";
import {
  demoMasterDataRegistryById,
  type DemoMasterDataRegistryEntry
} from "../src/modules/masterData/demoMasterDataRegistry.js";
import { SqliteLearningLoopRepository } from "../src/modules/planning/SqliteLearningLoopRepository.js";
import {
  createLoopStudyRelayRuntimeProfile,
  defaultLoopStudyRelayRuntimeProfile
} from "../src/modules/runtime/LoopStudyRelayRuntimeProfile.js";
import { RelayAgentRuntime } from "../src/modules/runtime/RelayAgentRuntime.js";
import { RelayWorkspaceBinding } from "../src/modules/runtime/RelayWorkspaceBinding.js";
import {
  FakeRelayHttpServer,
  buildLoopStudyRelayResult,
  parseLoopStudyCommandContent
} from "../test/support/fakeRelayHttpServer.js";

const DEMO_ALIASES = new Map<string, string>([
  ["mary-i", "history-mary-i-md"],
  ["mary", "history-mary-i-md"],
  ["coasts", "geography-coasts-md"]
]);

function createTutorRelayRuntime(fetcher: typeof fetch): RelayAgentRuntime {
  return new RelayAgentRuntime({
    binding: RelayWorkspaceBinding.create({
      baseUrl: "http://relay.test",
      profile: createLoopStudyRelayRuntimeProfile({
        ...defaultLoopStudyRelayRuntimeProfile,
        capabilityRoutes: {
          interpretMasterData: { agentHandle: "tutor" },
          generateInitialAssessment: { agentHandle: "tutor" },
          evaluateAssessmentAttempt: { agentHandle: "tutor" },
          evaluateActiveReviewSession: { agentHandle: "tutor" },
          generateStudyPlan: { agentHandle: "tutor" },
          generatePracticeActivity: { agentHandle: "tutor" }
        },
        requiredAgentHandles: [
          ...defaultLoopStudyRelayRuntimeProfile.requiredAgentHandles,
          "tutor"
        ]
      })
    }),
    fetcher
  });
}

function resolveDemoSelection(rawSelection: string | undefined): DemoMasterDataRegistryEntry {
  const requested = (rawSelection ?? "mary-i").trim().toLowerCase();
  const resolvedId = DEMO_ALIASES.get(requested) ?? requested;
  const selected = demoMasterDataRegistryById.get(resolvedId);

  assert(
    selected,
    `Unknown demo "${rawSelection ?? "mary-i"}". Try one of: mary-i, coasts, ${[
      ...demoMasterDataRegistryById.keys()
    ].join(", ")}`
  );

  return selected;
}

function inferContentType(filePath: string): string {
  return extname(filePath).toLowerCase() === ".md" ? "text/markdown" : "text/plain";
}

function assertNoRelayIds(payload: unknown): void {
  const serialized = JSON.stringify(payload);
  assert(!serialized.includes("relay_conversation_"), "Learner-facing payload exposed relay conversation ids.");
  assert(!serialized.includes("relay_message_"), "Learner-facing payload exposed relay message ids.");
  assert(!serialized.includes("relay_response_message_"), "Learner-facing payload exposed relay response ids.");
  assert(!serialized.includes("relay_task_"), "Learner-facing payload exposed relay task ids.");
  assert(!serialized.includes("relay_workplan_"), "Learner-facing payload exposed relay work plan ids.");
  assert(!serialized.includes("relay_artifact_"), "Learner-facing payload exposed relay artifact ids.");
  assert(!serialized.includes("workspace_study_advisor"), "Learner-facing payload exposed Relay workspace ids.");
}

function assertCommandMessageShape(
  message: NonNullable<FakeRelayHttpServer["messages"][number]>,
  expectedCommandName: string
): void {
  assert.equal(message.content.type, "command");
  assert.equal(message.content.name, expectedCommandName);
  assert.equal(typeof message.to, "string");
  assert.equal(message.to, "@tutor");
  assert.equal(typeof message.content.input, "object");
  assert.equal(message.content.text, undefined);
  assert(
    !String(message.content.previewText ?? "").includes("Structured context:"),
    "Command preview leaked the legacy structured-text wrapper."
  );
  assert(
    !String(message.content.previewText ?? "").includes("\"rawSourceContent\""),
    "Command preview leaked a giant JSON payload."
  );
  assert(
    !String(message.content.previewText ?? "").includes("@supervisor") &&
      !String(message.content.previewText ?? "").includes("@agent"),
    "Command preview leaked explicit @mentions."
  );
}

async function main(): Promise<void> {
  const demo = resolveDemoSelection(process.argv[2] ?? process.env.LOOP_STUDY_SMOKE_DEMO);
  const rawSourceContent = readFileSync(demo.filePath, "utf8");
  const contentType = inferContentType(demo.filePath);
  const parsed = parseMasterDataInput({
    sourceName: demo.label,
    lines: rawSourceContent,
    fallbackTopic: demo.topic,
    fallbackSubject: demo.subject,
    fallbackYearGroup: demo.yearGroup
  });

  const fakeRelay = new FakeRelayHttpServer({
    resolver: ({ operation, packet }) => ({
      result: buildLoopStudyRelayResult(operation, packet),
      responseContent: {
        result: buildLoopStudyRelayResult(operation, packet)
      },
      responseText: "__relay_response_text_should_not_be_used__"
    })
  });
  const runtime = createTutorRelayRuntime(fakeRelay.fetch);
  const repository = new SqliteLearningLoopRepository(":memory:");
  const uploadController = new MasterDataUploadController(repository, runtime);
  const initialAssessmentController = new InitialAssessmentController(
    repository,
    undefined,
    undefined,
    runtime
  );
  const learningLoopController = new LearningLoopController(repository);
  const server = await createServer({
    agentRuntime: runtime,
    masterDataUploadController: uploadController,
    initialAssessmentController,
    learningLoopController
  });

  try {
    const uploadResponse = await server.inject({
      method: "POST",
      url: "/v1/master-data",
      payload: {
        sourceName: demo.label,
        rawSourceContent,
        contentType,
        learnerYearGroup: demo.yearGroup,
        userHints: {
          subject: demo.subject,
          topic: demo.topic
        },
        items: parsed.items
      }
    });
    assert.equal(
      uploadResponse.statusCode,
      201,
      `Material upload failed: ${uploadResponse.body}`
    );

    const uploaded = uploadResponse.json();
    assertNoRelayIds(uploaded);

    const interpretationMessage = fakeRelay.messages[0];
    assert(interpretationMessage, "Relay did not receive an interpretMasterData message.");
    assertCommandMessageShape(
      interpretationMessage,
      "loop_study.interpret_master_data"
    );
    assert.match(
      String(interpretationMessage.metadata?.product ?? ""),
      /^loop\.study$/
    );
    assert.match(
      String(interpretationMessage.metadata?.operation ?? ""),
      /^interpretMasterData$/
    );
    assert.match(
      String(interpretationMessage.metadata?.idempotencyKey ?? ""),
      /^loop-study:upload:/
    );

    const interpretationPayload = parseLoopStudyCommandContent(
      interpretationMessage.content
    ).packet.payload as {
      contentType?: string;
      learnerYearGroup?: string;
      rawSourceContent?: string;
      sourceId?: string;
      sourceName?: string;
      userHints?: { subject?: string; topic?: string };
    };
    assert.equal(interpretationPayload.sourceName, demo.label);
    assert.equal(interpretationPayload.contentType, contentType);
    assert.equal(interpretationPayload.learnerYearGroup, demo.yearGroup);
    assert.equal(interpretationPayload.userHints?.subject, demo.subject);
    assert.equal(interpretationPayload.userHints?.topic, demo.topic);
    assert.equal(interpretationPayload.rawSourceContent, rawSourceContent);
    assert(
      !JSON.stringify(interpretationPayload).includes("canonicalAnswer") &&
        !JSON.stringify(interpretationPayload).includes("prompt"),
      "interpretMasterData payload unexpectedly fell back to weak prompt/canonicalAnswer context."
    );

    const assessmentResponse = await server.inject({
      method: "POST",
      url: "/v1/assessments/initial",
      payload: {
        learnerName: "Adam Skoudros",
        yearGroup: demo.yearGroup,
        topic: demo.topic,
        questionCount: 3
      }
    });
    assert.equal(
      assessmentResponse.statusCode,
      201,
      `Initial assessment generation failed: ${assessmentResponse.body}`
    );

    const assessmentBody = assessmentResponse.json();
    assertNoRelayIds(assessmentBody);

    const assessmentMessage = fakeRelay.messages[1];
    assert(assessmentMessage, "Relay did not receive an initial assessment command.");
    assertCommandMessageShape(
      assessmentMessage,
      "loop_study.generate_initial_assessment"
    );
    assert.equal(assessmentMessage.to, "@tutor");
    assert.match(
      String(assessmentMessage.metadata?.operation ?? ""),
      /^generateInitialAssessment$/
    );
    assert.match(
      String(assessmentMessage.metadata?.idempotencyKey ?? ""),
      new RegExp(`^loop-study:${assessmentBody.learningLoop.id}:generateInitialAssessment:`)
    );

    const assessmentPacket = parseLoopStudyCommandContent(
      assessmentMessage.content
    ).packet.payload as {
      materialInterpretation?: {
        mainTopic?: string;
        subject?: string;
        yearGroup?: string;
      };
      relevantSourceExcerpts?: Array<{
        content?: string;
        sourceRef?: string;
      }>;
      source?: {
        rawSourceContent?: string;
      };
      topic?: string;
    };
    assert.equal(assessmentPacket.topic, demo.topic);
    assert.equal(assessmentPacket.materialInterpretation?.mainTopic, demo.topic);
    assert.equal(assessmentPacket.materialInterpretation?.subject, demo.subject);
    assert.equal(assessmentPacket.materialInterpretation?.yearGroup, demo.yearGroup);
    assert.equal(assessmentPacket.source?.rawSourceContent, rawSourceContent);
    assert(
      Array.isArray(assessmentPacket.relevantSourceExcerpts) &&
        assessmentPacket.relevantSourceExcerpts.length > 0,
      "Initial assessment command omitted relevant source excerpts."
    );
    assert(
      assessmentPacket.relevantSourceExcerpts.every(
        (item) =>
          typeof item.content === "string" &&
          item.content.length > 0 &&
          typeof item.sourceRef === "string" &&
          item.sourceRef.length > 0
      ),
      "Initial assessment excerpts were not source-grounded."
    );

    const record = repository.findRecordByLearningLoopId(
      assessmentBody.learningLoop.id as never
    );
    assert(record, "Learning loop record was not persisted.");
    assert(
      (record.record.runtimeConversationBindings?.length ?? 0) >= 1,
      "Runtime conversation binding was not persisted."
    );
    assert(
      (record.record.runtimeTraces?.length ?? 0) >= 1,
      "Runtime trace was not persisted."
    );
    const latestTrace = record.record.runtimeTraces.at(-1)?.toSnapshot();
    assert(latestTrace?.relayTask?.relayConversationId, "Runtime trace missing relay conversation correlation.");
    assert(latestTrace?.relayTask?.relayMessageId, "Runtime trace missing relay message correlation.");
    assert(latestTrace?.relayTask?.relayTaskId, "Runtime trace missing relay task correlation.");
    assert(
      (latestTrace?.relayTask?.relayArtifactIds.length ?? 0) > 0,
      "Runtime trace missing relay artifact correlation."
    );

    const inspection = fakeRelay.inspections.get(String(assessmentMessage.id));
    assert(inspection?.responseContent, "Fake Relay did not produce structured responseContent.");
    assert.equal(
      assessmentBody.assessment.items.length > 0,
      true,
      "Assessment generation did not succeed from structured responseContent."
    );

    const resumeResponse = await server.inject({
      method: "GET",
      url: `/v1/learning-loops/${assessmentBody.learningLoop.id}`
    });
    assert.equal(
      resumeResponse.statusCode,
      200,
      `Learning loop resume failed: ${resumeResponse.body}`
    );
    assertNoRelayIds(resumeResponse.json());

    console.log(
      JSON.stringify(
        {
          ok: true,
          demo: {
            id: demo.id,
            label: demo.label,
            topic: demo.topic
          },
          relayMessages: fakeRelay.messages.map((message) => ({
            id: message.id,
            operation: String(message.metadata?.operation ?? ""),
            to: message.to,
            contentType: message.content.type,
            contentName: message.content.name
          })),
          runtimeTrace: {
            operation: latestTrace?.execution.operation,
            relayConversationId: latestTrace?.relayTask?.relayConversationId,
            relayMessageId: latestTrace?.relayTask?.relayMessageId,
            relayTaskId: latestTrace?.relayTask?.relayTaskId,
            relayArtifactIds: latestTrace?.relayTask?.relayArtifactIds.length ?? 0
          }
        },
        null,
        2
      )
    );
  } finally {
    await server.close();
  }
}

await main().catch((error) => {
  console.error(
    error instanceof Error ? error.stack ?? error.message : String(error)
  );
  process.exitCode = 1;
});
