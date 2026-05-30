import type { AgentId, ArtifactId, EventId, TaskId, WorkPlanId, WorkspaceId } from "./ids.js";
import { createEventId } from "./ids.js";
import type { TaskState } from "./Task.js";

interface BaseEvent<TType extends string, TPayload> {
  id: EventId;
  workspaceId: WorkspaceId;
  type: TType;
  occurredAt: string;
  payload: TPayload;
}

export type TaskCreatedEvent = BaseEvent<
  "task.created",
  { taskId: TaskId; title: string; state: TaskState }
>;

export type TaskStateChangedEvent = BaseEvent<
  "task.state_changed",
  { taskId: TaskId; from: TaskState; to: TaskState }
>;

export type WorkPlanCreatedEvent = BaseEvent<
  "work-plan.created",
  { workPlanId: WorkPlanId; objective: string }
>;

export type AgentInvokedEvent = BaseEvent<
  "agent.invoked",
  { agentId: AgentId; role: string }
>;

export type AssumptionRecordedEvent = BaseEvent<
  "assumption.recorded",
  { assumption: string }
>;

export type ArtifactGeneratedEvent = BaseEvent<
  "artifact.generated",
  { artifactId: ArtifactId; artifactType: string; taskId?: TaskId }
>;

export type DomainEvent =
  | AgentInvokedEvent
  | ArtifactGeneratedEvent
  | AssumptionRecordedEvent
  | TaskCreatedEvent
  | TaskStateChangedEvent
  | WorkPlanCreatedEvent;

function makeEvent<TType extends DomainEvent["type"], TPayload>(
  workspaceId: WorkspaceId,
  type: TType,
  payload: TPayload
): BaseEvent<TType, TPayload> {
  return {
    id: createEventId(),
    workspaceId,
    type,
    occurredAt: new Date().toISOString(),
    payload
  };
}

export function taskCreatedEvent(
  workspaceId: WorkspaceId,
  taskId: TaskId,
  title: string,
  state: TaskState
): TaskCreatedEvent {
  return makeEvent(workspaceId, "task.created", { taskId, title, state });
}

export function taskStateChangedEvent(
  workspaceId: WorkspaceId,
  taskId: TaskId,
  from: TaskState,
  to: TaskState
): TaskStateChangedEvent {
  return makeEvent(workspaceId, "task.state_changed", { taskId, from, to });
}

export function workPlanCreatedEvent(
  workspaceId: WorkspaceId,
  workPlanId: WorkPlanId,
  objective: string
): WorkPlanCreatedEvent {
  return makeEvent(workspaceId, "work-plan.created", { workPlanId, objective });
}

export function agentInvokedEvent(
  workspaceId: WorkspaceId,
  agentId: AgentId,
  role: string
): AgentInvokedEvent {
  return makeEvent(workspaceId, "agent.invoked", { agentId, role });
}

export function assumptionRecordedEvent(
  workspaceId: WorkspaceId,
  assumption: string
): AssumptionRecordedEvent {
  return makeEvent(workspaceId, "assumption.recorded", { assumption });
}

export function artifactGeneratedEvent(
  workspaceId: WorkspaceId,
  artifactId: ArtifactId,
  artifactType: string,
  taskId?: TaskId
): ArtifactGeneratedEvent {
  return makeEvent(workspaceId, "artifact.generated", {
    artifactId,
    artifactType,
    taskId
  });
}

