import type { AgentId, ArtifactId, TaskId, WorkspaceId } from "./ids.js";
import { createArtifactId } from "./ids.js";

export type ArtifactType = "explanation" | "quiz" | "study-plan";

export interface ArtifactProvenance {
  controller: string;
  taskId?: TaskId;
  agentId?: AgentId;
  facts: readonly string[];
  assumptions: readonly string[];
  decisions: readonly string[];
}

export interface Artifact<TContent = unknown, TType extends ArtifactType = ArtifactType> {
  id: ArtifactId;
  workspaceId: WorkspaceId;
  taskId?: TaskId;
  type: TType;
  content: TContent;
  provenance: ArtifactProvenance;
  version: number;
  createdAt: string;
}

export interface CreateArtifactInput<TContent, TType extends ArtifactType> {
  workspaceId: WorkspaceId;
  taskId?: TaskId;
  type: TType;
  content: TContent;
  provenance: ArtifactProvenance;
}

export function createArtifact<TContent, TType extends ArtifactType>(
  input: CreateArtifactInput<TContent, TType>
): Artifact<TContent, TType> {
  return {
    id: createArtifactId(),
    workspaceId: input.workspaceId,
    taskId: input.taskId,
    type: input.type,
    content: input.content,
    provenance: input.provenance,
    version: 1,
    createdAt: new Date().toISOString()
  };
}

