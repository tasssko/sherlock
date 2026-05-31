import { describe, expect, it } from "vitest";
import { createServer } from "../src/app/api/createServer.js";
import { InitialAssessmentController } from "../src/modules/assessment/InitialAssessmentController.js";
import { AssessmentAttemptController } from "../src/modules/assessment/AssessmentAttemptController.js";
import { MasterDataUploadController } from "../src/modules/assessment/MasterDataUploadController.js";
import { StudyPlanController } from "../src/modules/planning/StudyPlanController.js";
import { SqliteLearningLoopRepository } from "../src/modules/planning/SqliteLearningLoopRepository.js";
import { PracticeActivityController } from "../src/modules/practice/PracticeActivityController.js";
import { FixtureAgentRuntime } from "../src/modules/runtime/FixtureAgentRuntime.js";
import { RelayAgentRuntime } from "../src/modules/runtime/RelayAgentRuntime.js";
import {
  createLoopStudyRelayRuntimeProfile,
  defaultLoopStudyRelayRuntimeProfile,
  type LoopStudyRelayCapability,
  type LoopStudyRelayCapabilityRoute
} from "../src/modules/runtime/LoopStudyRelayRuntimeProfile.js";
import { RelayWorkspaceBinding } from "../src/modules/runtime/RelayWorkspaceBinding.js";
import { deriveGoldenPathStep } from "../src/app/ui/deriveGoldenPathStep.js";
import { InitialAssessmentContext, PracticeActivityContext, StudyPlanningContext } from "../src/domain/primitives/Context.js";
import { MasterDataItem, MasterDataSource } from "../src/domain/learning/MasterData.js";
import { LearningLoop, KnowledgeGap } from "../src/domain/learning/LearningLoop.js";
import { Workspace } from "../src/domain/primitives/Workspace.js";
import { createDomainEventRecorder } from "../src/domain/primitives/Event.js";

const difficultyScale = ["easy", "easy", "medium", "medium", "stretch"] as const;

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRelayConversationRequest(content: {
  input?: Record<string, unknown>;
  name?: string;
  text?: string;
  type?: string;
}, metadata?: Record<string, unknown>): {
  operation: string;
  payload: any;
  stage: string;
} {
  if (content.type === "command") {
    const operation =
      commandNameToOperation(content.name) ??
      metadataOperation(metadata) ??
      operationFromCandidateKind(content.input) ??
      "unknown";
    return {
      operation,
      payload: content.input ?? {},
      stage: stageForOperation(operation)
    };
  }

  const marker = "Structured context:\n";
  const messageText = content.text ?? "";
  const index = messageText.indexOf(marker);
  const payloadText = index >= 0 ? messageText.slice(index + marker.length) : "{}";
  return JSON.parse(payloadText) as { operation: string; payload: any; stage: string };
}

function commandNameToOperation(name: string | undefined): string | undefined {
  switch (name) {
    case "runtime.generate_structured_candidate":
    case "runtime.evaluate_structured_response":
      return undefined;
    default:
      return undefined;
  }
}

function metadataOperation(metadata: Record<string, unknown> | undefined): string | undefined {
  const operation = metadata?.operation;
  return typeof operation === "string" ? operation : undefined;
}

function operationFromCandidateKind(
  input: Record<string, unknown> | undefined
): string | undefined {
  const candidateKind = input?.candidateKind;
  if (typeof candidateKind !== "string") {
    return undefined;
  }

  switch (candidateKind) {
    case "master_data_interpretation":
      return "interpretMasterData";
    case "initial_assessment":
      return "generateInitialAssessment";
    case "assessment_attempt_evaluation":
      return "evaluateAssessmentAttempt";
    case "learning_loop_batch":
      return "generateLearningLoopBatch";
    case "study_plan":
      return "generateStudyPlan";
    case "practice_activity":
      return "generatePracticeActivity";
    case "active_review_evaluation":
      return "evaluateActiveReviewSession";
    default:
      return undefined;
  }
}

function stageForOperation(operation: string): string {
  switch (operation) {
    case "interpretMasterData":
      return "material-intake";
    case "generateInitialAssessment":
    case "evaluateAssessmentAttempt":
      return "diagnosis";
    case "generateLearningLoopBatch":
      return "loop-batching";
    case "generateStudyPlan":
      return "planning";
    case "generatePracticeActivity":
      return "practice";
    case "evaluateActiveReviewSession":
      return "review";
    default:
      return "loop";
  }
}

function createRelayFetchStub(): typeof fetch {
  return (async (_input, init) => {
    const url = typeof _input === "string" ? _input : _input instanceof URL ? _input.toString() : _input.url;
    const method = init?.method ?? "GET";
    if (url.includes("/v1/messages/") && url.endsWith("/inspection") && method === "GET") {
      return new Response(
        JSON.stringify({
          artifacts: [{ id: "relay_artifact_test" }],
          resultEvents: [{ artifactId: "relay_artifact_test" }],
          task: {
            id: "relay_task_inspection"
          }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    }

    if (!url.endsWith("/v1/messages")) {
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "content-type": "application/json" }
      });
    }

    const body = JSON.parse(String(init?.body ?? "{}")) as {
      content: {
        expectedOutputSchema?: string;
        input?: Record<string, unknown>;
        name?: string;
        text?: string;
        type?: string;
      };
      metadata?: Record<string, unknown>;
    };
    const relayRequest = parseRelayConversationRequest(body.content, body.metadata);
    const responseEnvelope = {
      conversationId: `relay_conversation_${relayRequest.payload.context?.learningLoopId ?? relayRequest.operation}`,
      messageId: `relay_message_${relayRequest.operation}`,
      responseMessageId: `relay_response_${relayRequest.operation}`,
      taskId: `relay_task_${relayRequest.operation}`,
      workPlanId:
        relayRequest.operation === "generateStudyPlan" ? "relay_workplan_1" : undefined,
      responseContent: {
        result: buildRelayResult(relayRequest.operation, relayRequest.payload)
      }
    };

    return new Response(JSON.stringify(responseEnvelope), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }) as typeof fetch;
}

function createRelayHandleCaptureStub(calls: string[]): typeof fetch {
  return (async (_input, init) => {
    const url = typeof _input === "string" ? _input : _input instanceof URL ? _input.toString() : _input.url;
    const method = init?.method ?? "GET";
    if (url.includes("/v1/messages/") && url.endsWith("/inspection") && method === "GET") {
      return new Response(
        JSON.stringify({
          artifacts: [{ id: "relay_artifact_test" }],
          resultEvents: [{ artifactId: "relay_artifact_test" }],
          task: {
            id: "relay_task_test"
          }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    }

    const body = JSON.parse(String(init?.body ?? "{}")) as {
      conversationId?: string;
      content: {
        expectedOutputSchema?: string;
        input?: Record<string, unknown>;
        name?: string;
        text?: string;
        type?: string;
      };
      metadata?: Record<string, unknown>;
      to?: string;
    };
    calls.push(String(body.to ?? ""));
    const relayRequest = parseRelayConversationRequest(body.content, body.metadata);

    return new Response(
      JSON.stringify({
        conversationId: body.conversationId ?? "relay_conversation_test",
        messageId: `relay_message_${relayRequest.operation}`,
        responseMessageId: `relay_response_${relayRequest.operation}`,
        taskId: "relay_task_test",
        responseContent: {
          result: buildRelayResult(relayRequest.operation, relayRequest.payload)
        }
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" }
      }
    );
  }) as typeof fetch;
}

function createRelayTextFallbackFetchStub(): typeof fetch {
  return (async (_input, init) => {
    const url = typeof _input === "string" ? _input : _input instanceof URL ? _input.toString() : _input.url;
    const method = init?.method ?? "GET";
    if (url.includes("/v1/messages/") && url.endsWith("/inspection") && method === "GET") {
      return new Response(
        JSON.stringify({
          artifacts: [{ id: "relay_artifact_text_fallback" }],
          resultEvents: [{ artifactId: "relay_artifact_text_fallback" }],
          task: {
            id: "relay_task_text_fallback"
          }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    }

    if (!url.endsWith("/v1/messages")) {
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "content-type": "application/json" }
      });
    }

    const body = JSON.parse(String(init?.body ?? "{}")) as {
      content: {
        expectedOutputSchema?: string;
        input?: Record<string, unknown>;
        name?: string;
        text?: string;
        type?: string;
      };
      metadata?: Record<string, unknown>;
    };
    const relayRequest = parseRelayConversationRequest(body.content, body.metadata);

    return new Response(
      JSON.stringify({
        conversationId: "relay_conversation_text_fallback",
        messageId: `relay_message_${relayRequest.operation}`,
        responseMessageId: `relay_response_${relayRequest.operation}`,
        taskId: "relay_task_text_fallback",
        responseText: JSON.stringify({
          result: buildRelayResult(relayRequest.operation, relayRequest.payload)
        })
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" }
      }
    );
  }) as typeof fetch;
}

function createRelayBinding(overrides: {
  baseUrl?: string;
  capabilityRoutes?: Partial<Record<LoopStudyRelayCapability, LoopStudyRelayCapabilityRoute>>;
  defaultAgentHandle?: string;
  defaultControllerId?: string;
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
      defaultAgentHandle:
        overrides.defaultAgentHandle ??
        defaultLoopStudyRelayRuntimeProfile.defaultAgentHandle,
      defaultControllerId:
        overrides.defaultControllerId ??
        defaultLoopStudyRelayRuntimeProfile.defaultControllerId,
      capabilityRoutes: {
        ...defaultLoopStudyRelayRuntimeProfile.capabilityRoutes,
        ...overrides.capabilityRoutes
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

function buildRelayResult(operation: string, payload: any): unknown {
  if (operation === "interpretMasterData") {
    const topic = payload.userHints?.topic ?? "fractions";
    return {
      interpretation: {
        schema: "MasterDataInterpretationCandidate.v1",
        detectedSubject: payload.userHints?.subject ?? "Mathematics",
        detectedYearGroup: payload.learnerYearGroup ?? "Year 7",
        mainTopic: topic,
        subtopics: ["Core facts", "Comparison"],
        keyPeople: [],
        keyTerms: ["equivalent fractions", "common denominator"],
        importantDates: [],
        processes: [],
        learnerFacingMaterialSummary: `${topic} for Year 7 focuses on core facts such as equal parts of a whole and equivalent fractions.`,
        learningObjectives: [
          {
            id: "objective_1",
            objective: `Explain how ${topic} represent equal parts of a whole in the Core facts strand.`,
            sourceRefs: ["fractions > fallback-1"]
          },
          {
            id: "objective_2",
            objective: `Compare fractions by using a common denominator in the Comparison strand.`,
            sourceRefs: ["fractions > fallback-2"]
          }
        ],
        sourceMap: [
          {
            sourceRef: "fractions > fallback-1",
            excerpt: payload.rawSourceContent ?? "Fractions can describe equal parts of a whole."
          },
          {
            sourceRef: "fractions > fallback-2",
            excerpt: "Compare fractions by finding a common denominator or decimal."
          }
        ],
        items: [
          {
            subject: payload.userHints?.subject ?? "Mathematics",
            yearGroup: payload.learnerYearGroup ?? "Year 7",
            topic,
            subtopic: "Core facts",
            itemType: "fact",
            content: "Fractions can describe equal parts of a whole.",
            sourceRef: "fractions > fallback-1"
          },
          {
            subject: payload.userHints?.subject ?? "Mathematics",
            yearGroup: payload.learnerYearGroup ?? "Year 7",
            topic,
            subtopic: "Comparison",
            itemType: "fact",
            content: "Compare fractions by finding a common denominator or decimal.",
            sourceRef: "fractions > fallback-2"
          }
        ]
      }
    };
  }

  if (operation === "generateInitialAssessment") {
    const questionCount = Number(payload.context?.questionCount ?? payload.relevantSourceExcerpts.length);
    const items = payload.relevantSourceExcerpts.slice(0, questionCount).map((item: any, index: number) => ({
      id: `assessment_item_${index + 1}`,
      topic: payload.topic ?? item.topic,
      prompt: `What should you remember about ${item.subtopic}? [Source: ${item.sourceRef}]`,
      canonicalAnswer: item.content,
      visibleMaterial: `Source ref: ${item.sourceRef} · ${item.topic} · recall from notes`,
      difficulty: difficultyScale[index] ?? "stretch",
      sourceMasterDataItemId: item.sourceRef
    }));

    return {
      items,
      artifactContent: {
        topic: payload.context.topic,
        questionCount,
        instructions: `Complete all ${questionCount} questions without notes. The goal is to diagnose current understanding in ${payload.context.topic}.`,
        items: items.map((item: any) => ({
          id: item.id,
          prompt: item.prompt,
          difficulty: item.difficulty
        }))
      }
    };
  }

  if (operation === "evaluateAssessmentAttempt") {
    const responseByItemId = new Map(
      payload.responses.map((response: any) => [response.itemId, response.answer])
    );
    const itemResults = payload.assessment.items.map((item: any) => {
      const answer = responseByItemId.get(item.id) ?? "";
      const correct = normalize(answer) === normalize(item.canonicalAnswer);
      return {
        itemId: item.id,
        correct,
        feedback: correct
          ? `Secure response for ${item.topic}.`
          : `Review the underlying idea for ${item.topic} and revisit the missed method.`,
        topic: item.topic
      };
    });
    const score =
      itemResults.length === 0
        ? 0
        : itemResults.filter((result: any) => result.correct).length / itemResults.length;

    return {
      score,
      itemResults,
      knowledgeGaps: itemResults
        .filter((result: any) => !result.correct)
        .map((result: any) => ({
          topic: result.topic,
          description: `Needs more support with ${result.topic}.`,
          evidence: `Missed assessment item ${result.itemId}.`,
          severity: score < 0.5 ? "high" : "medium"
        }))
    };
  }

  if (operation === "generatePracticeActivity") {
    return {
      flashcardSet: {
        instructions: `Review each card, attempt an answer from memory, then flip to check accuracy for ${payload.context.topic}.`,
        cards: payload.selections.map((selection: any, index: number) => ({
          id: `flashcard_${index + 1}`,
          front: selection.item.prompt,
          back: selection.item.content ?? selection.item.canonicalAnswer,
          topic: selection.item.topic,
          knowledgeGapId: selection.gap.id,
          learningObjective: selection.gap.description,
          sourceMasterDataItemId: selection.item.id,
          sourceVisibleSentence: selection.item.visibleMaterial
        }))
      }
    };
  }

  if (operation === "generateStudyPlan") {
    const activeDays = payload.context.schedule.filter((entry: any) => entry.minutes > 0);
    const fallbackTopic = payload.context.focusTopics[0];
    return {
      assumptions: [
        {
          id: "assumption_spaced_repetition",
          statement: "Repeated topics across the week are allowed to reinforce retention."
        }
      ],
      decisions: [
        "Allocated one primary topic to each active study day.",
        ...(payload.context.diagnosedGaps.length > 0
          ? [`Prioritised diagnosed gaps in ${payload.context.diagnosedGaps.join(", ")}.`]
          : [])
      ],
      childTaskSummaries: payload.context.focusTopics.map(
        (topic: string) => `Prepare a focused ${topic} study block with retrieval and self-check.`
      ),
      artifactContent: {
        summary:
          payload.context.diagnosedGaps.length > 0
            ? `${payload.context.learnerName} will follow a one-week plan focused on closing gaps in ${payload.context.diagnosedGaps.join(", ")} and reinforcing ${payload.context.focusTopics.join(", ")}.`
            : `${payload.context.learnerName} will follow a one-week plan focused on ${payload.context.focusTopics.join(", ")}.`,
        sessions: activeDays.map((entry: any, index: number) => ({
          day: entry.day,
          minutes: entry.minutes,
          topic: payload.context.focusTopics[index % payload.context.focusTopics.length] ?? fallbackTopic,
          activity: `Recap key ideas in ${payload.context.focusTopics[index % payload.context.focusTopics.length] ?? fallbackTopic}, complete one focused practice set, then self-check.`,
          outcome: `Leave the session with one verified success criterion for ${payload.context.focusTopics[index % payload.context.focusTopics.length] ?? fallbackTopic}.`
        })),
        checkpoints: [
          `Midweek check: explain one idea from ${fallbackTopic} without notes.`
        ],
        notes: [
          "Keep materials ready before each session to protect the short weekday slots."
        ]
      }
    };
  }

  if (operation === "generateLearningLoopBatch") {
    const interpretation = payload.materialInterpretation ?? {};
    const objectiveRefs = Array.isArray(interpretation.learningObjectives)
      ? interpretation.learningObjectives
          .map((objective: any) => objective?.id)
          .filter((value: unknown): value is string => typeof value === "string")
      : [];
    const sourceRefs = Array.isArray(interpretation.sourceMap)
      ? interpretation.sourceMap
          .map((entry: any) => entry?.sourceRef)
          .filter((value: unknown): value is string => typeof value === "string")
      : [];
    const diagnosedGaps = Array.isArray(payload.diagnosedGaps) ? payload.diagnosedGaps : [];
    const desiredLoopCount = Number(payload.desiredLoopCount ?? 3);
    const targetDurationMinutes = Number(payload.targetLoopDurationMinutes ?? 5);

    return {
      schema: "LearningLoopBatchCandidate.v1",
      overview: `Work through short ${String(interpretation.mainTopic ?? "study").toLowerCase()} loops before moving on.`,
      targetDurationMinutes,
      units: diagnosedGaps.slice(0, desiredLoopCount).map((gap: any, index: number) => ({
        focus: String(gap.topic ?? interpretation.mainTopic ?? "study"),
        reason: `${String(gap.description ?? "This idea was least secure in the check-up")} and needs a short follow-up loop.`,
        objectiveRefs: objectiveRefs.slice(0, 1),
        sourceRefs: sourceRefs.slice(0, 2),
        targetKnowledgeGapIds: [String(gap.id ?? `gap_${index + 1}`)],
        shortExplanation:
          String(interpretation.learnerFacingMaterialSummary ?? "") ||
          `Revisit the core idea in ${String(interpretation.mainTopic ?? "study")}.`,
        learnerTask: `Spend ${targetDurationMinutes} minutes explaining ${String(gap.topic ?? interpretation.mainTopic ?? "this idea")} in your own words, then write one remembered example.`,
        quickCheckQuestions: [
          {
            prompt: `How would you explain ${String(gap.topic ?? interpretation.mainTopic ?? "this idea")} without looking back at the notes?`
          }
        ],
        reviewItems: sourceRefs.length
          ? [
              {
                prompt: `What should you remember about ${String(gap.topic ?? interpretation.mainTopic ?? "this idea")}?`,
                answer:
                  String(interpretation.learnerFacingMaterialSummary ?? "") ||
                  `Be able to explain ${String(gap.topic ?? interpretation.mainTopic ?? "this idea")} accurately from memory.`
              }
            ]
          : [],
        state: index === 0 ? "ready" : "locked"
      }))
    };
  }

  throw new Error(`Unsupported relay operation ${operation}.`);
}

async function runLoopFlow(server: Awaited<ReturnType<typeof createServer>>) {
  const uploadResponse = await server.inject({
    method: "POST",
    url: "/v1/master-data",
    payload: {
      sourceName: "Year 7 Fractions Bank",
      items: [
        {
          topic: "fractions",
          prompt: "Simplify 6/8.",
          canonicalAnswer: "three quarters",
          visibleMaterial: "Fractions can describe equal parts of a whole."
        },
        {
          topic: "fractions",
          prompt: "Which is larger: 2/3 or 3/5?",
          canonicalAnswer: "two thirds",
          visibleMaterial: "Compare fractions by finding a common denominator or decimal."
        }
      ]
    }
  });
  expect(uploadResponse.statusCode).toBe(201);

  const assessmentResponse = await server.inject({
    method: "POST",
    url: "/v1/assessments/initial",
    payload: {
      learnerName: "Year 7 learner",
      yearGroup: "Year 7",
      topic: "fractions",
      questionCount: 2
    }
  });
  expect(assessmentResponse.statusCode).toBe(201);
  const assessment = assessmentResponse.json();
  const afterAssessmentResume = await server.inject({
    method: "GET",
    url: `/v1/learning-loops/${assessment.learningLoop.id}`
  });
  expect(afterAssessmentResume.statusCode).toBe(200);

  const attemptResponse = await server.inject({
    method: "POST",
    url: "/v1/assessments/attempts",
    payload: {
      assessmentId: assessment.assessment.id,
      responses: assessment.assessment.items.map((item: { id: string }) => ({
        itemId: item.id,
        answer: "incorrect response"
      }))
    }
  });
  expect(attemptResponse.statusCode).toBe(201);
  const afterAttemptResume = await server.inject({
    method: "GET",
    url: `/v1/learning-loops/${assessment.learningLoop.id}`
  });
  expect(afterAttemptResume.statusCode).toBe(200);

  const studyPlanResponse = await server.inject({
    method: "POST",
    url: "/v1/study-plans",
    payload: {
      learnerName: "Year 7 learner",
      yearGroup: "Year 7",
      objective: "Build a weekly plan.",
      focusTopics: ["fractions"],
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
  const afterStudyPlanResume = await server.inject({
    method: "GET",
    url: `/v1/learning-loops/${assessment.learningLoop.id}`
  });
  expect(afterStudyPlanResume.statusCode).toBe(200);

  const practiceResponse = await server.inject({
    method: "POST",
    url: `/v1/learning-loops/${assessment.learningLoop.id}/practice-activities`,
    payload: {
      kind: "flashcard_set",
      cardCount: 2
    }
  });
  expect(practiceResponse.statusCode).toBe(201);
  const afterPracticeResume = await server.inject({
    method: "GET",
    url: `/v1/learning-loops/${assessment.learningLoop.id}`
  });
  expect(afterPracticeResume.statusCode).toBe(200);

  const practiceListResponse = await server.inject({
    method: "GET",
    url: `/v1/learning-loops/${assessment.learningLoop.id}/practice-activities`
  });
  expect(practiceListResponse.statusCode).toBe(200);

  const practiceCompletionResponse = await server.inject({
    method: "POST",
    url: `/v1/practice-activities/${practiceResponse.json().practiceActivity.id}/completions`,
    payload: {
      responses: practiceResponse.json().practiceActivity.flashcardSet.cards.map(
        (card: { back: string; id: string }) => ({
          practiceItemId: card.id,
          responseText: card.back,
          confidence: "high"
        })
      )
    }
  });
  expect(practiceCompletionResponse.statusCode).toBe(201);
  const afterCompletionResume = await server.inject({
    method: "GET",
    url: `/v1/learning-loops/${assessment.learningLoop.id}`
  });
  expect(afterCompletionResume.statusCode).toBe(200);

  return {
    assessment: assessmentResponse.json(),
    afterAssessmentResume: afterAssessmentResume.json(),
    attempt: attemptResponse.json(),
    afterAttemptResume: afterAttemptResume.json(),
    practice: practiceResponse.json(),
    practiceList: practiceListResponse.json(),
    completion: practiceCompletionResponse.json(),
    afterPracticeResume: afterPracticeResume.json(),
    afterCompletionResume: afterCompletionResume.json(),
    studyPlan: studyPlanResponse.json()
    ,
    afterStudyPlanResume: afterStudyPlanResume.json()
  };
}

describe("Agent runtime contract", () => {
  it("lets FixtureAgentRuntime and RelayAgentRuntime satisfy the same AgentRuntime contract", async () => {
    const fixtureRuntime = new FixtureAgentRuntime();
    const relayRuntime = new RelayAgentRuntime({
      binding: createRelayBinding(),
      fetcher: createRelayFetchStub()
    });

    const source = MasterDataSource.create("Fractions Bank", []);
    const sourceItem = MasterDataItem.create(source.id, {
      topic: "fractions",
      prompt: "Simplify 6/8.",
      canonicalAnswer: "three quarters",
      visibleMaterial: "Fractions can describe equal parts of a whole."
    });
    const assessmentContext = InitialAssessmentContext.create({
      command: {
        learnerName: "Year 7 learner",
        yearGroup: "Year 7",
        topic: "fractions",
        questionCount: 1
      },
      sourceName: source.name
    });
    const studyContext = StudyPlanningContext.fromCommand({
      learnerName: "Year 7 learner",
      yearGroup: "Year 7",
      objective: "Build a weekly plan.",
      focusTopics: ["fractions"],
      availableMinutesByDay: {
        Monday: 30,
        Tuesday: 30,
        Wednesday: 30,
        Thursday: 30,
        Friday: 30,
        Saturday: 60,
        Sunday: 0
      }
    });
    const workspace = Workspace.create({
      title: "Study Workspace",
      learner: {
        name: "Year 7 learner",
        yearGroup: "Year 7",
        availableMinutesByDay: {}
      },
      activeObjective: "Build secure understanding in fractions."
    });
    const events = createDomainEventRecorder(workspace.id);
    const loop = LearningLoop.create(
      {
        workspaceId: workspace.id,
        objective: "Build secure understanding in fractions.",
        topic: "fractions"
      },
      events
    );
    const gap = KnowledgeGap.create({
      learningLoopId: loop.id,
      topic: "fractions",
      description: "Needs support with equivalent fractions.",
      evidence: "Missed a diagnostic item.",
      severity: "high"
    });
    const practiceContext = PracticeActivityContext.create({
      command: {
        learningLoopId: loop.id,
        kind: "flashcard_set",
        cardCount: 1
      },
      diagnosedGaps: [gap.toSnapshot().description],
      learnerName: "Year 7 learner",
      learningLoopId: loop.id,
      sourceNames: [source.name],
      topic: "fractions",
      yearGroup: "Year 7"
    });

    const fixtureAssessment = await fixtureRuntime.generateInitialAssessment({
      context: assessmentContext,
      learningLoopId: loop.id,
      source,
      sourceItems: [sourceItem]
    });
    const relayAssessment = await relayRuntime.generateInitialAssessment({
      context: assessmentContext,
      learningLoopId: loop.id,
      source,
      sourceItems: [sourceItem]
    });
    expect(fixtureAssessment.ok).toBe(true);
    expect(relayAssessment.ok).toBe(true);
    if (!fixtureAssessment.ok || !relayAssessment.ok) {
      return;
    }
    expect(Object.keys(relayAssessment.value.artifactContent).sort()).toEqual(
      Object.keys(fixtureAssessment.value.artifactContent).sort()
    );

    const fixtureEvaluation = await fixtureRuntime.evaluateAssessmentAttempt({
      assessment: {
        topic: "fractions",
        items: fixtureAssessment.value.items
      },
      contextTopic: "fractions",
      learningLoopId: loop.id,
      responses: [
        {
          itemId: fixtureAssessment.value.items[0].id,
          answer: "incorrect response"
        }
      ]
    });
    const relayEvaluation = await relayRuntime.evaluateAssessmentAttempt({
      assessment: {
        topic: "fractions",
        items: fixtureAssessment.value.items
      },
      contextTopic: "fractions",
      learningLoopId: loop.id,
      responses: [
        {
          itemId: fixtureAssessment.value.items[0].id,
          answer: "incorrect response"
        }
      ]
    });
    expect(fixtureEvaluation.ok).toBe(true);
    expect(relayEvaluation.ok).toBe(true);
    if (!fixtureEvaluation.ok || !relayEvaluation.ok) {
      return;
    }
    expect(
      Object.keys(relayEvaluation.value)
        .filter((key) => key !== "runtimeTrace" && key !== "runtimeConversationBinding")
        .sort()
    ).toEqual(
      Object.keys(fixtureEvaluation.value)
        .filter((key) => key !== "runtimeTrace" && key !== "runtimeConversationBinding")
        .sort()
    );

    const fixturePractice = await fixtureRuntime.generatePracticeActivity({
      context: practiceContext,
      learningLoopId: loop.id,
      selections: [
        {
          gap: {
            id: gap.id,
            description: gap.toSnapshot().description
          },
          item: sourceItem
        }
      ]
    });
    const relayPractice = await relayRuntime.generatePracticeActivity({
      context: practiceContext,
      learningLoopId: loop.id,
      selections: [
        {
          gap: {
            id: gap.id,
            description: gap.toSnapshot().description
          },
          item: sourceItem
        }
      ]
    });
    expect(fixturePractice.ok).toBe(true);
    expect(relayPractice.ok).toBe(true);
    if (!fixturePractice.ok || !relayPractice.ok) {
      return;
    }
    expect(Object.keys(relayPractice.value.flashcardSet).sort()).toEqual(
      Object.keys(fixturePractice.value.flashcardSet).sort()
    );

    const fixtureStudyPlan = await fixtureRuntime.generateStudyPlan({
      context: studyContext,
      learningLoopId: loop.id
    });
    const relayStudyPlan = await relayRuntime.generateStudyPlan({
      context: studyContext,
      learningLoopId: loop.id
    });
    expect(fixtureStudyPlan.ok).toBe(true);
    expect(relayStudyPlan.ok).toBe(true);
    if (!fixtureStudyPlan.ok || !relayStudyPlan.ok) {
      return;
    }
    expect(Object.keys(relayStudyPlan.value.artifactContent).sort()).toEqual(
      Object.keys(fixtureStudyPlan.value.artifactContent).sort()
    );
  });

  it("accepts Relay responseText as a compatibility fallback when responseContent is absent", async () => {
    const runtime = new RelayAgentRuntime({
      binding: createRelayBinding(),
      fetcher: createRelayTextFallbackFetchStub()
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
      learningLoopId: "loop_text_fallback",
      source,
      sourceItems: [sourceItem]
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.items).toHaveLength(1);
  });

  it("normalizes wrapped assessment payloads that only provide questions plus artifact content", async () => {
    const runtime = new RelayAgentRuntime({
      binding: createRelayBinding(),
      fetcher: (async (_input, init) => {
        const url =
          typeof _input === "string"
            ? _input
            : _input instanceof URL
              ? _input.toString()
              : _input.url;
        const method = init?.method ?? "GET";

        if (url.includes("/v1/messages/") && url.endsWith("/inspection") && method === "GET") {
          return new Response(
            JSON.stringify({
              artifacts: [{ id: "relay_artifact_assessment_compat" }],
              resultEvents: [{ artifactId: "relay_artifact_assessment_compat" }],
              task: {
                id: "relay_task_assessment_compat"
              }
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" }
            }
          );
        }

        return new Response(
          JSON.stringify({
            conversationId: "relay_conversation_assessment_compat",
            messageId: "relay_message_assessment_compat",
            responseMessageId: "relay_response_assessment_compat",
            taskId: "relay_task_assessment_compat",
            responseContent: {
              type: "json",
              value: {
                assessment: {
                  questions: [
                    {
                      id: "question_1",
                      question: "What should you remember about Core facts?",
                      difficulty: "easy"
                    }
                  ],
                  artifactContent: {
                    topic: "fractions",
                    questionCount: 1,
                    instructions: "Answer the question from memory.",
                    items: [
                      {
                        id: "question_1",
                        prompt: "What should you remember about Core facts?",
                        difficulty: "easy"
                      }
                    ]
                  }
                }
              }
            }
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
      visibleMaterial: "Fractions can describe equal parts of a whole.",
      structured: {
        subject: "Mathematics",
        yearGroup: "Year 7",
        topic: "fractions",
        subtopic: "Core facts",
        itemType: "fact",
        content: "Fractions can describe equal parts of a whole.",
        sourceRef: "fractions > fallback-1"
      }
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
      learningLoopId: "loop_assessment_compat",
      source,
      sourceItems: [sourceItem]
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.items).toHaveLength(1);
    expect(result.value.items[0]).toMatchObject({
      prompt: "What should you remember about Core facts?",
      canonicalAnswer: "Fractions can describe equal parts of a whole.",
      sourceMasterDataItemId: sourceItem.id
    });
    expect(result.value.artifactContent).toMatchObject({
      topic: "fractions",
      questionCount: 1
    });
  });

  it("routes Relay capabilities through the configured runtime profile", async () => {
    const calls: string[] = [];
    const runtime = new RelayAgentRuntime({
      binding: createRelayBinding({
        defaultAgentHandle: "writer",
        capabilityRoutes: {
          generateInitialAssessment: {
            agentHandle: "assessor"
          },
          evaluateAssessmentAttempt: {
            agentHandle: "reviewer"
          },
          generateStudyPlan: {
            agentHandle: "planner"
          },
          generatePracticeActivity: {
            agentHandle: "coach"
          }
        }
      }),
      fetcher: createRelayHandleCaptureStub(calls)
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

    const workspace = Workspace.create({
      title: "Study Workspace",
      learner: {
        name: "Year 7 learner",
        yearGroup: "Year 7",
        availableMinutesByDay: {}
      },
      activeObjective: "Build secure understanding in fractions."
    });
    const events = createDomainEventRecorder(workspace.id);
    const loop = LearningLoop.create(
      {
        workspaceId: workspace.id,
        objective: "Build secure understanding in fractions.",
        topic: "fractions"
      },
      events
    );
    const gap = KnowledgeGap.create({
      learningLoopId: loop.id,
      topic: "fractions",
      description: "Needs support with equivalent fractions.",
      evidence: "Missed a diagnostic item.",
      severity: "high"
    });
    const practiceContext = PracticeActivityContext.create({
      command: {
        learningLoopId: loop.id,
        kind: "flashcard_set",
        cardCount: 1
      },
      diagnosedGaps: [gap.toSnapshot().description],
      learnerName: "Year 7 learner",
      learningLoopId: loop.id,
      sourceNames: [source.name],
      topic: "fractions",
      yearGroup: "Year 7"
    });
    const studyContext = StudyPlanningContext.fromCommand({
      learnerName: "Year 7 learner",
      yearGroup: "Year 7",
      objective: "Build a weekly plan.",
      focusTopics: ["fractions"],
      availableMinutesByDay: {
        Monday: 30,
        Tuesday: 30,
        Wednesday: 30,
        Thursday: 30,
        Friday: 30,
        Saturday: 60,
        Sunday: 0
      }
    });

    const assessment = await runtime.generateInitialAssessment({
      context,
      learningLoopId: loop.id,
      source,
      sourceItems: [sourceItem]
    });
    expect(assessment.ok).toBe(true);

    const evaluation = await runtime.evaluateAssessmentAttempt({
      assessment: {
        topic: "fractions",
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
        ]
      },
      contextTopic: "fractions",
      learningLoopId: loop.id,
      responses: [
        {
          itemId: "assessment_item_1",
          answer: "incorrect response"
        }
      ]
    });
    expect(evaluation.ok).toBe(true);

    const studyPlan = await runtime.generateStudyPlan({
      context: studyContext,
      learningLoopId: loop.id
    });
    expect(studyPlan.ok).toBe(true);

    const practice = await runtime.generatePracticeActivity({
      context: practiceContext,
      learningLoopId: loop.id,
      selections: [
        {
          gap: {
            id: gap.id,
            description: gap.toSnapshot().description
          },
          item: sourceItem
        }
      ]
    });
    expect(practice.ok).toBe(true);

    expect(calls).toEqual(["@assessor", "@reviewer", "@planner", "@coach"]);
  });

  it("sends structured Relay messages and reuses one internal conversation per learning loop", async () => {
    const calls: {
      candidateKind?: string;
      commandName?: string;
      conversationId?: string;
      idempotencyKey?: string;
      input?: Record<string, unknown>;
      inputSchema?: string;
      metadata?: Record<string, unknown>;
      messageText: string;
      to?: string;
    }[] = [];
    const runtime = new RelayAgentRuntime({
      binding: createRelayBinding({
        capabilityRoutes: {
          generateInitialAssessment: {
            agentHandle: "tutor"
          },
          evaluateAssessmentAttempt: {
            agentHandle: "tutor"
          }
        }
      }),
      fetcher: (async (_input, init) => {
        const url =
          typeof _input === "string"
            ? _input
            : _input instanceof URL
              ? _input.toString()
              : _input.url;
        const method = init?.method ?? "GET";
        if (url.includes("/v1/messages/") && url.endsWith("/inspection") && method === "GET") {
          return new Response(
            JSON.stringify({
              artifacts: [{ id: "relay_artifact_loop_1" }],
              resultEvents: [{ artifactId: "relay_artifact_loop_1" }],
              task: {
                id: "relay_task_loop_1"
              }
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" }
            }
          );
        }

        expect(url.endsWith("/v1/messages")).toBe(true);

        const body = JSON.parse(String(init?.body ?? "{}")) as {
          conversationId?: string;
          content: {
            input?: Record<string, unknown>;
            inputSchema?: string;
            name?: string;
            previewText?: string;
            text?: string;
            type?: string;
          };
          idempotencyKey?: string;
          metadata?: Record<string, unknown>;
          to?: string;
        };
        calls.push({
          candidateKind:
            typeof body.content.input?.candidateKind === "string"
              ? body.content.input.candidateKind
              : undefined,
          commandName: body.content.name,
          conversationId: body.conversationId,
          idempotencyKey: body.idempotencyKey,
          input: body.content.input,
          inputSchema: body.content.inputSchema,
          metadata: body.metadata,
          messageText: body.content.text ?? body.content.previewText,
          to: body.to
        });
        const relayRequest = parseRelayConversationRequest(body.content, body.metadata);

        return new Response(
          JSON.stringify({
            conversationId: body.conversationId ?? "relay_conversation_loop_1",
            messageId: `relay_message_${relayRequest.operation}`,
            responseMessageId: `relay_response_${relayRequest.operation}`,
            taskId: `relay_task_${relayRequest.operation}`,
            responseContent: {
              result: buildRelayResult(relayRequest.operation, relayRequest.payload)
            }
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
    const workspace = Workspace.create({
      title: "Study Workspace",
      learner: {
        name: "Year 7 learner",
        yearGroup: "Year 7",
        availableMinutesByDay: {}
      },
      activeObjective: "Build secure understanding in fractions."
    });
    const events = createDomainEventRecorder(workspace.id);
    const loop = LearningLoop.create(
      {
        workspaceId: workspace.id,
        objective: "Build secure understanding in fractions.",
        topic: "fractions"
      },
      events
    );
    const assessmentContext = InitialAssessmentContext.create({
      command: {
        learnerName: "Year 7 learner",
        yearGroup: "Year 7",
        topic: "fractions",
        questionCount: 1
      },
      sourceName: source.name
    });

    const assessment = await runtime.generateInitialAssessment({
      context: assessmentContext,
      learningLoopId: loop.id,
      source,
      sourceItems: [sourceItem]
    });
    expect(assessment.ok).toBe(true);
    if (!assessment.ok) {
      return;
    }

    const evaluation = await runtime.evaluateAssessmentAttempt({
      assessment: {
        topic: "fractions",
        items: assessment.value.items
      },
      contextTopic: "fractions",
      learningLoopId: loop.id,
      responses: [
        {
          itemId: assessment.value.items[0].id,
          answer: "incorrect response"
        }
      ],
      runtimeConversationBinding: assessment.value.runtimeConversationBinding
    });
    expect(evaluation.ok).toBe(true);
    if (!evaluation.ok) {
      return;
    }

    expect(calls).toHaveLength(2);
    expect(calls[0]?.to).toBe("@tutor");
    expect(calls[1]?.to).toBe("@tutor");
    expect(calls[0]?.commandName).toBe("runtime.generate_structured_candidate");
    expect(calls[1]?.commandName).toBe("runtime.evaluate_structured_response");
    expect(calls[0]?.inputSchema).toBe("RuntimeGenerateStructuredCandidateInput.v1");
    expect(calls[1]?.inputSchema).toBe("RuntimeEvaluateStructuredResponseInput.v1");
    expect(calls[0]?.candidateKind).toBe("initial_assessment");
    expect(calls[1]?.candidateKind).toBe("assessment_attempt_evaluation");
    expect(calls[0]?.conversationId).toBeUndefined();
    expect(calls[1]?.conversationId).toBe("relay_conversation_loop_1");
    expect(calls[0]?.messageText).not.toContain("@supervisor");
    expect(calls[0]?.input?.materialInterpretation).toMatchObject({
      mainTopic: "fractions"
    });
    expect(
      Array.isArray(
        (calls[0]?.input?.materialInterpretation as { learningObjectives?: unknown[] } | undefined)
          ?.learningObjectives
      )
    ).toBe(true);
    expect(
      Array.isArray(
        (calls[0]?.input?.materialInterpretation as { sourceMap?: unknown[] } | undefined)
          ?.sourceMap
      )
    ).toBe(true);
    expect(
      Array.isArray(
        (calls[0]?.input?.materialInterpretation as { items?: unknown[] } | undefined)?.items
      )
    ).toBe(true);
    expect(JSON.stringify(calls[0]?.input ?? {})).not.toContain("\"canonicalAnswer\"");
    expect(JSON.stringify(calls[0]?.input ?? {})).not.toContain("\"sourceItems\"");
    expect(calls[0]?.metadata).toMatchObject({
      product: "loop.study",
      learningLoopId: loop.id,
      stage: "diagnosis",
      operation: "generateInitialAssessment",
      expectedOutputSchema: "InitialAssessmentGenerationCandidate"
    });
    expect(calls[1]?.metadata).toMatchObject({
      product: "loop.study",
      learningLoopId: loop.id,
      stage: "diagnosis",
      operation: "evaluateAssessmentAttempt",
      expectedOutputSchema: "AssessmentAttemptEvaluationCandidate"
    });
    expect(calls[0]?.idempotencyKey).toContain(`loop-study:${loop.id}:generateInitialAssessment:`);
    expect(calls[1]?.idempotencyKey).toContain(`loop-study:${loop.id}:evaluateAssessmentAttempt:`);
    expect(assessment.value.runtimeConversationBinding?.relayConversationId).toBe(
      "relay_conversation_loop_1"
    );
    expect(evaluation.value.runtimeConversationBinding?.relayConversationId).toBe(
      "relay_conversation_loop_1"
    );
  });

  it("returns a learner-safe error when Relay reports command_not_registered", async () => {
    const runtime = new RelayAgentRuntime({
      binding: createRelayBinding({
        capabilityRoutes: {
          evaluateAssessmentAttempt: {
            agentHandle: "tutor"
          }
        }
      }),
      fetcher: (async (_input, init) => {
        const url =
          typeof _input === "string"
            ? _input
            : _input instanceof URL
              ? _input.toString()
              : _input.url;

        if (!url.endsWith("/v1/messages")) {
          return new Response(JSON.stringify({ error: "not_found" }), {
            status: 404,
            headers: { "content-type": "application/json" }
          });
        }

        return new Response(
          JSON.stringify({
            schema: "RelayCommandError.v1",
            error: "command_not_registered",
            code: "COMMAND_NOT_REGISTERED",
            message:
              "Direct command runtime.evaluate_structured_response is not registered for runtime execution."
          }),
          {
            status: 404,
            headers: { "content-type": "application/json" }
          }
        );
      }) as typeof fetch
    });

    const result = await runtime.evaluateAssessmentAttempt({
      assessment: {
        topic: "fractions",
        items: [
          {
            id: "assessment_item_1",
            topic: "fractions",
            prompt: "What is one half of 10?",
            canonicalAnswer: "5",
            visibleMaterial: "Source ref: fractions > fact-1",
            difficulty: "easy"
          }
        ]
      },
      contextTopic: "fractions",
      learningLoopId: "loop_missing_command",
      responses: [
        {
          itemId: "assessment_item_1",
          answer: "4"
        }
      ]
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.message).toContain(
      "The assessment service could not evaluate this attempt right now."
    );
    expect(result.error.message).toContain(
      "required structured runtime command is not registered right now"
    );
    expect(result.error.message).not.toContain("workspace_study_advisor");
  });

  it("normalizes live-style assessment evaluation payloads into canonical itemResults and knowledgeGaps", async () => {
    const runtime = new RelayAgentRuntime({
      binding: createRelayBinding(),
      fetcher: (async (_input, init) => {
        const url =
          typeof _input === "string"
            ? _input
            : _input instanceof URL
              ? _input.toString()
              : _input.url;

        if (!url.endsWith("/v1/messages")) {
          return new Response(JSON.stringify({ error: "not_found" }), {
            status: 404,
            headers: { "content-type": "application/json" }
          });
        }

        return new Response(
          JSON.stringify({
            conversationId: "relay_conversation_eval_live_shape",
            messageId: "relay_message_eval_live_shape",
            responseMessageId: "relay_response_eval_live_shape",
            taskId: "relay_task_eval_live_shape",
            responseContent: {
              result: {
                score: 0.33,
                results: [
                  {
                    id: "q1",
                    verdict: "correct",
                    commentary: "Secure understanding of the first item."
                  },
                  {
                    id: "q2",
                    verdict: "partial",
                    commentary: "Some understanding shown, but key process detail is missing."
                  },
                  {
                    id: "q3",
                    verdict: "incorrect",
                    commentary: "This answer does not match the expected process."
                  }
                ],
                focusAreas: [
                  {
                    topic: "Coasts",
                    title: "Coastal processes",
                    evidence: "Partial and incorrect answers suggest erosion and transport are insecure.",
                    severity: "high"
                  }
                ]
              }
            }
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }) as typeof fetch
    });

    const result = await runtime.evaluateAssessmentAttempt({
      assessment: {
        topic: "Coasts",
        items: [
          {
            id: "q1",
            topic: "Coasts",
            prompt: "What is a coast?",
            canonicalAnswer: "where land meets the sea",
            visibleMaterial: "Source ref: Coasts > Intro > fact-1",
            difficulty: "easy",
            sourceMasterDataItemId: "md_1" as never
          },
          {
            id: "q2",
            topic: "Coasts",
            prompt: "Name two coastal processes.",
            canonicalAnswer: "erosion and longshore drift",
            visibleMaterial: "Source ref: Coasts > Processes > fact-1",
            difficulty: "medium",
            sourceMasterDataItemId: "md_2" as never
          },
          {
            id: "q3",
            topic: "Coasts",
            prompt: "What does longshore drift do?",
            canonicalAnswer: "moves sediment along the coast",
            visibleMaterial: "Source ref: Coasts > Processes > fact-2",
            difficulty: "medium",
            sourceMasterDataItemId: "md_3" as never
          }
        ]
      },
      contextTopic: "Coasts",
      learningLoopId: "loop_eval_live_shape",
      responses: [
        { itemId: "q1", answer: "where land meets the sea" },
        { itemId: "q2", answer: "erosion and long shore drift" },
        { itemId: "q3", answer: "it shifts material from the land to the sea" }
      ]
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.itemResults).toHaveLength(3);
    expect(result.value.itemResults.map((item) => item.correct)).toEqual([true, false, false]);
    expect(result.value.knowledgeGaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          topic: "Coasts",
          description: "Coastal processes",
          severity: "high"
        })
      ])
    );
  });

  it("normalizes nested Relay study-plan payloads into canonical artifact content", async () => {
    const runtime = new RelayAgentRuntime({
      binding: createRelayBinding(),
      fetcher: (async (_input, init) => {
        const url =
          typeof _input === "string"
            ? _input
            : _input instanceof URL
              ? _input.toString()
              : _input.url;

        if (!url.endsWith("/v1/messages")) {
          return new Response(JSON.stringify({ error: "not_found" }), {
            status: 404,
            headers: { "content-type": "application/json" }
          });
        }

        return new Response(
          JSON.stringify({
            conversationId: "relay_conversation_study_plan_nested",
            messageId: "relay_message_study_plan_nested",
            responseMessageId: "relay_response_study_plan_nested",
            taskId: "relay_task_study_plan_nested",
            responseContent: {
              type: "json",
              schema: "StudyPlanGenerationCandidate",
              value: {
                assumptions: [
                  {
                    id: "assumption_1",
                    statement: "Repeated topics across the week are allowed."
                  }
                ],
                decisions: ["Allocated one primary topic to each active study day."],
                childTaskSummaries: ["Prepare a focused Coasts study block with retrieval and self-check."],
                content: {
                  planSummary: "Merry Penguin will follow a one-week plan focused on Coasts.",
                  studySessions: [
                    {
                      day: "Monday",
                      minutes: 30,
                      topic: "Coasts",
                      activity: "Recap key ideas in Coasts, complete one focused practice set, then self-check.",
                      outcome: "Leave the session with one verified success criterion for Coasts."
                    }
                  ],
                  checks: ["Midweek check: explain one idea from Coasts without notes."],
                  tips: ["Keep materials ready before each session to protect the short weekday slots."]
                }
              }
            }
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }) as typeof fetch
    });

    const studyContext = StudyPlanningContext.fromCommand({
      learnerName: "Merry Penguin",
      yearGroup: "Year 7",
      objective: "Build secure understanding in Coasts.",
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
    });

    const result = await runtime.generateStudyPlan({
      context: studyContext,
      learningLoopId: "loop_study_plan_nested"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.artifactContent).toMatchObject({
      summary: "Merry Penguin will follow a one-week plan focused on Coasts.",
      sessions: [
        expect.objectContaining({
          day: "Monday",
          topic: "Coasts",
          minutes: 30
        })
      ],
      checkpoints: ["Midweek check: explain one idea from Coasts without notes."],
      notes: ["Keep materials ready before each session to protect the short weekday slots."]
    });
  });

  it("normalizes live-style study-plan payloads that use artifactSummary and sessionPlan", async () => {
    const runtime = new RelayAgentRuntime({
      binding: createRelayBinding(),
      fetcher: (async (_input, init) => {
        const url =
          typeof _input === "string"
            ? _input
            : _input instanceof URL
              ? _input.toString()
              : _input.url;

        if (!url.endsWith("/v1/messages")) {
          return new Response(JSON.stringify({ error: "not_found" }), {
            status: 404,
            headers: { "content-type": "application/json" }
          });
        }

        return new Response(
          JSON.stringify({
            conversationId: "relay_conversation_study_plan_live_shape",
            messageId: "relay_message_study_plan_live_shape",
            responseMessageId: "relay_response_study_plan_live_shape",
            taskId: "relay_task_study_plan_live_shape",
            responseContent: {
              type: "json",
              schema: "StudyPlanGenerationCandidate",
              value: {
                assumptions: ["Use short retrieval at the start of each session."],
                decisions: ["Sequence the week around coastal processes first."],
                childTaskSummaries: ["Prepare a focused Coasts study block with retrieval and self-check."],
                content: {
                  artifactSummary: "Merry Penguin will follow a one-week plan focused on Coasts.",
                  schedule: {
                    sessionPlan: [
                      {
                        day: "Monday",
                        minutes: 30,
                        topic: "Coasts",
                        activity: "Review erosion, transport, and deposition.",
                        outcome: "Explain one coastal process clearly."
                      }
                    ]
                  },
                  reviewCheckpoints: [
                    "Midweek check: explain one coastal process without notes."
                  ],
                  studyNotes: [
                    "Keep the coastline diagram nearby during the first session."
                  ]
                }
              }
            }
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }) as typeof fetch
    });

    const studyContext = StudyPlanningContext.fromCommand({
      learnerName: "Merry Penguin",
      yearGroup: "Year 7",
      objective: "Build secure understanding in Coasts.",
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
    });

    const result = await runtime.generateStudyPlan({
      context: studyContext,
      learningLoopId: "loop_study_plan_live_shape"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.artifactContent).toMatchObject({
      summary: "Merry Penguin will follow a one-week plan focused on Coasts.",
      sessions: [
        expect.objectContaining({
          day: "Monday",
          topic: "Coasts",
          minutes: 30
        })
      ],
      checkpoints: ["Midweek check: explain one coastal process without notes."],
      notes: ["Keep the coastline diagram nearby during the first session."]
    });
  });

  it("reconstructs a usable evaluation when Relay omits item arrays but returns a structured object", async () => {
    const server = await createServer({
      agentRuntime: new RelayAgentRuntime({
        binding: createRelayBinding(),
        fetcher: (async (_input, init) => {
          const url =
            typeof _input === "string"
              ? _input
              : _input instanceof URL
                ? _input.toString()
                : _input.url;
          const method = init?.method ?? "GET";
          if (url.includes("/v1/messages/") && url.endsWith("/inspection") && method === "GET") {
            return new Response(
              JSON.stringify({
                artifacts: [{ id: "relay_artifact_test" }],
                resultEvents: [{ artifactId: "relay_artifact_test" }],
                task: {
                  id: "relay_task_inspection"
                }
              }),
              {
                status: 200,
                headers: { "content-type": "application/json" }
              }
            );
          }

          if (!url.endsWith("/v1/messages")) {
            return new Response(JSON.stringify({ error: "not found" }), {
              status: 404,
              headers: { "content-type": "application/json" }
            });
          }

          const body = JSON.parse(String(init?.body ?? "{}")) as {
            content: {
              input?: Record<string, unknown>;
              name?: string;
              text?: string;
              type?: string;
            };
            metadata?: Record<string, unknown>;
          };
          const relayRequest = parseRelayConversationRequest(body.content, body.metadata);

          const result =
            relayRequest.operation === "evaluateAssessmentAttempt"
              ? {
                  score: 0.25
                }
              : buildRelayResult(relayRequest.operation, relayRequest.payload);

          return new Response(
            JSON.stringify({
              conversationId: "relay_conversation_validation",
              messageId: `relay_message_${relayRequest.operation}`,
              responseMessageId: `relay_response_${relayRequest.operation}`,
              taskId: `relay_task_${relayRequest.operation}`,
              responseContent: {
                result
              }
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" }
            }
          );
        }) as typeof fetch
      })
    });

    try {
      const uploadResponse = await server.inject({
        method: "POST",
        url: "/v1/master-data",
        payload: {
          sourceName: "Year 7 Fractions Bank",
          items: [
            {
              topic: "fractions",
              prompt: "Simplify 6/8.",
              canonicalAnswer: "three quarters",
              visibleMaterial: "Fractions can describe equal parts of a whole."
            }
          ]
        }
      });
      expect(uploadResponse.statusCode).toBe(201);

      const assessmentResponse = await server.inject({
        method: "POST",
        url: "/v1/assessments/initial",
        payload: {
          learnerName: "Year 7 learner",
          yearGroup: "Year 7",
          topic: "fractions",
          questionCount: 1
        }
      });
      expect(assessmentResponse.statusCode).toBe(201);

      const attemptResponse = await server.inject({
        method: "POST",
        url: "/v1/assessments/attempts",
        payload: {
          assessmentId: assessmentResponse.json().assessment.id,
          responses: assessmentResponse.json().assessment.items.map((item: { id: string }) => ({
            itemId: item.id,
            answer: "incorrect response"
          }))
        }
      });

      expect(attemptResponse.statusCode).toBe(201);
      expect(attemptResponse.json()).toMatchObject({
        evaluation: {
          score: 0.25,
          itemResults: [
            {
              itemId: assessmentResponse.json().assessment.items[0].id,
              correct: false
            }
          ]
        }
      });
    } finally {
      await server.close();
    }
  });

  it("keeps the loop.study API shape stable when swapping from fixture runtime to RelayAgentRuntime", async () => {
    const fixtureServer = await createServer();
    const relayServer = await createServer({
      agentRuntime: new RelayAgentRuntime({
        binding: createRelayBinding(),
        fetcher: createRelayFetchStub()
      })
    });

    try {
      const fixture = await runLoopFlow(fixtureServer);
      const relay = await runLoopFlow(relayServer);

      expect(Object.keys(relay.assessment).sort()).toEqual(Object.keys(fixture.assessment).sort());
      expect(Object.keys(relay.afterAssessmentResume).sort()).toEqual(
        Object.keys(fixture.afterAssessmentResume).sort()
      );
      expect(Object.keys(relay.attempt).sort()).toEqual(Object.keys(fixture.attempt).sort());
      expect(Object.keys(relay.afterAttemptResume).sort()).toEqual(
        Object.keys(fixture.afterAttemptResume).sort()
      );
      expect(Object.keys(relay.practice).sort()).toEqual(Object.keys(fixture.practice).sort());
      expect(Object.keys(relay.practiceList).sort()).toEqual(Object.keys(fixture.practiceList).sort());
      expect(Object.keys(relay.completion).sort()).toEqual(Object.keys(fixture.completion).sort());
      expect(Object.keys(relay.afterPracticeResume).sort()).toEqual(
        Object.keys(fixture.afterPracticeResume).sort()
      );
      expect(Object.keys(relay.afterCompletionResume).sort()).toEqual(
        Object.keys(fixture.afterCompletionResume).sort()
      );
      expect(Object.keys(relay.studyPlan).sort()).toEqual(Object.keys(fixture.studyPlan).sort());
      expect(Object.keys(relay.afterStudyPlanResume).sort()).toEqual(
        Object.keys(fixture.afterStudyPlanResume).sort()
      );

      expect(relay.assessment).toMatchObject({
        learningLoopId: expect.any(String),
        phase: expect.any(String),
        nextAction: expect.objectContaining({
          kind: expect.any(String),
          summary: expect.any(String)
        })
      });
      expect(relay.attempt).toMatchObject({
        learningLoopId: expect.any(String),
        phase: expect.any(String),
        nextAction: expect.objectContaining({
          kind: expect.any(String)
        })
      });
      expect(relay.practice).toMatchObject({
        learningLoopId: expect.any(String),
        phase: expect.any(String),
        nextAction: expect.objectContaining({
          kind: expect.any(String)
        })
      });
      expect(relay.practiceList).toMatchObject({
        learningLoopId: expect.any(String),
        phase: expect.any(String),
        nextAction: expect.objectContaining({
          kind: expect.any(String)
        })
      });
      expect(relay.completion).toMatchObject({
        learningLoopId: expect.any(String),
        phase: expect.any(String),
        nextAction: expect.objectContaining({
          kind: expect.any(String)
        })
      });
      expect(relay.studyPlan).toMatchObject({
        learningLoopId: expect.any(String),
        phase: expect.any(String),
        nextAction: expect.objectContaining({
          kind: expect.any(String)
        })
      });
      expect(deriveGoldenPathStep(relay.afterAssessmentResume)).toBe("take-assessment");
      expect(deriveGoldenPathStep(relay.afterAttemptResume)).toBe("start-loop");
      expect(deriveGoldenPathStep(relay.afterStudyPlanResume)).toBe("generate-practice");
      expect(deriveGoldenPathStep(relay.afterPracticeResume)).toBe("complete-review");
      expect(deriveGoldenPathStep(relay.afterCompletionResume)).toBe("start-loop");
    } finally {
      await fixtureServer.close();
      await relayServer.close();
    }
  });

  it("stores Relay ids only as internal runtime trace metadata", async () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const runtime = new RelayAgentRuntime({
      binding: createRelayBinding(),
      fetcher: createRelayFetchStub()
    });
    const uploadController = new MasterDataUploadController(repository);
    const assessmentController = new InitialAssessmentController(repository, undefined, undefined, runtime);
    const attemptController = new AssessmentAttemptController(repository, runtime);
    const practiceController = new PracticeActivityController(repository, undefined, undefined, runtime);
    const studyPlanController = new StudyPlanController(repository, undefined, undefined, runtime);

    uploadController.execute({
      sourceName: "Year 7 Fractions Bank",
      items: [
        {
          topic: "fractions",
          prompt: "Simplify 6/8.",
          canonicalAnswer: "three quarters",
          visibleMaterial: "Fractions can describe equal parts of a whole."
        }
      ]
    });

    const assessment = await assessmentController.execute({
      learnerName: "Year 7 learner",
      yearGroup: "Year 7",
      topic: "fractions",
      questionCount: 1
    });
    expect(assessment.ok).toBe(true);
    if (!assessment.ok) {
      return;
    }

    const attempt = await attemptController.execute({
      assessmentId: assessment.value.assessment.id,
      responses: assessment.value.assessment.items.map((item) => ({
        itemId: item.id,
        answer: "incorrect response"
      }))
    });
    expect(attempt.ok).toBe(true);
    if (!attempt.ok) {
      return;
    }

    const practice = await practiceController.generate({
      learningLoopId: assessment.value.learningLoop.id,
      kind: "flashcard_set",
      cardCount: 1
    });
    expect(practice.ok).toBe(true);
    if (!practice.ok) {
      return;
    }

    const studyPlan = await studyPlanController.execute({
      learnerName: "Year 7 learner",
      yearGroup: "Year 7",
      objective: "Build a weekly plan.",
      focusTopics: ["fractions"],
      availableMinutesByDay: {
        Monday: 30,
        Tuesday: 30,
        Wednesday: 30,
        Thursday: 30,
        Friday: 30,
        Saturday: 60,
        Sunday: 0
      }
    });
    expect(studyPlan.ok).toBe(true);
    if (!studyPlan.ok) {
      return;
    }

    const record = repository.findRecordByLearningLoopId(assessment.value.learningLoop.id as never);
    expect(record?.record.runtimeTraces).toHaveLength(5);
    expect(record?.record.runtimeConversationBindings).toHaveLength(1);
    expect(record?.record.runtimeTraces.map((trace) => trace.toSnapshot())).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          execution: expect.objectContaining({
            provider: "relay",
            status: "succeeded"
          }),
          relayTask: expect.objectContaining({
            relayConversationId: expect.stringContaining("relay_conversation_"),
            relayMessageId: expect.stringContaining("relay_message_"),
            relayResponseMessageId: expect.stringContaining("relay_response_"),
            relayTaskId: expect.stringContaining("relay_task_")
          })
        })
      ])
    );

    const learnerFacingPayload = JSON.stringify({
      assessment: assessment.value,
      attempt: attempt.value,
      practice: practice.value,
      studyPlan: studyPlan.value
    });
    expect(learnerFacingPayload).not.toContain("relay_task_");
    expect(learnerFacingPayload).not.toContain("relay_conversation_");
    expect(learnerFacingPayload).not.toContain("relay_workplan_");
    expect(learnerFacingPayload).not.toContain("workspace_study_advisor");
  });

  it("reconstructs resume from loop.study projection without reading Relay directly", async () => {
    let relayMessageCalls = 0;
    const baseFetch = createRelayFetchStub();
    const server = await createServer({
      agentRuntime: new RelayAgentRuntime({
        binding: createRelayBinding(),
        fetcher: (async (_input, init) => {
          const url =
            typeof _input === "string"
              ? _input
              : _input instanceof URL
                ? _input.toString()
                : _input.url;
          const method = init?.method ?? "GET";
          if (url.includes("/v1/messages/") && url.endsWith("/inspection") && method === "GET") {
            return new Response(
              JSON.stringify({
                artifacts: [{ id: "relay_artifact_resume" }],
                resultEvents: [{ artifactId: "relay_artifact_resume" }],
                task: {
                  id: "relay_task_resume"
                }
              }),
              {
                status: 200,
                headers: { "content-type": "application/json" }
              }
            );
          }
          if (url.endsWith("/v1/messages") && method === "POST") {
            relayMessageCalls += 1;
          }

          return baseFetch(_input, init);
        }) as typeof fetch
      })
    });

    try {
      const uploadResponse = await server.inject({
        method: "POST",
        url: "/v1/master-data",
        payload: {
          sourceName: "Year 7 Fractions Bank",
          items: [
            {
              topic: "fractions",
              prompt: "Simplify 6/8.",
              canonicalAnswer: "three quarters",
              visibleMaterial: "Fractions can describe equal parts of a whole."
            }
          ]
        }
      });
      expect(uploadResponse.statusCode).toBe(201);

      const assessmentResponse = await server.inject({
        method: "POST",
        url: "/v1/assessments/initial",
        payload: {
          learnerName: "Year 7 learner",
          yearGroup: "Year 7",
          topic: "fractions",
          questionCount: 1
        }
      });
      expect(assessmentResponse.statusCode).toBe(201);
      expect(relayMessageCalls).toBe(2);

      const loopId = assessmentResponse.json().learningLoop.id as string;
      const resumeResponse = await server.inject({
        method: "GET",
        url: `/v1/learning-loops/${loopId}`
      });
      expect(resumeResponse.statusCode).toBe(200);
      expect(relayMessageCalls).toBe(2);
    } finally {
      await server.close();
    }
  });

  it("returns a learner-safe error and preserves loop state when runtime generation fails", async () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const runtime = new RelayAgentRuntime({
      binding: createRelayBinding(),
      fetcher: (async () =>
        new Response(JSON.stringify({ error: "boom" }), {
          status: 500,
          headers: { "content-type": "application/json" }
        })) as typeof fetch
    });
    const uploadController = new MasterDataUploadController(repository);
    const fixtureAssessmentController = new InitialAssessmentController(repository);
    const fixtureAttemptController = new AssessmentAttemptController(repository);
    const practiceController = new PracticeActivityController(repository, undefined, undefined, runtime);

    uploadController.execute({
      sourceName: "Year 7 Fractions Bank",
      items: [
        {
          topic: "fractions",
          prompt: "Simplify 6/8.",
          canonicalAnswer: "three quarters",
          visibleMaterial: "Fractions can describe equal parts of a whole."
        }
      ]
    });

    const assessment = await fixtureAssessmentController.execute({
      learnerName: "Year 7 learner",
      yearGroup: "Year 7",
      topic: "fractions",
      questionCount: 1
    });
    expect(assessment.ok).toBe(true);
    if (!assessment.ok) {
      return;
    }

    const attempt = await fixtureAttemptController.execute({
      assessmentId: assessment.value.assessment.id,
      responses: assessment.value.assessment.items.map((item) => ({
        itemId: item.id,
        answer: "incorrect response"
      }))
    });
    expect(attempt.ok).toBe(true);
    if (!attempt.ok) {
      return;
    }

    const before = repository.findRecordByLearningLoopId(assessment.value.learningLoop.id as never);
    const beforePracticeCount = before?.record.practiceActivities.length ?? 0;
    const beforeTraceCount = before?.record.runtimeTraces.length ?? 0;

    const result = await practiceController.generate({
      learningLoopId: assessment.value.learningLoop.id,
      kind: "flashcard_set",
      cardCount: 1
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("STATE_CONFLICT");
    expect(result.error.message).toContain(
      "The practice service could not generate an activity right now."
    );
    expect(result.error.message).toContain("Upstream request failed with status 500.");
    expect(result.error.message).toContain("boom");
    expect(result.error.message).not.toContain("/v1/tasks");

    const after = repository.findRecordByLearningLoopId(assessment.value.learningLoop.id as never);
    expect(after?.record.practiceActivities.length).toBe(beforePracticeCount);
    expect(after?.record.runtimeTraces.length).toBe(beforeTraceCount);
    expect(after?.record.learningLoops[0]?.toSnapshot().practiceActivityIds).toHaveLength(0);
  });
});
