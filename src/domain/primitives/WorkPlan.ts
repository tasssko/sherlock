import type { CapabilityId } from "./Capability.js";
import type { ContextAssumption, ContextFact } from "./Context.js";
import type { DomainEventRecorder } from "./Event.js";
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

export interface WorkPlanSnapshot {
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
  requiredCapabilities: readonly CapabilityId[];
  stages: readonly WorkPlanStage[];
  acceptanceCriteria: readonly AcceptanceCriterion[];
}

export class WorkPlan {
  private constructor(private readonly snapshot: WorkPlanSnapshot) {}

  static rehydrate(snapshot: WorkPlanSnapshot): WorkPlan {
    return new WorkPlan({
      ...snapshot,
      facts: snapshot.facts.map((fact) => ({ ...fact })),
      assumptions: snapshot.assumptions.map((assumption) => ({ ...assumption })),
      requiredCapabilities: [...snapshot.requiredCapabilities],
      stages: snapshot.stages.map((stage) => ({
        ...stage,
        taskIds: [...stage.taskIds]
      })),
      acceptanceCriteria: snapshot.acceptanceCriteria.map((criterion) => ({ ...criterion })),
      artifactIds: [...snapshot.artifactIds]
    });
  }

  static create(input: CreateWorkPlanInput, events: DomainEventRecorder): WorkPlan {
    events.assertWorkspace(input.workspaceId);
    const workPlan = new WorkPlan({
      id: createWorkPlanId(),
      workspaceId: input.workspaceId,
      objective: input.objective,
      facts: input.facts.map((fact) => ({ ...fact })),
      assumptions: [],
      requiredCapabilities: [...input.requiredCapabilities],
      stages: input.stages.map((stage) => ({
        ...stage,
        taskIds: [...stage.taskIds]
      })),
      acceptanceCriteria: input.acceptanceCriteria.map((criterion) => ({ ...criterion })),
      artifactIds: [],
      createdAt: new Date().toISOString()
    });

    events.recordWorkPlanCreated(workPlan.id, workPlan.objective);

    return workPlan;
  }

  get id(): WorkPlanId {
    return this.snapshot.id;
  }

  get objective(): string {
    return this.snapshot.objective;
  }

  recordAssumption(assumption: ContextAssumption, events: DomainEventRecorder): WorkPlan {
    events.assertWorkspace(this.snapshot.workspaceId);
    if (this.snapshot.assumptions.some((existing) => existing.id === assumption.id)) {
      return this;
    }

    const next = new WorkPlan({
      ...this.snapshot,
      assumptions: [...this.snapshot.assumptions, { ...assumption }]
    });

    events.recordWorkPlanAssumption(next.id, assumption.statement);

    return next;
  }

  attachArtifact(artifactId: ArtifactId, events: DomainEventRecorder): WorkPlan {
    events.assertWorkspace(this.snapshot.workspaceId);
    if (this.snapshot.artifactIds.includes(artifactId)) {
      return this;
    }

    const next = new WorkPlan({
      ...this.snapshot,
      artifactIds: [...this.snapshot.artifactIds, artifactId]
    });

    events.recordWorkPlanArtifactAttached(next.id, artifactId);

    return next;
  }

  toSnapshot(): WorkPlanSnapshot {
    return {
      ...this.snapshot,
      facts: this.snapshot.facts.map((fact) => ({ ...fact })),
      assumptions: this.snapshot.assumptions.map((assumption) => ({ ...assumption })),
      requiredCapabilities: [...this.snapshot.requiredCapabilities],
      stages: this.snapshot.stages.map((stage) => ({
        ...stage,
        taskIds: [...stage.taskIds]
      })),
      acceptanceCriteria: this.snapshot.acceptanceCriteria.map((criterion) => ({ ...criterion })),
      artifactIds: [...this.snapshot.artifactIds]
    };
  }
}
