import type { ArtifactId, EventId, TaskId, WorkPlanId, WorkspaceId } from "./ids.js";
import { createWorkspaceId } from "./ids.js";

export interface LearnerProfile {
  name: string;
  yearGroup: string;
  availableMinutesByDay: Record<string, number>;
}

export interface Workspace {
  id: WorkspaceId;
  title: string;
  learner: LearnerProfile;
  activeObjective: string;
  taskIds: readonly TaskId[];
  workPlanIds: readonly WorkPlanId[];
  artifactIds: readonly ArtifactId[];
  eventIds: readonly EventId[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkspaceInput {
  title: string;
  learner: LearnerProfile;
  activeObjective: string;
}

export function createWorkspace(input: CreateWorkspaceInput): Workspace {
  const now = new Date().toISOString();

  return {
    id: createWorkspaceId(),
    title: input.title,
    learner: input.learner,
    activeObjective: input.activeObjective,
    taskIds: [],
    workPlanIds: [],
    artifactIds: [],
    eventIds: [],
    createdAt: now,
    updatedAt: now
  };
}

export function withWorkspaceTaskIds(
  workspace: Workspace,
  taskIds: readonly TaskId[]
): Workspace {
  return {
    ...workspace,
    taskIds,
    updatedAt: new Date().toISOString()
  };
}

export function withWorkspaceWorkPlanIds(
  workspace: Workspace,
  workPlanIds: readonly WorkPlanId[]
): Workspace {
  return {
    ...workspace,
    workPlanIds,
    updatedAt: new Date().toISOString()
  };
}

export function withWorkspaceArtifactIds(
  workspace: Workspace,
  artifactIds: readonly ArtifactId[]
): Workspace {
  return {
    ...workspace,
    artifactIds,
    updatedAt: new Date().toISOString()
  };
}

export function withWorkspaceEventIds(
  workspace: Workspace,
  eventIds: readonly EventId[]
): Workspace {
  return {
    ...workspace,
    eventIds,
    updatedAt: new Date().toISOString()
  };
}

