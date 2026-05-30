import { err, ok, type Result } from "../../domain/primitives/result.js";
import type {
  ActiveReviewEvaluationCandidate,
  AgentRuntime,
  AssessmentAttemptEvaluationCandidate,
  InitialAssessmentGenerationCandidate,
  PracticeActivityGenerationCandidate,
  StudyPlanGenerationCandidate
} from "./AgentRuntime.js";
import type {
  InitialAssessmentContext,
  PracticeActivityContext,
  StudyPlanningContext
} from "../../domain/primitives/Context.js";
import type {
  MasterDataItem,
  MasterDataSource
} from "../../domain/learning/MasterData.js";
import type { AssessmentItem } from "../../domain/learning/Assessment.js";
import type {
  PracticeItem,
  PracticeItemResponse
} from "../../domain/learning/PracticeActivity.js";
import type { LoopStudyRelayCapability } from "./LoopStudyRelayRuntimeProfile.js";
import type { RuntimeTraceSeed } from "./RuntimeTrace.js";
import { RelayWorkspaceBinding } from "./RelayWorkspaceBinding.js";
import { LoopStudyRelayConversationAdapter } from "./LoopStudyRelayConversationAdapter.js";
import type { RuntimeConversationBinding } from "./RuntimeConversationBinding.js";

interface RelayStructuredResult<TValue> {
  result: TValue;
}

interface RelayRequestOptions {
  binding: RelayWorkspaceBinding;
  createdBy?: string;
  fetcher?: typeof fetch;
}

export class RelayAgentRuntime implements AgentRuntime {
  private readonly adapter: LoopStudyRelayConversationAdapter;

  constructor(private readonly options: RelayRequestOptions) {
    this.adapter = new LoopStudyRelayConversationAdapter({
      binding: options.binding,
      createdBy: options.createdBy,
      fetcher: options.fetcher
    });
  }

  describeBinding(): {
    controllerId?: string;
    defaultAgentHandle: string;
    workspaceId: string;
  } {
    return {
      workspaceId: this.options.binding.workspaceId,
      defaultAgentHandle: this.options.binding.defaultAgentHandle,
      controllerId: this.options.binding.controllerId
    };
  }

  evaluateActiveReviewSession(input: {
    learningLoopId: string;
    practiceItems: readonly PracticeItem[];
    responses: readonly PracticeItemResponse[];
    runtimeConversationBinding?: RuntimeConversationBinding;
  }): Promise<Result<ActiveReviewEvaluationCandidate>> {
    return this.runStructuredConversation<ActiveReviewEvaluationCandidate>({
      failureMessage:
        "The review service could not evaluate this practice evidence right now.",
      capability: "evaluateActiveReviewSession",
      expectedOutputSchema: "ActiveReviewEvaluationCandidate",
      operation: "evaluateActiveReviewSession",
      learningLoopId: input.learningLoopId,
      runtimeConversationBinding: input.runtimeConversationBinding,
      payload: {
        practiceItems: input.practiceItems,
        responses: input.responses
      }
    });
  }

  evaluateAssessmentAttempt(input: {
    assessment: {
      items: readonly AssessmentItem[];
      topic: string;
    };
    contextTopic: string;
    learningLoopId: string;
    responses: readonly {
      answer: string;
      itemId: string;
    }[];
    runtimeConversationBinding?: RuntimeConversationBinding;
  }): Promise<Result<AssessmentAttemptEvaluationCandidate>> {
    return this.runStructuredConversation<AssessmentAttemptEvaluationCandidate>({
      failureMessage:
        "The assessment service could not evaluate this attempt right now.",
      capability: "evaluateAssessmentAttempt",
      expectedOutputSchema: "AssessmentAttemptEvaluationCandidate",
      operation: "evaluateAssessmentAttempt",
      learningLoopId: input.learningLoopId,
      runtimeConversationBinding: input.runtimeConversationBinding,
      payload: {
        assessment: input.assessment,
        contextTopic: input.contextTopic,
        responses: input.responses
      }
    });
  }

  generateInitialAssessment(input: {
    context: InitialAssessmentContext;
    learningLoopId: string;
    source: MasterDataSource;
    sourceItems: readonly MasterDataItem[];
    runtimeConversationBinding?: RuntimeConversationBinding;
  }): Promise<Result<InitialAssessmentGenerationCandidate>> {
    return this.runStructuredConversation<InitialAssessmentGenerationCandidate>({
      failureMessage:
        "The assessment service could not generate a diagnostic right now.",
      capability: "generateInitialAssessment",
      expectedOutputSchema: "InitialAssessmentGenerationCandidate",
      operation: "generateInitialAssessment",
      learningLoopId: input.learningLoopId,
      runtimeConversationBinding: input.runtimeConversationBinding,
      payload: {
        context: input.context.toSnapshot(),
        source: input.source.toSnapshot(),
        sourceItems: input.sourceItems.map((item) => item.toRuntimePayload())
      }
    });
  }

  generatePracticeActivity(input: {
    context: PracticeActivityContext;
    learningLoopId: string;
    selections: readonly {
      gap: {
        description: string;
        id: string;
      };
      item: MasterDataItem;
    }[];
    runtimeConversationBinding?: RuntimeConversationBinding;
  }): Promise<Result<PracticeActivityGenerationCandidate>> {
    return this.runStructuredConversation<PracticeActivityGenerationCandidate>({
      failureMessage:
        "The practice service could not generate an activity right now.",
      capability: "generatePracticeActivity",
      expectedOutputSchema: "PracticeActivityGenerationCandidate",
      operation: "generatePracticeActivity",
      learningLoopId: input.learningLoopId,
      runtimeConversationBinding: input.runtimeConversationBinding,
      payload: {
        context: input.context.toSnapshot(),
        selections: input.selections.map((selection) => ({
          gap: selection.gap,
          item: selection.item.toRuntimePayload()
        }))
      }
    });
  }

  generateStudyPlan(input: {
    context: StudyPlanningContext;
    learningLoopId: string;
    runtimeConversationBinding?: RuntimeConversationBinding;
  }): Promise<Result<StudyPlanGenerationCandidate>> {
    return this.runStructuredConversation<StudyPlanGenerationCandidate>({
      failureMessage:
        "The planning service could not generate a study plan right now.",
      capability: "generateStudyPlan",
      expectedOutputSchema: "StudyPlanGenerationCandidate",
      operation: "generateStudyPlan",
      learningLoopId: input.learningLoopId,
      runtimeConversationBinding: input.runtimeConversationBinding,
      payload: {
        context: input.context.toSnapshot()
      }
    });
  }

  private async runStructuredConversation<
    TValue extends {
      runtimeConversationBinding?: RuntimeConversationBinding;
      runtimeTrace?: RuntimeTraceSeed;
    }
  >(input: {
    capability: LoopStudyRelayCapability;
    expectedOutputSchema: string;
    failureMessage: string;
    learningLoopId: string;
    operation: string;
    payload: unknown;
    runtimeConversationBinding?: RuntimeConversationBinding;
  }): Promise<Result<TValue>> {
    const stage = stageForOperation(input.operation);
    const idempotencyKey = createRelayIdempotencyKey({
      learningLoopId: input.learningLoopId,
      operation: input.operation,
      payload: input.payload
    });
    const relayTurn = await this.adapter.sendStructuredTurn({
      capability: input.capability,
      expectedOutputSchema: input.expectedOutputSchema,
      idempotencyKey,
      learningLoopId: input.learningLoopId as never,
      messageText: buildConversationMessage({
        operation: input.operation,
        payload: input.payload,
        expectedOutputSchema: input.expectedOutputSchema,
        stage
      }),
      metadata: {
        stage,
        operation: input.operation
      },
      runtimeConversationBinding: input.runtimeConversationBinding
    });
    if (!relayTurn.ok) {
      return this.runtimeFailure(input.failureMessage, relayTurn.error.message);
    }

    const parsed = this.parseStructuredResult<TValue>(relayTurn.value.responseText);
    if (!parsed.ok) {
      return this.runtimeFailure(input.failureMessage, parsed.error.message);
    }

    const runtimeTrace: RuntimeTraceSeed = {
      provider: "relay",
      operation: input.operation as RuntimeTraceSeed["operation"],
      relayTask: {
        relayArtifactIds: relayTurn.value.correlation.relayArtifactIds,
        relayConversationId: relayTurn.value.correlation.relayConversationId,
        relayMessageId: relayTurn.value.correlation.relayMessageId,
        relayResponseMessageId: relayTurn.value.correlation.relayResponseMessageId,
        relayTaskId: relayTurn.value.correlation.relayTaskId,
        relayWorkPlanId: relayTurn.value.correlation.relayWorkPlanId
      },
      runtimeArtifacts: []
    };

    return ok({
      ...parsed.value,
      runtimeConversationBinding: relayTurn.value.binding,
      runtimeTrace
    });
  }

  private runtimeFailure<TValue>(
    failureMessage: string,
    detail: string
  ): Result<TValue> {
    const suffix = detail.trim() ? ` ${detail.trim()}` : "";

    return err({
      code: "STATE_CONFLICT",
      message: `${failureMessage}${suffix}`
    });
  }

  private parseStructuredResult<TValue>(responseText: string): Result<TValue> {
    try {
      const parsed = JSON.parse(responseText) as RelayStructuredResult<TValue>;
      if (!parsed || typeof parsed !== "object" || !("result" in parsed)) {
        return err({
          code: "STATE_CONFLICT",
          message:
            "Relay runtime response did not contain a structured result envelope."
        });
      }

      return ok(parsed.result);
    } catch {
      return err({
        code: "STATE_CONFLICT",
        message: "Relay runtime response was not valid JSON."
      });
    }
  }
}

function buildConversationMessage(input: {
  expectedOutputSchema: string;
  operation: string;
  payload: unknown;
  stage: string;
}): string {
  return [
    `You are supporting loop.study during the ${input.stage} stage.`,
    `Complete the ${input.operation} operation.`,
    `Return valid JSON only using the shape {"result": ${input.expectedOutputSchema}}.`,
    "Use the structured context below and produce the candidate result for loop.study to validate.",
    "Structured context:",
    JSON.stringify(
      {
        operation: input.operation,
        stage: input.stage,
        payload: input.payload
      },
      null,
      2
    )
  ].join("\n\n");
}

function createRelayIdempotencyKey(input: {
  learningLoopId: string;
  operation: string;
  payload: unknown;
}): string {
  const serialized = JSON.stringify(input.payload);
  let hash = 0;

  for (let index = 0; index < serialized.length; index += 1) {
    hash = (hash * 31 + serialized.charCodeAt(index)) >>> 0;
  }

  return `loop-study:${input.learningLoopId}:${input.operation}:${hash.toString(16)}`;
}

function stageForOperation(operation: string): string {
  switch (operation) {
    case "generateInitialAssessment":
    case "evaluateAssessmentAttempt":
      return "diagnosis";
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
