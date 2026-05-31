import { randomUUID } from "node:crypto";
import { loopStudyRelayAllowedCommandNames } from "../../src/modules/runtime/LoopStudyRelayRuntimeProfile.js";

export interface FakeRelayMessageRequest {
  content: {
    expectedOutputSchema?: string;
    input?: Record<string, unknown>;
    inputSchema?: string;
    name?: string;
    previewText?: string;
    text?: string;
    type: string;
  };
  conversationId?: string;
  controllerInput?: unknown;
  createdBy?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
  senderId?: string;
  source?: string;
  to?: string;
  workspaceId: string;
}

export interface FakeRelayMessageRecord extends FakeRelayMessageRequest {
  conversationId: string;
  id: string;
  responseMessageId: string;
  taskId: string;
  workPlanId?: string;
}

export interface FakeRelayTaskRecord {
  id: string;
  kind: "agent_task" | "controller_task";
  metadata?: Record<string, unknown>;
  to?: string;
  workspaceId: string;
}

export interface FakeRelayMessageInspection {
  artifacts: readonly {
    id: string;
  }[];
  conversation: {
    id: string;
  };
  events: readonly {
    data: Record<string, unknown>;
    type: string;
  }[];
  message: {
    content?: Record<string, unknown>;
    id: string;
    metadata?: Record<string, unknown>;
    to?: string;
  };
  responseContent?: unknown;
  responseText: string;
  resultEvents: readonly {
    artifactId: string;
    type: string;
  }[];
  task: {
    id: string;
    kind: "agent_task" | "controller_task";
    metadata?: Record<string, unknown>;
    workPlanId?: string;
  };
}

export interface FakeRelayResponseShape {
  artifactIds?: readonly string[];
  responseContent?: unknown;
  responseText?: string;
  result: unknown;
  workPlanId?: string;
}

export interface FakeRelayResolverInput {
  content: FakeRelayMessageRequest["content"];
  operation?: string;
  packet: Record<string, unknown>;
  request: FakeRelayMessageRecord;
}

export interface FakeRelayHttpServerOptions {
  commandExecutionPolicy?: {
    allowDirectCommandExecution?: boolean;
    allowedCommandNames?: readonly string[];
    registeredCommandNames?: readonly string[];
  };
  resolver?: (input: FakeRelayResolverInput) => FakeRelayResponseShape;
}

export function parseLoopStudyStructuredMessage(
  text: string
): { operation?: string; packet: Record<string, unknown> } {
  const marker = "Structured context:\n";
  const index = text.indexOf(marker);
  const payloadText = index >= 0 ? text.slice(index + marker.length) : "{}";
  const packet = JSON.parse(payloadText) as Record<string, unknown>;

  return {
    operation:
      typeof packet.operation === "string" ? packet.operation : undefined,
    packet
  };
}

export function parseLoopStudyCommandContent(content: FakeRelayMessageRequest["content"]): {
  operation?: string;
  packet: Record<string, unknown>;
};
export function parseLoopStudyCommandContent(
  content: FakeRelayMessageRequest["content"],
  metadata: Record<string, unknown> | undefined
): {
  operation?: string;
  packet: Record<string, unknown>;
};
export function parseLoopStudyCommandContent(
  content: FakeRelayMessageRequest["content"],
  metadata?: Record<string, unknown>
): {
  operation?: string;
  packet: Record<string, unknown>;
} {
  if (content.type === "command") {
    const operation =
      relayOperationFromCommandName(content.name) ??
      metadataOperation(metadata) ??
      operationFromCandidateKind(content.input);
    return {
      operation,
      packet: {
        operation,
        payload: content.input ?? {}
      }
    };
  }

  if (content.type === "json") {
    const payload = (content.input ?? {}) as Record<string, unknown>;
    const operation =
      typeof payload.operation === "string"
        ? payload.operation
        : metadataOperation(metadata) ?? operationFromCandidateKind(payload);
    return {
      operation,
      packet: payload
    };
  }

  return parseLoopStudyStructuredMessage(content.text ?? "");
}

export function buildLoopStudyRelayResult(
  operation: string | undefined,
  packet: Record<string, unknown>
): unknown {
  const payload = (packet.payload ?? {}) as Record<string, any>;

  if (operation === "interpretMasterData") {
    const content = String(payload.rawSourceContent ?? "");
    const normalizedContent = content.toLowerCase();
    const topic =
      String(payload.userHints?.topic ?? "").trim() ||
      (normalizedContent.includes("coasts") ? "Coasts" : "Study");
    const subject =
      String(payload.userHints?.subject ?? "").trim() ||
      (normalizedContent.includes("geography") || normalizedContent.includes("coasts")
        ? "Geography"
        : "History");
    const yearGroup = String(payload.learnerYearGroup ?? "Year 7").trim() || "Year 7";
    const sourceMap = [
      {
        sourceRef: `${topic} > Formation > fact-1`,
        excerpt: "Waves erode cliffs and transport sediment along the coastline."
      },
      {
        sourceRef: `${topic} > Management > fact-1`,
        excerpt: "Hard engineering includes sea walls and groynes."
      },
      {
        sourceRef: `${topic} > Processes > cause-1`,
        excerpt: "Constructive waves deposit material and help build beaches."
      }
    ];

    return {
      interpretation: {
        schema: "MasterDataInterpretationCandidate.v1",
        documentTitle: String(payload.sourceName ?? `${yearGroup} ${subject} ${topic}`),
        detectedSubject: subject,
        detectedYearGroup: yearGroup,
        mainTopic: topic,
        subtopics: ["Formation", "Management"],
        keyPeople: [],
        keyTerms: ["erosion", "hard engineering"],
        importantDates: [],
        processes: ["cause", "event", "consequence"],
        learnerFacingMaterialSummary: `${topic} explains how erosion shapes coastlines and how management strategies such as hard engineering respond to those changes.`,
        learningObjectives: [
          {
            id: "objective_1",
            objective: `Explain how ${topic.toLowerCase()} are shaped by erosion and transport.`,
            sourceRefs: [sourceMap[0]?.sourceRef ?? ""]
          },
          {
            id: "objective_2",
            objective: `Compare hard engineering strategies in the Management section of ${topic.toLowerCase()}.`,
            sourceRefs: [sourceMap[1]?.sourceRef ?? ""]
          }
        ],
        sourceMap,
        items: [
          {
            subject,
            yearGroup,
            topic,
            subtopic: "Formation",
            itemType: "fact",
            content: sourceMap[0]?.excerpt ?? "",
            sourceRef: sourceMap[0]?.sourceRef ?? ""
          },
          {
            subject,
            yearGroup,
            topic,
            subtopic: "Management",
            itemType: "key_term",
            term: "hard engineering",
            definition: "Building structures such as sea walls and groynes to control erosion.",
            content: "Building structures such as sea walls and groynes to control erosion.",
            sourceRef: sourceMap[1]?.sourceRef ?? ""
          },
          {
            subject,
            yearGroup,
            topic,
            subtopic: "Processes",
            itemType: "cause",
            content: sourceMap[2]?.excerpt ?? "",
            sourceRef: sourceMap[2]?.sourceRef ?? ""
          }
        ]
      }
    };
  }

  if (operation === "generateInitialAssessment") {
    const sourceEvidence = Array.isArray(payload.relevantSourceExcerpts)
      ? payload.relevantSourceExcerpts
      : [];
    const questionCount = Number(payload.context?.questionCount ?? sourceEvidence.length);
    const items = sourceEvidence.slice(0, questionCount).map((item: any, index: number) => ({
      id: `assessment_item_${index + 1}`,
      topic: payload.topic ?? payload.materialInterpretation?.mainTopic ?? item.topic ?? "study",
      prompt: buildEvidencePrompt(item),
      canonicalAnswer: item.content ?? item.excerpt,
      visibleMaterial: `Source ref: ${item.sourceRef} · ${item.topic ?? payload.topic ?? "study"} · recall from notes`,
      difficulty: index < 2 ? "easy" : index < 4 ? "medium" : "stretch",
      sourceMasterDataItemId: item.sourceRef ?? `source_${index + 1}`
    }));

    return {
      items,
      artifactContent: {
        topic: payload.context?.topic ?? payload.topic ?? "study",
        questionCount,
        instructions: `Complete all ${questionCount} questions without notes.`,
        items: items.map((item: any) => ({
          id: item.id,
          prompt: item.prompt,
          difficulty: item.difficulty
        }))
      }
    };
  }

  if (operation === "evaluateAssessmentAttempt") {
    const assessmentItems = Array.isArray(payload.assessment?.items)
      ? payload.assessment.items
      : [];
    const responses = new Map(
      (Array.isArray(payload.responses) ? payload.responses : []).map((response: any) => [
        response.itemId,
        response.answer
      ])
    );
    const itemResults = assessmentItems.map((item: any) => {
      const answer = String(responses.get(item.id) ?? "");
      const correct =
        normalize(answer) === normalize(String(item.canonicalAnswer ?? ""));

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
        : itemResults.filter((result: any) => result.correct).length /
          itemResults.length;

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

  if (operation === "generateStudyPlan") {
    const focusTopics = Array.isArray(payload.context?.focusTopics)
      ? payload.context.focusTopics
      : [payload.topic ?? "study"];
    const schedule = Array.isArray(payload.context?.schedule)
      ? payload.context.schedule
      : [];
    const activeDays = schedule.filter((entry: any) => entry.minutes > 0);
    const fallbackTopic = focusTopics[0] ?? "study";

    return {
      assumptions: [
        {
          id: "assumption_spaced_repetition",
          statement:
            "Repeated topics across the week are allowed to reinforce retention."
        }
      ],
      decisions: [
        "Allocated one primary topic to each active study day."
      ],
      childTaskSummaries: focusTopics.map(
        (topic: string) =>
          `Prepare a focused ${topic} study block with retrieval and self-check.`
      ),
      artifactContent: {
        summary: `${payload.context?.learnerName ?? "Learner"} will follow a one-week plan focused on ${focusTopics.join(", ")}.`,
        sessions: activeDays.map((entry: any, index: number) => ({
          day: entry.day,
          minutes: entry.minutes,
          topic: focusTopics[index % focusTopics.length] ?? fallbackTopic,
          activity: `Recap key ideas in ${focusTopics[index % focusTopics.length] ?? fallbackTopic}, complete one focused practice set, then self-check.`,
          outcome: `Leave the session with one verified success criterion for ${focusTopics[index % focusTopics.length] ?? fallbackTopic}.`
        })),
        checkpoints: [`Midweek check: explain one idea from ${fallbackTopic} without notes.`],
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
    const mainTopic = String(interpretation.mainTopic ?? payload.topic ?? "study");

    return {
      schema: "LearningLoopBatchCandidate.v1",
      overview: `Work through short ${mainTopic.toLowerCase()} loops before moving on.`,
      targetDurationMinutes,
      units: diagnosedGaps.slice(0, desiredLoopCount).map((gap: any, index: number) => ({
        focus: String(gap.topic ?? mainTopic),
        reason: `This loop was chosen because ${String(gap.description ?? "it was the least secure idea in the check-up").toLowerCase()}.`,
        objectiveRefs: objectiveRefs.slice(0, 1),
        sourceRefs: sourceRefs.slice(0, 2),
        targetKnowledgeGapIds: [String(gap.id ?? `gap_${index + 1}`)],
        shortExplanation:
          String(interpretation.learnerFacingMaterialSummary ?? "") ||
          `Revisit the key idea in ${mainTopic}.`,
        learnerTask: `Spend ${targetDurationMinutes} minutes explaining ${String(gap.topic ?? mainTopic)} in your own words, then write one remembered example.`,
        quickCheckQuestions: [
          {
            prompt: `How would you explain ${String(gap.topic ?? mainTopic)} without looking back at the notes?`
          }
        ],
        reviewItems: sourceRefs.length
          ? [
              {
                prompt: `What should you remember about ${String(gap.topic ?? mainTopic)}?`,
                answer:
                  String(interpretation.learnerFacingMaterialSummary ?? "") ||
                  `Be able to explain ${String(gap.topic ?? mainTopic)} accurately from memory.`
              }
            ]
          : [],
        state: index === 0 ? "ready" : "locked"
      }))
    };
  }

  if (operation === "generatePracticeActivity") {
    const sourceItems = Array.isArray(payload.selectedSourceItems)
      ? payload.selectedSourceItems
      : Array.isArray(payload.selections)
        ? payload.selections.map((selection: any) => selection.item)
        : [];
    const learningObjectives = Array.isArray(payload.learningObjectives)
      ? payload.learningObjectives
      : Array.isArray(payload.selections)
        ? payload.selections.map((selection: any) => selection.gap?.description ?? "")
        : [];

    return {
      flashcardSet: {
        instructions: `Review each card, attempt an answer from memory, then flip to check accuracy for ${payload.topic ?? payload.context?.topic}.`,
        cards: sourceItems.map((item: any, index: number) => ({
          id: `flashcard_${index + 1}`,
          front: item.prompt,
          back: item.content ?? item.definition ?? item.canonicalAnswer,
          topic: item.topic,
          knowledgeGapId:
            payload.selections?.[index]?.gap?.id ?? `gap_${index + 1}`,
          learningObjective:
            learningObjectives[index] ?? `Strengthen recall in ${item.topic}.`,
          sourceMasterDataItemId: item.id,
          sourceVisibleSentence: item.content ?? item.visibleMaterial
        }))
      }
    };
  }

  if (operation === "evaluateActiveReviewSession") {
    const responses = Array.isArray(payload.responses) ? payload.responses : [];
    return {
      itemResults: responses.map((response: any) => ({
        practiceItemId: response.practiceItemId,
        confidence: response.confidence,
        correct: true,
        overconfidence: false,
        feedback: "Secure retrieval shown in review evidence."
      }))
    };
  }

  return {
    noop: true
  };
}

export class FakeRelayHttpServer {
  readonly inspections = new Map<string, FakeRelayMessageInspection>();
  readonly messages: FakeRelayMessageRecord[] = [];
  readonly tasks: FakeRelayTaskRecord[] = [];

  constructor(private readonly options: FakeRelayHttpServerOptions = {}) {}

  fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const method = init?.method ?? "GET";

    if (method === "POST" && url.endsWith("/v1/messages")) {
      return this.handlePostMessage(init);
    }

    const inspectionMatch = url.match(/\/v1\/messages\/([^/]+)\/inspection$/);
    if (method === "GET" && inspectionMatch?.[1]) {
      return this.handleInspection(inspectionMatch[1]);
    }

    return jsonResponse({ error: "not_found" }, 404);
  }) as typeof fetch;

  private async handlePostMessage(init?: RequestInit): Promise<Response> {
    const body = JSON.parse(String(init?.body ?? "{}")) as FakeRelayMessageRequest;
    const to = body.to?.trim();
    const conversationId =
      body.conversationId ?? `relay_conversation_${randomUUID()}`;
    const messageId = `relay_message_${randomUUID()}`;
    const responseMessageId = `relay_response_message_${randomUUID()}`;
    const taskId = `relay_task_${randomUUID()}`;
    const parsed = parseLoopStudyCommandContent(body.content, body.metadata);
    const explicitSupervisorPath =
      normalizeRecipient(to) === "@supervisor" ||
      normalizeRecipient(String(body.metadata?.controllerId ?? "")) ===
        "@supervisor";
    const normalizedRecipient = normalizeRecipient(to);
    const isCommand = body.content.type === "command";
    const directCommandPolicy = {
      allowDirectCommandExecution:
        this.options.commandExecutionPolicy?.allowDirectCommandExecution ?? true,
      registeredCommandNames: new Set(
        this.options.commandExecutionPolicy?.registeredCommandNames ??
          loopStudyRelayAllowedCommandNames
      ),
      allowedCommandNames: new Set(
        this.options.commandExecutionPolicy?.allowedCommandNames ??
          loopStudyRelayAllowedCommandNames
      )
    };

    if (
      explicitSupervisorPath &&
      body.metadata?.controllerId &&
      body.controllerInput === undefined
    ) {
      return jsonResponse(
        {
          error: "invalid_request",
          message: `Controller ${String(body.metadata.controllerId)} requires controllerInput.`
        },
        400
      );
    }

    if (isCommand) {
      const commandName = String(body.content.name ?? "");
      if (!directCommandPolicy.registeredCommandNames.has(commandName)) {
        return jsonResponse(
          {
            schema: "RelayCommandError.v1",
            error: "command_not_registered",
            code: "COMMAND_NOT_REGISTERED",
            message: `Direct command ${commandName || "<unknown>"} is not registered for runtime execution.`
          },
          404
        );
      }

      if (
        !directCommandPolicy.allowDirectCommandExecution ||
        !directCommandPolicy.allowedCommandNames.has(commandName)
      ) {
        return jsonResponse(
          {
            schema: "RelayCommandError.v1",
            error: "command_not_allowed",
            code: "COMMAND_NOT_ALLOWED",
            message: `Direct command ${commandName || "<unknown>"} is not allowed in workspace ${body.workspaceId}.`
          },
          403
        );
      }

      if (!normalizedRecipient || normalizedRecipient === "@supervisor") {
        return jsonResponse(
          {
            schema: "RelayCommandError.v1",
            error: "no_capable_route",
            code: "NO_CAPABLE_ROUTE",
            message: `No capable direct route was available for command ${commandName || "<unknown>"}.`
          },
          422
        );
      }
    }

    const request: FakeRelayMessageRecord = {
      ...body,
      conversationId,
      id: messageId,
      responseMessageId,
      taskId
    };
    this.messages.push(request);

    const taskKind = isCommand
      ? "agent_task"
      : normalizedRecipient === "@tutor"
        ? "controller_task"
        : "controller_task";
    const responseShape =
      this.options.resolver?.({
        content: body.content,
        operation: parsed.operation,
        packet: parsed.packet,
        request
      }) ?? {
        result: buildLoopStudyRelayResult(parsed.operation, parsed.packet)
      };
    const workPlanId =
      responseShape.workPlanId ??
      (parsed.operation === "generateStudyPlan"
        ? `relay_workplan_${randomUUID()}`
        : undefined);
    const task: FakeRelayTaskRecord = {
      id: taskId,
      kind: taskKind,
      metadata: body.metadata,
      to,
      workspaceId: body.workspaceId
    };
    this.tasks.push(task);

    const artifactIds =
      responseShape.artifactIds ?? [`relay_artifact_${randomUUID()}`];
    const responseText =
      responseShape.responseText ??
      JSON.stringify({
        result: responseShape.result
      });
    const responseContent =
      responseShape.responseContent ?? { result: responseShape.result };
    this.inspections.set(messageId, {
      artifacts: artifactIds.map((id) => ({ id })),
      conversation: {
        id: conversationId
      },
      events: [
        {
          type: "message.received",
          data: {
            messageId,
            conversationId,
            metadata: body.metadata ?? {}
          }
        },
        ...(isCommand
          ? [
              {
                type: "command.executed_directly",
                data: {
                  commandName: body.content.name,
                  recipient: normalizedRecipient,
                  conversationId,
                  messageId
                }
              }
            ]
          : [
              {
                type: "work_requirement.inferred",
                data: {
                  conversationId,
                  messageId,
                  workRequirement: {
                    recipient: normalizedRecipient,
                    strategy: "supervisor_inference"
                  }
                }
              },
              {
                type: "supervisor.decision_made",
                data: {
                  conversationId,
                  messageId,
                  decision: {
                    routedTo: normalizedRecipient,
                    action: "delegate"
                  }
                }
              }
            ]),
        {
          type: "task.created",
          data: {
            taskId,
            kind: taskKind,
            conversationId
          }
        }
      ],
      message: {
        content: body.content,
        id: messageId,
        metadata: body.metadata,
        to
      },
      responseContent,
      responseText,
      resultEvents: artifactIds.map((artifactId) => ({
        artifactId,
        type: "result.produced"
      })),
      task: {
        id: taskId,
        kind: taskKind,
        metadata: body.metadata,
        workPlanId
      }
    });

    return jsonResponse(
      {
        conversationId,
        messageId,
        responseContent,
        responseMessageId,
        taskId,
        workPlanId
      },
      202
    );
  }

  private handleInspection(messageId: string): Response {
    const inspection = this.inspections.get(messageId);
    if (!inspection) {
      return jsonResponse({ error: "not_found" }, 404);
    }

    return jsonResponse(inspection, 200);
  }
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRecipient(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return value.startsWith("@") ? value : `@${value}`;
}

function relayOperationFromCommandName(name: string | undefined): string | undefined {
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

function buildEvidencePrompt(item: Record<string, unknown>): string {
  const subtopic = String(item.subtopic ?? item.topic ?? "this topic");
  const sourceRef = String(item.sourceRef ?? "");

  switch (item.itemType) {
    case "key_term":
      return `What does ${String(item.term ?? "this term")} mean? [Source: ${sourceRef}]`;
    case "date":
      return `What happened in ${String(item.date ?? "this date")}? [Source: ${sourceRef}]`;
    case "cause":
      return `What was one cause linked to ${subtopic}? [Source: ${sourceRef}]`;
    case "event":
      return `What happened during ${subtopic}? [Source: ${sourceRef}]`;
    case "consequence":
      return `What was one consequence of ${subtopic}? [Source: ${sourceRef}]`;
    case "legacy":
      return `What was part of ${subtopic}'s legacy? [Source: ${sourceRef}]`;
    case "person":
      return `Who was ${String(item.person ?? "this person")}? [Source: ${sourceRef}]`;
    default:
      return `What should you remember about ${subtopic}? [Source: ${sourceRef}]`;
  }
}
