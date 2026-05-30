import type { ArtifactId, EventId, TaskId, WorkPlanId, WorkspaceId } from "./ids.js";
import { createWorkspaceId } from "./ids.js";
import type { DomainEventRecorder } from "./Event.js";

export interface LearnerProfile {
  name: string;
  yearGroup: string;
  availableMinutesByDay: Record<string, number>;
}

export interface WorkspaceSnapshot {
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

export class Workspace {
  private constructor(private readonly snapshot: WorkspaceSnapshot) {}

  static create(input: CreateWorkspaceInput): Workspace {
    const now = new Date().toISOString();

    return new Workspace({
      id: createWorkspaceId(),
      title: input.title,
      learner: {
        ...input.learner,
        availableMinutesByDay: { ...input.learner.availableMinutesByDay }
      },
      activeObjective: input.activeObjective,
      taskIds: [],
      workPlanIds: [],
      artifactIds: [],
      eventIds: [],
      createdAt: now,
      updatedAt: now
    });
  }

  static rehydrate(snapshot: WorkspaceSnapshot): Workspace {
    return new Workspace({
      ...snapshot,
      learner: {
        ...snapshot.learner,
        availableMinutesByDay: { ...snapshot.learner.availableMinutesByDay }
      },
      taskIds: [...snapshot.taskIds],
      workPlanIds: [...snapshot.workPlanIds],
      artifactIds: [...snapshot.artifactIds],
      eventIds: [...snapshot.eventIds]
    });
  }

  get id(): WorkspaceId {
    return this.snapshot.id;
  }

  get title(): string {
    return this.snapshot.title;
  }

  get learner(): LearnerProfile {
    return this.snapshot.learner;
  }

  get activeObjective(): string {
    return this.snapshot.activeObjective;
  }

  attachTask(taskId: TaskId, events: DomainEventRecorder): Workspace {
    events.assertWorkspace(this.snapshot.id);
    if (this.snapshot.taskIds.includes(taskId)) {
      return this;
    }

    const next = this.withCollection("taskIds", [...this.snapshot.taskIds, taskId]);
    events.recordWorkspaceTaskAttached(taskId);
    return next;
  }

  attachWorkPlan(workPlanId: WorkPlanId, events: DomainEventRecorder): Workspace {
    events.assertWorkspace(this.snapshot.id);
    if (this.snapshot.workPlanIds.includes(workPlanId)) {
      return this;
    }

    const next = this.withCollection("workPlanIds", [...this.snapshot.workPlanIds, workPlanId]);
    events.recordWorkspaceWorkPlanAttached(workPlanId);
    return next;
  }

  attachArtifact(artifactId: ArtifactId, events: DomainEventRecorder): Workspace {
    events.assertWorkspace(this.snapshot.id);
    if (this.snapshot.artifactIds.includes(artifactId)) {
      return this;
    }

    const next = this.withCollection("artifactIds", [...this.snapshot.artifactIds, artifactId]);
    events.recordWorkspaceArtifactAttached(artifactId);
    return next;
  }

  recordEventLedger(eventIds: readonly EventId[]): Workspace {
    return new Workspace({
      ...this.snapshot,
      eventIds: [...eventIds],
      updatedAt: new Date().toISOString()
    });
  }

  appendEventLedger(eventIds: readonly EventId[]): Workspace {
    const merged = [...this.snapshot.eventIds];

    for (const eventId of eventIds) {
      if (!merged.includes(eventId)) {
        merged.push(eventId);
      }
    }

    return new Workspace({
      ...this.snapshot,
      eventIds: merged,
      updatedAt: new Date().toISOString()
    });
  }

  toSnapshot(): WorkspaceSnapshot {
    return {
      ...this.snapshot,
      learner: {
        ...this.snapshot.learner,
        availableMinutesByDay: { ...this.snapshot.learner.availableMinutesByDay }
      },
      taskIds: [...this.snapshot.taskIds],
      workPlanIds: [...this.snapshot.workPlanIds],
      artifactIds: [...this.snapshot.artifactIds],
      eventIds: [...this.snapshot.eventIds]
    };
  }

  private withCollection<TKey extends "artifactIds" | "taskIds" | "workPlanIds">(
    key: TKey,
    values: WorkspaceSnapshot[TKey]
  ): Workspace {
    return new Workspace({
      ...this.snapshot,
      [key]: values,
      updatedAt: new Date().toISOString()
    });
  }
}
