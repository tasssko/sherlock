import type { CapabilityId } from "./Capability.js";
import type { ContextAssumption, ContextFact } from "./Context.js";
import type { ArtifactId, TaskId, WorkPlanId, WorkspaceId } from "./ids.js";
import { createWorkPlanId } from "./ids.js";

export interface WorkPlanStage {
  id: string;
  title: string;
  objective: string;
  taskIds: readonly TaskId[];
}

export interface AcceptanceCriterion {
  id: string;
  description: string;
}

export interface WorkPlan {
  id: WorkPlanId;
  workspaceId: WorkspaceId;
  objective: string;
  facts: readonly ContextFact[];
  assumptions: readonly ContextAssumption[];
  requiredCapabilities: readonly CapabilityId[];
  stages: readonly WorkPlanStage[];
  acceptanceCriteria: readonly AcceptanceCriterion[];
  artifactIds: readonly ArtifactId[];
  createdAt: string;
}

export interface CreateWorkPlanInput {
  workspaceId: WorkspaceId;
  objective: string;
  facts: readonly ContextFact[];
  assumptions: readonly ContextAssumption[];
  requiredCapabilities: readonly CapabilityId[];
  stages: readonly WorkPlanStage[];
  acceptanceCriteria: readonly AcceptanceCriterion[];
}

export function createWorkPlan(input: CreateWorkPlanInput): WorkPlan {
  return {
    id: createWorkPlanId(),
    workspaceId: input.workspaceId,
    objective: input.objective,
    facts: input.facts,
    assumptions: input.assumptions,
    requiredCapabilities: input.requiredCapabilities,
    stages: input.stages,
    acceptanceCriteria: input.acceptanceCriteria,
    artifactIds: [],
    createdAt: new Date().toISOString()
  };
}

export function linkArtifactToWorkPlan(workPlan: WorkPlan, artifactId: ArtifactId): WorkPlan {
  return {
    ...workPlan,
    artifactIds: [...workPlan.artifactIds, artifactId]
  };
}

