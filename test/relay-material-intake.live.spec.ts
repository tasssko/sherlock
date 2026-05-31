import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { describe, expect, it } from "vitest";
import { createServer } from "../src/app/api/createServer.js";
import { AssessmentAttemptController } from "../src/modules/assessment/AssessmentAttemptController.js";
import { InitialAssessmentController } from "../src/modules/assessment/InitialAssessmentController.js";
import { MasterDataUploadController } from "../src/modules/assessment/MasterDataUploadController.js";
import { LearningLoopController } from "../src/modules/learning/LearningLoopController.js";
import {
  decodeInterpretationSummaryFromItems
} from "../src/modules/masterData/MasterDataInterpretation.js";
import { demoMasterDataRegistryById } from "../src/modules/masterData/demoMasterDataRegistry.js";
import { parseMasterDataInput } from "../src/modules/masterData/structuredRevision.js";
import { SqliteLearningLoopRepository } from "../src/modules/planning/SqliteLearningLoopRepository.js";
import { loadLoopStudyRuntimeConfig } from "../src/modules/runtime/LoopStudyRuntimeConfig.js";
import { RelayAgentRuntime } from "../src/modules/runtime/RelayAgentRuntime.js";
import { RelayWorkspaceBinding } from "../src/modules/runtime/RelayWorkspaceBinding.js";
import { RelayWorkspaceProvisioner } from "../src/modules/runtime/RelayWorkspaceProvisioner.js";

const shouldRunLiveRelaySmoke =
  process.env.LOOP_STUDY_RUN_LIVE_RELAY_SMOKE === "1";

type RelayCapture = {
  method: string;
  requestBody?: Record<string, unknown>;
  responseBody?: Record<string, unknown>;
  url: string;
};

function findRelayMessageCapture(
  captures: readonly RelayCapture[],
  operation: string
): RelayCapture | undefined {
  return captures.find(
    (capture) =>
      capture.method === "POST" &&
      capture.url.endsWith("/v1/messages") &&
      capture.requestBody?.metadata &&
      typeof capture.requestBody.metadata === "object" &&
      (capture.requestBody.metadata as Record<string, unknown>).operation === operation
  );
}

function findRelayResponseContent(
  captures: readonly RelayCapture[],
  operation: string
): unknown {
  const direct = findRelayMessageCapture(captures, operation)?.responseBody?.responseContent;
  if (direct !== undefined) {
    return direct;
  }

  return captures.find((capture) => capture.url.includes("/inspection"))?.responseBody?.responseContent;
}

function inferContentType(filePath: string): string {
  return extname(filePath).toLowerCase() === ".md" ? "text/markdown" : "text/plain";
}

function assertNoRelayIds(payload: unknown): void {
  const serialized = JSON.stringify(payload);

  expect(serialized).not.toContain("relay_conversation_");
  expect(serialized).not.toContain("relay_message_");
  expect(serialized).not.toContain("relay_response_message_");
  expect(serialized).not.toContain("relay_task_");
  expect(serialized).not.toContain("relay_workplan_");
  expect(serialized).not.toContain("relay_artifact_");
  expect(serialized).not.toContain("workspace_study_advisor");
}

function parseJsonRecord(value: string | undefined): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function createRelayCaptureFetch(
  captures: RelayCapture[]
): typeof fetch {
  return (async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const method = init?.method ?? "GET";
    const requestBody =
      method === "POST" ? parseJsonRecord(String(init?.body ?? "")) : undefined;
    const response = await fetch(input, init);
    const responseBody = parseJsonRecord(await response.clone().text());

    captures.push({
      method,
      url,
      requestBody,
      responseBody
    });

    return response;
  }) as typeof fetch;
}

function createFailedInterpretationFetch(
  baseFetch: typeof fetch,
  captures: RelayCapture[]
): typeof fetch {
  const failedInspectionMessageId = "relay_message_failed_material_intake";

  return (async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const method = init?.method ?? "GET";
    const requestBody =
      method === "POST" ? parseJsonRecord(String(init?.body ?? "")) : undefined;

    if (
      method === "POST" &&
      url.endsWith("/v1/messages") &&
      requestBody?.metadata &&
      typeof requestBody.metadata === "object" &&
      (requestBody.metadata as Record<string, unknown>).operation === "interpretMasterData"
    ) {
      const responseBody = {
        conversationId: "relay_conversation_failed_material_intake",
        messageId: failedInspectionMessageId,
        responseMessageId: "relay_response_failed_material_intake",
        taskId: "relay_task_failed_material_intake",
        responseContent: {
          type: "text",
          status: "failed",
          schema: "MasterDataInterpretationCandidate.v1",
          value: "Relay material intake failed."
        }
      };
      captures.push({
        method,
        url,
        requestBody,
        responseBody
      });

      return new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    if (method === "GET" && url.endsWith(`/v1/messages/${failedInspectionMessageId}/inspection`)) {
      const responseBody = {
        artifacts: [],
        responseContent: {
          type: "text",
          status: "failed",
          schema: "MasterDataInterpretationCandidate.v1",
          value: "Relay material intake failed."
        },
        responseText: "Relay material intake failed.",
        resultEvents: [],
        task: {
          id: "relay_task_failed_material_intake"
        }
      };
      captures.push({
        method,
        url,
        responseBody
      });

      return new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    const response = await baseFetch(input, init);
    const responseBody = parseJsonRecord(await response.clone().text());
    captures.push({
      method,
      url,
      requestBody,
      responseBody
    });

    return response;
  }) as typeof fetch;
}

describe.runIf(shouldRunLiveRelaySmoke)(
  "live Relay material intake and check-up smoke",
  () => {
    it(
      "accepts a real Relay-backed material interpretation, persists it, and uses it for initial check-up generation",
      async () => {
        const runtimeConfig = loadLoopStudyRuntimeConfig(process.env);
        expect(runtimeConfig.runtimeMode).toBe("relay");
        expect(runtimeConfig.relay).toBeDefined();
        if (runtimeConfig.runtimeMode !== "relay" || !runtimeConfig.relay) {
          return;
        }

        const demo =
          demoMasterDataRegistryById.get("geography-coasts-md") ??
          demoMasterDataRegistryById.get("history-mary-i-md");
        expect(demo).toBeDefined();
        if (!demo) {
          return;
        }

        const rawSourceContent = readFileSync(demo.filePath, "utf8");
        const contentType = inferContentType(demo.filePath);
        const parsed = parseMasterDataInput({
          sourceName: demo.label,
          lines: rawSourceContent,
          fallbackTopic: demo.topic,
          fallbackSubject: demo.subject,
          fallbackYearGroup: demo.yearGroup
        });

        const relayCaptures: RelayCapture[] = [];
        const diagnostics: Array<{
          bindings: Record<string, unknown>;
          level: "info" | "warn";
          message: string;
        }> = [];
        const relayFetch = createRelayCaptureFetch(relayCaptures);
        const binding = await new RelayWorkspaceProvisioner({
          binding: RelayWorkspaceBinding.create({
            baseUrl: runtimeConfig.relay.baseUrl,
            profile: runtimeConfig.relay.profile
          }),
          fetcher: relayFetch
        }).ensureProvisionedBinding();

        const runtime = new RelayAgentRuntime({
          binding,
          fetcher: relayFetch,
          diagnosticsLogger: {
            info(bindings, message) {
              diagnostics.push({ level: "info", bindings, message });
            },
            warn(bindings, message) {
              diagnostics.push({ level: "warn", bindings, message });
            }
          }
        });
        const repository = new SqliteLearningLoopRepository(":memory:");
        const uploadController = new MasterDataUploadController(repository, runtime);
        const initialAssessmentController = new InitialAssessmentController(
          repository,
          undefined,
          undefined,
          runtime
        );
        const assessmentAttemptController = new AssessmentAttemptController(
          repository,
          runtime
        );
        const learningLoopController = new LearningLoopController(repository);
        const server = await createServer({
          agentRuntime: runtime,
          assessmentAttemptController,
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

          expect(uploadResponse.statusCode).toBe(201);
          const uploaded = uploadResponse.json();
          assertNoRelayIds(uploaded);

          const source = repository.findMasterDataSourcesByIds([uploaded.source.id])[0];
          expect(source?.acceptedInterpretation).toBeDefined();
          expect(source?.acceptedInterpretation).toMatchObject({
            detectedSubject: demo.subject,
            detectedYearGroup: demo.yearGroup,
            mainTopic: demo.topic
          });
          expect(source?.acceptedInterpretation?.subtopics.length).toBeGreaterThan(0);
          expect(source?.acceptedInterpretation?.learnerFacingMaterialSummary.length).toBeGreaterThan(40);
          expect(source?.acceptedInterpretation?.learningObjectives.length).toBeGreaterThan(0);
          expect(source?.acceptedInterpretation?.sourceMap.length).toBeGreaterThan(0);
          expect(
            source?.acceptedInterpretation?.learningObjectives.every(
              (objective) => objective.sourceRefs.length > 0
            )
          ).toBe(true);

          const learnerFacingSummary = decodeInterpretationSummaryFromItems(uploaded.items);
          expect(learnerFacingSummary).toMatchObject({
            subject: demo.subject,
            yearGroup: demo.yearGroup,
            mainTopic: demo.topic
          });
          expect(learnerFacingSummary?.subtopics.length).toBeGreaterThan(0);
          expect(learnerFacingSummary?.learnerFacingMaterialSummary).toBeTruthy();
          assertNoRelayIds(learnerFacingSummary);

          const interpretMessageCapture = findRelayMessageCapture(
            relayCaptures,
            "interpretMasterData"
          );
          expect(interpretMessageCapture?.requestBody?.content).toMatchObject({
            type: "command",
            name: "runtime.generate_structured_candidate",
            expectedOutputSchema: "MasterDataInterpretationCandidate.v1"
          });
          expect(
            (
              interpretMessageCapture?.requestBody?.content as
                | { input?: Record<string, unknown> }
                | undefined
            )?.input?.candidateKind
          ).toBe("master_data_interpretation");

          const interpretRelayResponseContent = findRelayResponseContent(
            relayCaptures,
            "interpretMasterData"
          );
          expect(interpretRelayResponseContent).toBeDefined();

          const responseContentType =
            interpretRelayResponseContent &&
            typeof interpretRelayResponseContent === "object" &&
            "type" in interpretRelayResponseContent
              ? (interpretRelayResponseContent as { type?: unknown }).type
              : undefined;
          if (responseContentType !== undefined) {
            expect(typeof responseContentType).toBe("string");
          }

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

          expect(assessmentResponse.statusCode).toBe(201);
          const assessmentBody = assessmentResponse.json();
          assertNoRelayIds(assessmentBody);
          expect(assessmentBody.assessment?.items).toHaveLength(3);
          expect(assessmentBody.artifact?.content?.items).toHaveLength(3);

          const assessmentMessageCapture = findRelayMessageCapture(
            relayCaptures,
            "generateInitialAssessment"
          );
          expect(assessmentMessageCapture?.requestBody?.content).toMatchObject({
            type: "command",
            name: "runtime.generate_structured_candidate",
            expectedOutputSchema: "InitialAssessmentGenerationCandidate"
          });

          const assessmentCommandInput = (
            assessmentMessageCapture?.requestBody?.content as
              | {
                  input?: Record<string, unknown>;
                }
              | undefined
          )?.input;
          expect(assessmentCommandInput).toBeDefined();
          expect(assessmentCommandInput?.candidateKind).toBe("initial_assessment");
          expect(assessmentCommandInput?.materialInterpretation).toMatchObject({
            mainTopic: source?.acceptedInterpretation?.mainTopic,
            detectedSubject: source?.acceptedInterpretation?.detectedSubject,
            detectedYearGroup: source?.acceptedInterpretation?.detectedYearGroup,
            learnerFacingMaterialSummary:
              source?.acceptedInterpretation?.learnerFacingMaterialSummary
          });
          expect(
            Array.isArray(assessmentCommandInput?.materialInterpretation?.learningObjectives) &&
              assessmentCommandInput?.materialInterpretation?.learningObjectives.length > 0
          ).toBe(true);
          expect(
            Array.isArray(assessmentCommandInput?.relevantSourceExcerpts) &&
              assessmentCommandInput?.relevantSourceExcerpts.length > 0
          ).toBe(true);
          expect(
            JSON.stringify(assessmentCommandInput ?? {})
          ).not.toContain("canonicalAnswer");
          expect(
            JSON.stringify(assessmentCommandInput ?? {})
          ).not.toContain("\"sourceItems\"");

          const acceptedObjectiveTexts = new Set(
            source?.acceptedInterpretation?.learningObjectives.map((objective) => objective.objective) ??
              []
          );
          const acceptedSourceRefs = new Set(
            source?.acceptedInterpretation?.sourceMap.map((entry) => entry.sourceRef) ?? []
          );
          const relevantSourceExcerpts = Array.isArray(
            assessmentCommandInput?.relevantSourceExcerpts
          )
            ? assessmentCommandInput.relevantSourceExcerpts
            : [];
          expect(
            relevantSourceExcerpts.every(
              (excerpt) =>
                typeof excerpt === "object" &&
                excerpt !== null &&
                typeof (excerpt as { sourceRef?: unknown }).sourceRef === "string" &&
                acceptedSourceRefs.has((excerpt as { sourceRef: string }).sourceRef)
            )
          ).toBe(true);
          expect(
            Array.isArray(assessmentCommandInput?.materialInterpretation?.learningObjectives) &&
              assessmentCommandInput.materialInterpretation.learningObjectives.every(
                (objective) =>
                  typeof objective === "object" &&
                  objective !== null &&
                  acceptedObjectiveTexts.has(
                    String((objective as { objective?: unknown }).objective)
                  )
              )
          ).toBe(true);
          expect(
            Array.isArray(assessmentCommandInput?.materialInterpretation?.sourceMap) &&
              assessmentCommandInput.materialInterpretation.sourceMap.length > 0
          ).toBe(true);
          expect(
            Array.isArray(assessmentCommandInput?.materialInterpretation?.items) &&
              assessmentCommandInput.materialInterpretation.items.length > 0
          ).toBe(true);
          expect(
            Array.isArray(assessmentCommandInput?.materialInterpretation?.keyTerms) &&
              assessmentCommandInput.materialInterpretation.keyTerms.length > 0
          ).toBe(true);

          const assessmentRelayResponseContent = findRelayResponseContent(
            relayCaptures,
            "generateInitialAssessment"
          );
          expect(assessmentRelayResponseContent).toBeDefined();
          const assessmentResponseType =
            assessmentRelayResponseContent &&
            typeof assessmentRelayResponseContent === "object" &&
            "type" in assessmentRelayResponseContent
              ? (assessmentRelayResponseContent as { type?: unknown }).type
              : undefined;
          if (assessmentResponseType !== undefined) {
            expect(typeof assessmentResponseType).toBe("string");
          }

          const topicMasterData = repository.findMasterDataByTopic(demo.topic);
          const uploadedSourceRecord = topicMasterData.find(
            (entry) => entry.source.id === uploaded.source.id
          );
          expect(uploadedSourceRecord).toBeDefined();
          const itemSourceRefsById = new Map(
            (uploadedSourceRecord?.items ?? []).map((item) => [item.id, item.sourceRef])
          );
          const objectiveSourceRefs = new Set(
            source?.acceptedInterpretation?.learningObjectives.flatMap(
              (objective) => objective.sourceRefs
            ) ?? []
          );

          expect(
            assessmentBody.assessment.items.every(
              (item: {
                prompt?: string;
                canonicalAnswer?: string;
                visibleMaterial?: string;
                sourceMasterDataItemId?: string;
              }) =>
                typeof item.prompt === "string" &&
                item.prompt.length > 0 &&
                typeof item.canonicalAnswer === "string" &&
                item.canonicalAnswer.length > 0 &&
                typeof item.visibleMaterial === "string" &&
                item.visibleMaterial.includes("Source ref:") &&
                typeof item.sourceMasterDataItemId === "string" &&
                objectiveSourceRefs.has(
                  itemSourceRefsById.get(item.sourceMasterDataItemId) ?? ""
                )
            )
          ).toBe(true);

          expect(
            diagnostics.some(
              (entry) =>
                entry.level === "info" &&
                entry.bindings.responseContentTopLevelKeys &&
                Array.isArray(entry.bindings.responseContentTopLevelKeys)
            )
          ).toBe(true);
          expect(JSON.stringify(diagnostics)).not.toContain(rawSourceContent.slice(0, 80));

          const assessmentItems = assessmentBody.assessment.items as Array<{
            canonicalAnswer: string;
            id: string;
            prompt: string;
          }>;
          expect(assessmentItems).toHaveLength(3);
          const partiallyCorrectAnswer =
            assessmentItems[1]?.canonicalAnswer.split(/[.!?]/)[0]?.trim() ||
            assessmentItems[1]?.canonicalAnswer.slice(0, 48) ||
            "Partial answer";

          const attemptResponse = await server.inject({
            method: "POST",
            url: "/v1/assessments/attempts",
            payload: {
              assessmentId: assessmentBody.assessment.id,
              responses: [
                {
                  itemId: assessmentItems[0]?.id,
                  answer: assessmentItems[0]?.canonicalAnswer
                },
                {
                  itemId: assessmentItems[1]?.id,
                  answer: partiallyCorrectAnswer
                },
                {
                  itemId: assessmentItems[2]?.id,
                  answer: "I am not sure yet."
                }
              ]
            }
          });

          expect(attemptResponse.statusCode).toBe(201);
          const attemptBody = attemptResponse.json();
          assertNoRelayIds(attemptBody);
          expect(attemptBody.evaluation).toBeDefined();
          expect(attemptBody.knowledgeGaps.length).toBeGreaterThan(0);
          expect(
            attemptBody.knowledgeGaps.some(
              (gap: { description?: string; evidence?: string; topic?: string }) =>
                Boolean(gap.description && gap.description.length > 0) &&
                Boolean(gap.evidence && gap.evidence.length > 0) &&
                gap.topic === demo.topic
            )
          ).toBe(true);
          expect(attemptBody.phase).toBe("loop-batching");
          expect(attemptBody.nextAction.kind).toBe("start-loop-unit");
          expect(attemptBody.masteryProfile).toBeUndefined();
          expect(attemptBody.loopBatch).toEqual(
            expect.objectContaining({
              units: expect.any(Array)
            })
          );

          const evaluationMessageCapture = findRelayMessageCapture(
            relayCaptures,
            "evaluateAssessmentAttempt"
          );
          expect(evaluationMessageCapture?.requestBody?.content).toMatchObject({
            type: "command",
            name: "runtime.evaluate_structured_response",
            expectedOutputSchema: "AssessmentAttemptEvaluationCandidate"
          });

          const evaluationCommandInput = (
            evaluationMessageCapture?.requestBody?.content as
              | {
                  input?: Record<string, unknown>;
                }
              | undefined
          )?.input;
          expect(evaluationCommandInput?.candidateKind).toBe(
            "assessment_attempt_evaluation"
          );
          expect(evaluationCommandInput?.assessment).toMatchObject({
            topic: demo.topic
          });
          expect(
            Array.isArray(evaluationCommandInput?.assessment?.items) &&
              evaluationCommandInput.assessment.items.length === 3
          ).toBe(true);
          expect(
            Array.isArray(evaluationCommandInput?.responses) &&
              evaluationCommandInput.responses.length === 3
          ).toBe(true);
          expect(evaluationCommandInput?.materialInterpretation).toMatchObject({
            mainTopic: source?.acceptedInterpretation?.mainTopic,
            detectedSubject: source?.acceptedInterpretation?.detectedSubject,
            detectedYearGroup: source?.acceptedInterpretation?.detectedYearGroup
          });
          expect(
            Array.isArray(evaluationCommandInput?.materialInterpretation?.learningObjectives) &&
              evaluationCommandInput.materialInterpretation.learningObjectives.length > 0
          ).toBe(true);
          expect(
            Array.isArray(evaluationCommandInput?.sourceEvidence) &&
              evaluationCommandInput.sourceEvidence.length > 0
          ).toBe(true);
          expect(
            Array.isArray(evaluationCommandInput?.markingRules) &&
              evaluationCommandInput.markingRules.length > 0
          ).toBe(true);
          expect(
            Array.isArray(evaluationCommandInput?.sourceEvidence) &&
              evaluationCommandInput.sourceEvidence.every(
                (item) =>
                  typeof item === "object" &&
                  item !== null &&
                  typeof (item as { sourceRef?: unknown }).sourceRef === "string" &&
                  acceptedSourceRefs.has((item as { sourceRef: string }).sourceRef)
              )
          ).toBe(true);
          expect(
            JSON.stringify(evaluationCommandInput ?? {})
          ).not.toContain("canonicalAnswer");

          const evaluationRelayResponseContent = findRelayResponseContent(
            relayCaptures,
            "evaluateAssessmentAttempt"
          );
          expect(evaluationRelayResponseContent).toBeDefined();
        } finally {
          await server.close();
        }
      },
      120000
    );

    it(
      "returns learner-safe errors when interpretMasterData receives a failed Relay text response",
      async () => {
        const runtimeConfig = loadLoopStudyRuntimeConfig(process.env);
        expect(runtimeConfig.runtimeMode).toBe("relay");
        expect(runtimeConfig.relay).toBeDefined();
        if (runtimeConfig.runtimeMode !== "relay" || !runtimeConfig.relay) {
          return;
        }

        const demo =
          demoMasterDataRegistryById.get("geography-coasts-md") ??
          demoMasterDataRegistryById.get("history-mary-i-md");
        expect(demo).toBeDefined();
        if (!demo) {
          return;
        }

        const rawSourceContent = readFileSync(demo.filePath, "utf8");
        const contentType = inferContentType(demo.filePath);
        const parsed = parseMasterDataInput({
          sourceName: demo.label,
          lines: rawSourceContent,
          fallbackTopic: demo.topic,
          fallbackSubject: demo.subject,
          fallbackYearGroup: demo.yearGroup
        });

        const baseBinding = await new RelayWorkspaceProvisioner({
          binding: RelayWorkspaceBinding.create({
            baseUrl: runtimeConfig.relay.baseUrl,
            profile: runtimeConfig.relay.profile
          }),
          fetcher
        }).ensureProvisionedBinding();
        const relayCaptures: RelayCapture[] = [];
        const failingRuntime = new RelayAgentRuntime({
          binding: baseBinding,
          fetcher: createFailedInterpretationFetch(fetch, relayCaptures)
        });
        const repository = new SqliteLearningLoopRepository(":memory:");
        const uploadController = new MasterDataUploadController(repository, failingRuntime);
        const server = await createServer({
          agentRuntime: failingRuntime,
          masterDataUploadController: uploadController
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

          expect(uploadResponse.statusCode).toBe(409);
          expect(uploadResponse.json()).toMatchObject({
            error:
              "The material interpretation service could not prepare this study pack right now. Relay runtime returned a failed text response.",
            code: "STATE_CONFLICT"
          });
          assertNoRelayIds(uploadResponse.json());
          expect(
            relayCaptures.some(
              (capture) =>
                capture.method === "POST" &&
                capture.requestBody?.metadata &&
                typeof capture.requestBody.metadata === "object" &&
                (capture.requestBody.metadata as Record<string, unknown>).operation ===
                  "interpretMasterData"
            )
          ).toBe(true);
        } finally {
          await server.close();
        }
      },
      120000
    );
  }
);
