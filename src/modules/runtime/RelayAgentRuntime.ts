import { err, ok, type Result } from "../../domain/primitives/result.js";
import type {
  ActiveReviewEvaluationCandidate,
  AgentRuntime,
  AssessmentAttemptEvaluationCandidate,
  InitialAssessmentGenerationCandidate,
  PracticeActivityGenerationCandidate,
  StudyPlanGenerationCandidate
} from "./AgentRuntime.js";
import type { InitialAssessmentContext, PracticeActivityContext, StudyPlanningContext } from "../../domain/primitives/Context.js";
import type { MasterDataItem, MasterDataSource } from "../../domain/learning/MasterData.js";
import type { AssessmentItem } from "../../domain/learning/Assessment.js";
import type { PracticeItem, PracticeItemResponse } from "../../domain/learning/PracticeActivity.js";
import type { RuntimeTraceSeed } from "./RuntimeTrace.js";

interface RelayTaskCreateResponse {
  responseText?: string;
  taskId?: string;
  workPlanId?: string;
}

interface RelayTaskInspectionResponse {
  responseText?: string;
  task?: {
    id?: string;
  };
}

interface RelayStructuredResult<TValue> {
  result: TValue;
}

interface RelayRequestOptions {
  baseUrl: string;
  createdBy?: string;
  fetcher?: typeof fetch;
  workspaceId: string;
}

export class RelayAgentRuntime implements AgentRuntime {
  private readonly createdBy: string;
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: RelayRequestOptions) {
    this.createdBy = options.createdBy ?? "loop.study";
    this.fetcher = options.fetcher ?? fetch;
  }

  evaluateActiveReviewSession(input: {
    practiceItems: readonly PracticeItem[];
    responses: readonly PracticeItemResponse[];
  }): Promise<Result<ActiveReviewEvaluationCandidate>> {
    return this.runStructuredTask<ActiveReviewEvaluationCandidate>({
      assignedAgentHandle: "reviewer",
      failureMessage: "The review service could not evaluate this practice evidence right now.",
      operation: "evaluateActiveReviewSession",
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
    responses: readonly {
      answer: string;
      itemId: string;
    }[];
  }): Promise<Result<AssessmentAttemptEvaluationCandidate>> {
    return this.runStructuredTask<AssessmentAttemptEvaluationCandidate>({
      assignedAgentHandle: "reviewer",
      failureMessage: "The assessment service could not evaluate this attempt right now.",
      operation: "evaluateAssessmentAttempt",
      payload: {
        assessment: input.assessment,
        contextTopic: input.contextTopic,
        responses: input.responses
      }
    });
  }

  generateInitialAssessment(input: {
    context: InitialAssessmentContext;
    source: MasterDataSource;
    sourceItems: readonly MasterDataItem[];
  }): Promise<Result<InitialAssessmentGenerationCandidate>> {
    return this.runStructuredTask<InitialAssessmentGenerationCandidate>({
      assignedAgentHandle: "curriculum-mapper",
      failureMessage: "The assessment service could not generate a diagnostic right now.",
      operation: "generateInitialAssessment",
      payload: {
        context: input.context.toSnapshot(),
        source: input.source.toSnapshot(),
        sourceItems: input.sourceItems.map((item) => item.toSnapshot())
      }
    });
  }

  generatePracticeActivity(input: {
    context: PracticeActivityContext;
    selections: readonly {
      gap: {
        description: string;
        id: string;
      };
      item: MasterDataItem;
    }[];
  }): Promise<Result<PracticeActivityGenerationCandidate>> {
    return this.runStructuredTask<PracticeActivityGenerationCandidate>({
      assignedAgentHandle: "tutor",
      failureMessage: "The practice service could not generate an activity right now.",
      operation: "generatePracticeActivity",
      payload: {
        context: input.context.toSnapshot(),
        selections: input.selections.map((selection) => ({
          gap: selection.gap,
          item: selection.item.toSnapshot()
        }))
      }
    });
  }

  generateStudyPlan(input: {
    context: StudyPlanningContext;
  }): Promise<Result<StudyPlanGenerationCandidate>> {
    return this.runStructuredTask<StudyPlanGenerationCandidate>({
      assignedAgentHandle: "study-planner",
      failureMessage: "The planning service could not generate a study plan right now.",
      operation: "generateStudyPlan",
      payload: {
        context: input.context.toSnapshot()
      }
    });
  }

  private async runStructuredTask<TValue extends { runtimeTrace?: RuntimeTraceSeed }>(input: {
    assignedAgentHandle: string;
    failureMessage: string;
    operation: string;
    payload: unknown;
  }): Promise<Result<TValue>> {
    const taskResponse = await this.postJson<RelayTaskCreateResponse>("/v1/tasks", {
      workspaceId: this.options.workspaceId,
      source: "api",
      createdBy: this.createdBy,
      assignedAgentHandle: input.assignedAgentHandle,
      message: [
        "Return valid JSON only.",
        JSON.stringify({
          operation: input.operation,
          payload: input.payload
        })
      ].join("\n"),
      metadata: {
        controllerId: "controller.supervisor_workplan",
        runtimeOperation: input.operation
      }
    });
    if (!taskResponse.ok) {
      return err({
        code: "STATE_CONFLICT",
        message: input.failureMessage
      });
    }

    let responseText = taskResponse.value.responseText;
    if (!responseText) {
      const inspection = await this.fetchInspectionResponse(taskResponse.value.taskId);
      if (!inspection.ok) {
        return err({
          code: "STATE_CONFLICT",
          message: input.failureMessage
        });
      }
      responseText = inspection.value;
    }
    const parsed = this.parseStructuredResult<TValue>(responseText);
    if (!parsed.ok) {
      return err({
        code: "STATE_CONFLICT",
        message: input.failureMessage
      });
    }

    const runtimeTrace: RuntimeTraceSeed = {
      provider: "relay",
      operation: input.operation as RuntimeTraceSeed["operation"],
      relayTask: {
        relayArtifactIds: [],
        relayTaskId: taskResponse.value.taskId,
        relayWorkPlanId: taskResponse.value.workPlanId
      },
      runtimeArtifacts: []
    };

    return ok({
      ...parsed.value,
      runtimeTrace
    });
  }

  private async fetchInspectionResponse(taskId: string | undefined): Promise<Result<string>> {
    if (!taskId) {
      return err({
        code: "STATE_CONFLICT",
        message: "Relay runtime did not return a task id or inline response."
      });
    }

    const inspection = await this.getJson<RelayTaskInspectionResponse>(
      `/v1/tasks/${taskId}/inspection`
    );
    if (!inspection.ok) {
      return inspection;
    }

    if (!inspection.value.responseText) {
      return err({
        code: "STATE_CONFLICT",
        message: `Relay task inspection for ${taskId} did not include responseText.`
      });
    }

    return ok(inspection.value.responseText);
  }

  private parseStructuredResult<TValue>(responseText: string): Result<TValue> {
    try {
      const parsed = JSON.parse(responseText) as RelayStructuredResult<TValue>;
      if (!parsed || typeof parsed !== "object" || !("result" in parsed)) {
        return err({
          code: "STATE_CONFLICT",
          message: "Relay runtime response did not contain a structured result envelope."
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

  private getJson<TValue>(path: string): Promise<Result<TValue>> {
    return this.requestJson<TValue>(path, {
      method: "GET"
    });
  }

  private postJson<TValue>(path: string, body: unknown): Promise<Result<TValue>> {
    return this.requestJson<TValue>(path, {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json"
      }
    });
  }

  private async requestJson<TValue>(path: string, init: RequestInit): Promise<Result<TValue>> {
    const url = new URL(path, this.options.baseUrl).toString();
    const response = await this.fetcher(url, init);
    if (!response.ok) {
      return err({
        code: "STATE_CONFLICT",
        message: `Relay runtime request failed with status ${response.status}.`
      });
    }

    return ok((await response.json()) as TValue);
  }
}
