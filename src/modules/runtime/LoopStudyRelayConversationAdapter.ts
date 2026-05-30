import { err, ok, type Result } from "../../domain/primitives/result.js";
import type { LearningLoopId } from "../../domain/primitives/ids.js";
import type { LoopStudyRelayCapability } from "./LoopStudyRelayRuntimeProfile.js";
import { RelayWorkspaceBinding } from "./RelayWorkspaceBinding.js";
import {
  RuntimeConversationBinding,
  type RuntimeConversationBindingSnapshot
} from "./RuntimeConversationBinding.js";

interface RelayMessageCreateResponse {
  conversationId?: string;
  messageId?: string;
  responseContent?: unknown;
  responseMessageId?: string;
  responseText?: string;
  taskId?: string;
  workPlanId?: string;
}

interface RelayMessageInspectionResponse {
  artifacts?: {
    id?: string;
  }[];
  conversation?: {
    id?: string;
  };
  message?: {
    id?: string;
  };
  responseContent?: unknown;
  responseText?: string;
  resultEvents?: {
    artifactId?: string;
  }[];
  task?: {
    id?: string;
    workPlanId?: string;
  };
}

export interface RelayMessageCorrelation {
  relayArtifactIds: readonly string[];
  relayConversationId: string;
  relayMessageId?: string;
  relayResponseMessageId?: string;
  relayTaskId?: string;
  relayWorkPlanId?: string;
}

export interface RelayConversationTurnResult {
  binding: RuntimeConversationBinding;
  correlation: RelayMessageCorrelation;
  responseContent?: unknown;
  responseText?: string;
}

interface RelayCommandContent {
  expectedOutputSchema: string;
  input: unknown;
  inputSchema: string;
  name: string;
  previewText?: string;
  type: "command";
}

interface RelayApiErrorPayload {
  error?: string;
  message?: string;
}

export interface LoopStudyRelayConversationAdapterOptions {
  binding: RelayWorkspaceBinding;
  createdBy?: string;
  fetcher?: typeof fetch;
  now?: () => Date;
  senderId?: string;
}

type RelayJsonResponse<TValue> =
  | { ok: true; value: TValue }
  | { ok: false; error: { message: string; status?: number } };

export class LoopStudyRelayConversationAdapter {
  private readonly createdBy: string;
  private readonly fetcher: typeof fetch;
  private readonly now: () => Date;
  private readonly senderId: string;

  constructor(private readonly options: LoopStudyRelayConversationAdapterOptions) {
    this.createdBy = options.createdBy ?? "loop.study";
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.senderId = options.senderId ?? "loop.study";
  }

  async sendStructuredTurn(input: {
    capability: LoopStudyRelayCapability;
    idempotencyKey: string;
    learningLoopId: LearningLoopId;
    metadata: {
      operation: string;
      stage: string;
    };
    relayCommand: RelayCommandContent;
    runtimeConversationBinding?: RuntimeConversationBinding;
  }): Promise<Result<RelayConversationTurnResult>> {
    const route = this.options.binding.routeFor(input.capability);
    const response = await this.postJson<RelayMessageCreateResponse>("/v1/messages", {
      workspaceId: this.options.binding.workspaceId,
      conversationId: input.runtimeConversationBinding?.relayConversationId,
      to: normalizeRelayRecipient(route.agentHandle),
      source: "api",
      senderId: this.senderId,
      createdBy: this.createdBy,
      content: input.relayCommand,
      metadata: {
        product: "loop.study",
        learningLoopId: input.learningLoopId,
        stage: input.metadata.stage,
        operation: input.metadata.operation,
        expectedOutputSchema: input.relayCommand.expectedOutputSchema,
        idempotencyKey: input.idempotencyKey,
        controllerId: route.controllerId ?? this.options.binding.controllerId,
        requiredSkillIds: route.requiredSkillIds ?? []
      },
      idempotencyKey: input.idempotencyKey
    });
    if (!response.ok) {
      return response;
    }

    const relayConversationId =
      response.value.conversationId ??
      input.runtimeConversationBinding?.relayConversationId;
    if (!relayConversationId) {
      return err({
        code: "STATE_CONFLICT",
        message: "Relay runtime did not return a conversation id."
      });
    }

    const runtimeConversationBinding =
      input.runtimeConversationBinding?.relayConversationId === relayConversationId
        ? input.runtimeConversationBinding.touch(this.now)
        : RuntimeConversationBinding.create({
            learningLoopId: input.learningLoopId,
            profileId: this.options.binding.profileId,
            relayConversationId,
            workspaceId: this.options.binding.workspaceId,
            now: this.now
          });

    let responseContent = response.value.responseContent;
    let responseText = response.value.responseText;
    let artifactIds: readonly string[] = [];
    let relayTaskId = response.value.taskId;
    let relayWorkPlanId = response.value.workPlanId;

    if (
      (!responseContent && !responseText) ||
      !response.value.responseMessageId ||
      !relayTaskId ||
      artifactIds.length === 0
    ) {
      const inspection = await this.fetchInspectionResponse(response.value.messageId);
      if (!inspection.ok) {
        return inspection;
      }

      responseContent = responseContent ?? inspection.value.responseContent;
      responseText = responseText ?? inspection.value.responseText;
      artifactIds = inspection.value.artifactIds;
      relayTaskId = relayTaskId ?? inspection.value.taskId;
      relayWorkPlanId = relayWorkPlanId ?? inspection.value.workPlanId;
    }

    if (!responseContent && !responseText) {
      return err({
        code: "STATE_CONFLICT",
        message: "Relay runtime did not return structured response content for this conversation turn."
      });
    }

    return ok({
      binding: runtimeConversationBinding,
      responseContent,
      responseText,
      correlation: {
        relayArtifactIds: artifactIds,
        relayConversationId,
        relayMessageId: response.value.messageId,
        relayResponseMessageId: response.value.responseMessageId,
        relayTaskId,
        relayWorkPlanId
      }
    });
  }

  private async fetchInspectionResponse(
    messageId: string | undefined
  ): Promise<
    Result<{
      artifactIds: readonly string[];
      responseContent?: unknown;
      responseText?: string;
      taskId?: string;
      workPlanId?: string;
    }>
  > {
    if (!messageId) {
      return err({
        code: "STATE_CONFLICT",
        message: "Relay runtime did not return a message id for inspection."
      });
    }

    const inspection = await this.getJson<RelayMessageInspectionResponse>(
      `/v1/messages/${messageId}/inspection`
    );
    if (!inspection.ok) {
      return inspection;
    }

    return ok({
      responseContent: inspection.value.responseContent,
      responseText: inspection.value.responseText,
      taskId: inspection.value.task?.id,
      workPlanId: inspection.value.task?.workPlanId,
      artifactIds: collectArtifactIds(inspection.value)
    });
  }

  private async getJson<TValue>(path: string): Promise<Result<TValue>> {
    return this.requestJson<TValue>(path, { method: "GET" });
  }

  private async postJson<TValue>(path: string, body: unknown): Promise<Result<TValue>> {
    return this.requestJson<TValue>(path, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });
  }

  private async requestJson<TValue>(
    path: string,
    init: RequestInit
  ): Promise<Result<TValue>> {
    const url = new URL(path, this.options.binding.baseUrl).toString();
    let response: Response;

    try {
      response = await this.fetcher(url, init);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown network failure.";

      return err({
        code: "STATE_CONFLICT",
        message: `Upstream request failed before a response was received. ${message}`
      });
    }

    if (!response.ok) {
      const payload = await readRelayErrorPayload(response);
      const detail = payload.message ?? payload.error ?? `status ${response.status}`;

      return err({
        code: "STATE_CONFLICT",
        message: `Upstream request failed with status ${response.status}. ${detail}`
      });
    }

    return ok((await response.json()) as TValue);
  }
}

function normalizeRelayRecipient(value: string): string {
  return value.startsWith("@") ? value : `@${value}`;
}

function collectArtifactIds(
  inspection: RelayMessageInspectionResponse
): readonly string[] {
  const ids = new Set<string>();

  for (const event of inspection.resultEvents ?? []) {
    if (event.artifactId) {
      ids.add(event.artifactId);
    }
  }

  for (const artifact of inspection.artifacts ?? []) {
    if (artifact.id) {
      ids.add(artifact.id);
    }
  }

  return [...ids];
}

async function readRelayErrorPayload(response: Response): Promise<RelayApiErrorPayload> {
  try {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return (await response.json()) as RelayApiErrorPayload;
    }

    const text = (await response.text()).trim();
    return text ? { message: text } : {};
  } catch {
    return {};
  }
}
