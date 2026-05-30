import type { RuntimeTraceId } from "../../domain/primitives/ids.js";
import { createRuntimeTraceId } from "../../domain/primitives/ids.js";

export type RuntimeProvider = "fixture" | "relay";
export type RuntimeOperation =
  | "evaluateActiveReviewSession"
  | "evaluateAssessmentAttempt"
  | "generateInitialAssessment"
  | "generatePracticeActivity"
  | "generateStudyPlan";

export interface RelayTaskSnapshot {
  relayArtifactIds: readonly string[];
  relayConversationId?: string;
  relayMessageId?: string;
  relayResponseMessageId?: string;
  relayTaskId?: string;
  relayWorkPlanId?: string;
}

export interface RuntimeArtifactSnapshot {
  id: string;
  kind: string;
}

export interface RuntimeExecutionSnapshot {
  operation: RuntimeOperation;
  producedDomainIds: readonly string[];
  provider: RuntimeProvider;
  status: "failed" | "succeeded";
}

export interface RuntimeTraceFailureSnapshot {
  code: string;
  message: string;
}

export interface RuntimeTraceSnapshot {
  createdAt: string;
  execution: RuntimeExecutionSnapshot;
  failure?: RuntimeTraceFailureSnapshot;
  id: RuntimeTraceId;
  relayTask?: RelayTaskSnapshot;
  runtimeArtifacts: readonly RuntimeArtifactSnapshot[];
}

export interface RuntimeTraceSeed {
  operation: RuntimeOperation;
  provider: RuntimeProvider;
  relayTask?: RelayTaskSnapshot;
  runtimeArtifacts?: readonly RuntimeArtifactSnapshot[];
}

export class RuntimeTrace {
  private constructor(private readonly snapshot: RuntimeTraceSnapshot) {}

  static fail(input: {
    error: { code: string; message: string };
    producedDomainIds?: readonly string[];
    seed: RuntimeTraceSeed;
  }): RuntimeTrace {
    return new RuntimeTrace({
      id: createRuntimeTraceId(),
      createdAt: new Date().toISOString(),
      execution: {
        operation: input.seed.operation,
        provider: input.seed.provider,
        status: "failed",
        producedDomainIds: [...(input.producedDomainIds ?? [])]
      },
      failure: {
        code: input.error.code,
        message: input.error.message
      },
      relayTask: input.seed.relayTask
        ? {
            ...input.seed.relayTask,
            relayArtifactIds: [...input.seed.relayTask.relayArtifactIds]
          }
        : undefined,
      runtimeArtifacts: [...(input.seed.runtimeArtifacts ?? [])]
    });
  }

  static rehydrate(snapshot: RuntimeTraceSnapshot): RuntimeTrace {
    return new RuntimeTrace({
      ...snapshot,
      execution: {
        ...snapshot.execution,
        producedDomainIds: [...snapshot.execution.producedDomainIds]
      },
      relayTask: snapshot.relayTask
        ? {
            ...snapshot.relayTask,
            relayArtifactIds: [...snapshot.relayTask.relayArtifactIds]
          }
        : undefined,
      runtimeArtifacts: snapshot.runtimeArtifacts.map((artifact) => ({ ...artifact }))
    });
  }

  static succeed(input: {
    producedDomainIds: readonly string[];
    seed: RuntimeTraceSeed;
  }): RuntimeTrace {
    return new RuntimeTrace({
      id: createRuntimeTraceId(),
      createdAt: new Date().toISOString(),
      execution: {
        operation: input.seed.operation,
        provider: input.seed.provider,
        status: "succeeded",
        producedDomainIds: [...input.producedDomainIds]
      },
      relayTask: input.seed.relayTask
        ? {
            ...input.seed.relayTask,
            relayArtifactIds: [...input.seed.relayTask.relayArtifactIds]
          }
        : undefined,
      runtimeArtifacts: [...(input.seed.runtimeArtifacts ?? [])]
    });
  }

  toSnapshot(): RuntimeTraceSnapshot {
    return {
      ...this.snapshot,
      execution: {
        ...this.snapshot.execution,
        producedDomainIds: [...this.snapshot.execution.producedDomainIds]
      },
      relayTask: this.snapshot.relayTask
        ? {
            ...this.snapshot.relayTask,
            relayArtifactIds: [...this.snapshot.relayTask.relayArtifactIds]
          }
        : undefined,
      runtimeArtifacts: this.snapshot.runtimeArtifacts.map((artifact) => ({ ...artifact }))
    };
  }
}
