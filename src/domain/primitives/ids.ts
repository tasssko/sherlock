export type Brand<TValue, TBrand extends string> = TValue & {
  readonly __brand: TBrand;
};

export type AgentId = Brand<string, "AgentId">;
export type ArtifactId = Brand<string, "ArtifactId">;
export type EventId = Brand<string, "EventId">;
export type TaskId = Brand<string, "TaskId">;
export type WorkPlanId = Brand<string, "WorkPlanId">;
export type WorkspaceId = Brand<string, "WorkspaceId">;

function createId(prefix: string): string {
  const uuid =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return `${prefix}_${uuid}`;
}

export function createAgentId(): AgentId {
  return createId("agent") as AgentId;
}

export function createArtifactId(): ArtifactId {
  return createId("artifact") as ArtifactId;
}

export function createEventId(): EventId {
  return createId("event") as EventId;
}

export function createTaskId(): TaskId {
  return createId("task") as TaskId;
}

export function createWorkPlanId(): WorkPlanId {
  return createId("workplan") as WorkPlanId;
}

export function createWorkspaceId(): WorkspaceId {
  return createId("workspace") as WorkspaceId;
}

