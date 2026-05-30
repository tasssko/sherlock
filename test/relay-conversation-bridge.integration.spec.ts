import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createServer } from "../src/app/api/createServer.js";
import { AssessmentAttemptController } from "../src/modules/assessment/AssessmentAttemptController.js";
import { InitialAssessmentController } from "../src/modules/assessment/InitialAssessmentController.js";
import { MasterDataUploadController } from "../src/modules/assessment/MasterDataUploadController.js";
import { LearningLoopController } from "../src/modules/learning/LearningLoopController.js";
import { StudyPlanController } from "../src/modules/planning/StudyPlanController.js";
import { SqliteLearningLoopRepository } from "../src/modules/planning/SqliteLearningLoopRepository.js";
import { PracticeActivityController } from "../src/modules/practice/PracticeActivityController.js";
import {
  createLoopStudyRelayRuntimeProfile,
  defaultLoopStudyRelayRuntimeProfile
} from "../src/modules/runtime/LoopStudyRelayRuntimeProfile.js";
import { RelayAgentRuntime } from "../src/modules/runtime/RelayAgentRuntime.js";
import { RelayWorkspaceBinding } from "../src/modules/runtime/RelayWorkspaceBinding.js";
import { parseMasterDataInput } from "../src/modules/masterData/structuredRevision.js";
import {
  FakeRelayHttpServer,
  parseLoopStudyCommandContent
} from "./support/fakeRelayHttpServer.js";

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

describe("loop.study to Relay structured conversation bridge", () => {
  it("sends structured messages, reuses one internal conversation, and keeps Relay ids internal", async () => {
    const fakeRelay = new FakeRelayHttpServer();
    const runtime = createTutorRelayRuntime(fakeRelay.fetch);
    const repository = new SqliteLearningLoopRepository(":memory:");
    const uploadController = new MasterDataUploadController(repository, runtime);
    const initialAssessmentController = new InitialAssessmentController(
      repository,
      undefined,
      undefined,
      runtime
    );
    const attemptController = new AssessmentAttemptController(repository, runtime);
    const studyPlanController = new StudyPlanController(
      repository,
      undefined,
      undefined,
      runtime
    );
    const practiceActivityController = new PracticeActivityController(
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
      assessmentAttemptController: attemptController,
      studyPlanController,
      practiceActivityController,
      learningLoopController
    });

    try {
      const coastsText = readFileSync(
        "docs/demo-master-data/@Y7 GEOGRAPHY COASTS – MASTER REVISION DOCUMENT.md",
        "utf8"
      );
      const parsed = parseMasterDataInput({
        sourceName: "Year 7 Geography: Coasts",
        lines: coastsText,
        fallbackTopic: "Coasts",
        fallbackSubject: "Geography",
        fallbackYearGroup: "Year 7"
      });

      const uploadResponse = await server.inject({
        method: "POST",
        url: "/v1/master-data",
        payload: {
          sourceName: "Year 7 Geography: Coasts",
          rawSourceContent: coastsText,
          contentType: "text/markdown",
          learnerYearGroup: "Year 7",
          userHints: {
            subject: "Geography",
            topic: "Coasts"
          },
          items: parsed.items
        }
      });
      expect(uploadResponse.statusCode).toBe(201);
      const uploaded = uploadResponse.json();
      const interpretationMessage = fakeRelay.messages[0];
      expect(interpretationMessage?.to).toBe("@tutor");
      expect(interpretationMessage?.content.type).toBe("command");
      expect(interpretationMessage?.content.name).toBe("loop_study.interpret_master_data");
      expect(interpretationMessage?.content.inputSchema).toBe(
        "LoopStudyInterpretMasterDataInput.v1"
      );
      expect(interpretationMessage?.content.expectedOutputSchema).toBe(
        "MasterDataInterpretationCandidate.v1"
      );
      expect(String(interpretationMessage?.content.previewText ?? "")).not.toContain("@supervisor");
      expect(String(interpretationMessage?.content.previewText ?? "")).not.toContain("@agent");
      expect(String(interpretationMessage?.content.previewText ?? "")).not.toContain(
        "\"rawSourceContent\""
      );
      expect(interpretationMessage?.metadata).toMatchObject({
        product: "loop.study",
        operation: "interpretMasterData",
        expectedOutputSchema: "MasterDataInterpretationCandidate.v1"
      });
      const interpretationPayload = parseLoopStudyCommandContent(
        interpretationMessage?.content ?? { type: "text", text: "" }
      ).packet.payload as {
        outputContract?: Record<string, unknown>;
        rawSourceContent?: string;
        sourceId?: string;
        sourceName?: string;
      };
      expect(interpretationPayload.sourceName).toBe("Year 7 Geography: Coasts");
      expect(interpretationPayload.sourceId).toContain("upload:");
      expect(interpretationPayload.rawSourceContent).toContain("COASTS");
      expect(interpretationPayload.outputContract).toMatchObject({
        schema: "MasterDataInterpretationCandidate.v1",
        fields: {
          schema: '"MasterDataInterpretationCandidate.v1"',
          detectedSubject: "string",
          detectedYearGroup: "string",
          mainTopic: "string",
          subtopics: ["string"],
          keyPeople: ["string"],
          keyTerms: ["string"],
          importantDates: ["string"],
          processes: ["string"],
          learnerFacingMaterialSummary: "string",
          learningObjectives: [
            {
              id: "string",
              objective: "string",
              sourceRefs: ["string"]
            }
          ],
          sourceMap: [
            {
              sourceRef: "string",
              excerpt: "string"
            }
          ]
        }
      });
      expect(interpretationPayload.outputContract?.rules).toEqual(
        expect.arrayContaining([
          "Return schema exactly as MasterDataInterpretationCandidate.v1.",
          "learningObjectives must be objects with id, objective, and sourceRefs; do not return strings.",
          "Use empty arrays, not null or omitted fields, when keyPeople, importantDates, or processes are absent."
        ])
      );
      expect(
        (interpretationPayload.outputContract?.example as Record<string, unknown>)?.learningObjectives
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            objective: expect.any(String),
            sourceRefs: expect.arrayContaining([expect.any(String)])
          })
        ])
      );
      expect(JSON.stringify(interpretationPayload)).not.toContain("canonicalAnswer");
      expect(JSON.stringify(interpretationPayload)).not.toContain("prompt");
      expect(uploaded).toMatchObject({
        source: {
          id: expect.any(String),
          name: "Year 7 Geography: Coasts"
        },
        items: expect.any(Array)
      });

      const assessmentResponse = await server.inject({
        method: "POST",
        url: "/v1/assessments/initial",
        payload: {
          learnerName: "Adam Skoudros",
          yearGroup: "Year 7",
          topic: "Coasts",
          questionCount: 3
        }
      });
      expect(assessmentResponse.statusCode).toBe(201);
      const assessmentBody = assessmentResponse.json();

      const assessmentMessage = fakeRelay.messages[1];
      expect(assessmentMessage?.to).toBe("@tutor");
      expect(assessmentMessage?.content.type).toBe("command");
      expect(assessmentMessage?.content.name).toBe(
        "loop_study.generate_initial_assessment"
      );
      expect(String(assessmentMessage?.content.previewText ?? "")).not.toContain("@supervisor");
      expect(String(assessmentMessage?.content.previewText ?? "")).not.toContain("@agent");
      expect(assessmentMessage?.metadata).toMatchObject({
        product: "loop.study",
        learningLoopId: assessmentBody.learningLoop.id,
        stage: "diagnosis",
        operation: "generateInitialAssessment",
        expectedOutputSchema: "InitialAssessmentGenerationCandidate"
      });
      expect(String(assessmentMessage?.metadata?.idempotencyKey ?? "")).toContain(
        `loop-study:${assessmentBody.learningLoop.id}:generateInitialAssessment:`
      );

      const initialPacket = parseLoopStudyCommandContent(
        assessmentMessage?.content ?? { type: "text", text: "" }
      ).packet.payload as {
        materialInterpretation?: Record<string, unknown>;
        relevantSourceExcerpts: Array<Record<string, unknown>>;
        source?: Record<string, unknown>;
        topic?: string;
      };
      expect(initialPacket.materialInterpretation).toMatchObject({
        subject: "Geography",
        yearGroup: "Year 7",
        mainTopic: "Coasts"
      });
      expect(initialPacket.topic).toBe("Coasts");
      expect(initialPacket.source?.rawSourceContent).toContain("COASTS");
      expect(initialPacket.relevantSourceExcerpts.length).toBeGreaterThan(0);
      expect(
        initialPacket.relevantSourceExcerpts.every(
          (item) =>
            typeof item.content === "string" &&
            item.content.length > 0 &&
            typeof item.sourceRef === "string" &&
            item.sourceRef.length > 0
        )
      ).toBe(true);
      expect(
        initialPacket.relevantSourceExcerpts.some((item) =>
          String(item.excerpt ?? "").includes("What should you remember about The")
        )
      ).toBe(false);

      const attemptResponse = await server.inject({
        method: "POST",
        url: "/v1/assessments/attempts",
        payload: {
          assessmentId: assessmentBody.assessment.id,
          responses: assessmentBody.assessment.items.map((item: { id: string }) => ({
            itemId: item.id,
            answer: "incorrect response"
          }))
        }
      });
      expect(attemptResponse.statusCode).toBe(201);

      const studyPlanResponse = await server.inject({
        method: "POST",
        url: "/v1/study-plans",
        payload: {
          learnerName: "Adam Skoudros",
          yearGroup: "Year 7",
          objective: "Build more secure recall in Coasts through short study sessions and active review.",
          focusTopics: ["Coasts"],
          availableMinutesByDay: {
            Monday: 30,
            Tuesday: 30,
            Wednesday: 30,
            Thursday: 30,
            Friday: 30,
            Saturday: 60,
            Sunday: 0
          }
        }
      });
      expect(studyPlanResponse.statusCode).toBe(201);
      const studyPlanMessage = fakeRelay.messages[3];
      expect(studyPlanMessage?.content.type).toBe("command");
      expect(studyPlanMessage?.content.name).toBe("loop_study.generate_study_plan");
      const studyPlanPacket = parseLoopStudyCommandContent(
        studyPlanMessage?.content ?? { type: "text", text: "" }
      ).packet.payload as {
        materialInterpretations?: Array<Record<string, unknown>>;
      };
      expect(studyPlanMessage?.to).toBe("@tutor");
      expect(studyPlanPacket.materialInterpretations?.[0]).toMatchObject({
        mainTopic: "Coasts",
        subject: "Geography",
        yearGroup: "Year 7"
      });
      expect(
        Array.isArray(studyPlanPacket.materialInterpretations?.[0]?.learningObjectives) &&
          studyPlanPacket.materialInterpretations?.[0]?.learningObjectives.length
      ).toBeTruthy();

      const practiceResponse = await server.inject({
        method: "POST",
        url: `/v1/learning-loops/${assessmentBody.learningLoop.id}/practice-activities`,
        payload: {
          kind: "flashcard_set",
          cardCount: 3
        }
      });
      expect(practiceResponse.statusCode).toBe(201);

      expect(fakeRelay.messages).toHaveLength(5);
      const conversationIds = new Set(
        fakeRelay.messages.map((message) => message.conversationId)
      );
      expect(conversationIds.size).toBe(2);

      const practiceMessage = fakeRelay.messages.at(-1);
      expect(practiceMessage?.content.type).toBe("command");
      expect(practiceMessage?.content.name).toBe("loop_study.generate_practice_activity");
      const practicePacket = parseLoopStudyCommandContent(
        practiceMessage?.content ?? { type: "text", text: "" }
      ).packet.payload as {
        learningObjectives: readonly string[];
        materialInterpretation?: Record<string, unknown>;
        selectedSourceEvidence: Array<Record<string, unknown>>;
        selectedSourceItems: Array<Record<string, unknown>>;
        subject?: string;
        topic?: string;
        yearGroup?: string;
      };
      expect(practiceMessage?.to).toBe("@tutor");
      expect(practicePacket.subject).toBe("Geography");
      expect(practicePacket.yearGroup).toBe("Year 7");
      expect(practicePacket.topic).toBe("Coasts");
      expect(practicePacket.materialInterpretation).toMatchObject({
        mainTopic: "Coasts"
      });
      expect(practicePacket.learningObjectives.length).toBeGreaterThan(0);
      expect(
        practicePacket.learningObjectives.some((objective) =>
          String(objective).includes("Explain how coasts are shaped by erosion and transport.")
        )
      ).toBe(true);
      expect(
        practicePacket.learningObjectives.some((objective) =>
          String(objective).includes("Needs more support with Coasts.")
        )
      ).toBe(false);
      expect(practicePacket.selectedSourceEvidence.length).toBeGreaterThan(0);
      expect(practicePacket.selectedSourceItems.length).toBeGreaterThan(0);
      expect(
        practicePacket.selectedSourceItems.every(
          (item) =>
            typeof item.content === "string" &&
            item.content.length > 0 &&
            typeof item.sourceRef === "string" &&
            item.sourceRef.length > 0
        )
      ).toBe(true);
      expect(
        practicePacket.selectedSourceItems.some((item) =>
          String(item.prompt ?? "").includes("What should you remember about The")
        )
      ).toBe(false);

      const record = repository.findRecordByLearningLoopId(
        assessmentBody.learningLoop.id as never
      );
      expect(record?.record.runtimeConversationBindings).toHaveLength(1);
      expect(
        record?.record.runtimeConversationBindings[0]?.relayConversationId
      ).toBe(fakeRelay.messages[1]?.conversationId);
      expect(record?.record.runtimeTraces).toHaveLength(4);
      expect(
        record?.record.runtimeTraces.every((trace) => {
          const snapshot = trace.toSnapshot();
          return (
            snapshot.relayTask?.relayConversationId &&
            snapshot.relayTask?.relayMessageId &&
            snapshot.relayTask?.relayTaskId &&
            snapshot.relayTask?.relayArtifactIds.length
          );
        })
      ).toBe(true);

      const learnerFacingPayload = JSON.stringify({
        assessment: assessmentBody,
        attempt: attemptResponse.json(),
        studyPlan: studyPlanResponse.json(),
        practice: practiceResponse.json(),
        resume: (
          await server.inject({
            method: "GET",
            url: `/v1/learning-loops/${assessmentBody.learningLoop.id}`
          })
        ).json()
      });
      expect(learnerFacingPayload).not.toContain("relay_conversation_");
      expect(learnerFacingPayload).not.toContain("relay_message_");
      expect(learnerFacingPayload).not.toContain("relay_response_message_");
      expect(learnerFacingPayload).not.toContain("relay_task_");
      expect(learnerFacingPayload).not.toContain("relay_workplan_");
      expect(learnerFacingPayload).not.toContain("relay_artifact_");
      expect(learnerFacingPayload).not.toContain("workspace_study_advisor");
    } finally {
      await server.close();
    }
  });
});
