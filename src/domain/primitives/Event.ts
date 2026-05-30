import type {
  AgentId,
  ArtifactId,
  AssessmentId,
  AttemptId,
  EventId,
  EvaluationId,
  KnowledgeGapId,
  LearningLoopId,
  MasterDataSourceId,
  MasteryProfileId,
  TaskId,
  WorkPlanId,
  WorkspaceId
} from "./ids.js";
import { createEventId } from "./ids.js";
import type { PolicyId } from "./Policy.js";
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

export type WorkPlanAssumptionRecordedEvent = BaseEvent<
  "work-plan.assumption-recorded",
  { workPlanId: WorkPlanId; assumption: string }
>;

export type WorkPlanArtifactAttachedEvent = BaseEvent<
  "work-plan.artifact-attached",
  { workPlanId: WorkPlanId; artifactId: ArtifactId }
>;

export type AgentInvokedEvent = BaseEvent<
  "agent.invoked",
  { agentId: AgentId; role: string }
>;

export type ArtifactGeneratedEvent = BaseEvent<
  "artifact.generated",
  { artifactId: ArtifactId; artifactType: string; taskId?: TaskId; version: number }
>;

export type ArtifactRevisedEvent = BaseEvent<
  "artifact.revised",
  { artifactId: ArtifactId; version: number }
>;

export type AssessmentCreatedEvent = BaseEvent<
  "assessment.created",
  { assessmentId: AssessmentId; kind: string; topic: string }
>;

export type AssessmentArtifactAttachedEvent = BaseEvent<
  "assessment.artifact-attached",
  { assessmentId: AssessmentId; artifactId: ArtifactId }
>;

export type AttemptCreatedEvent = BaseEvent<
  "attempt.created",
  { attemptId: AttemptId; assessmentId: AssessmentId }
>;

export type EvaluationCreatedEvent = BaseEvent<
  "evaluation.created",
  { evaluationId: EvaluationId; assessmentId: AssessmentId; score: number }
>;

export type LearningLoopCreatedEvent = BaseEvent<
  "learning-loop.created",
  { learningLoopId: LearningLoopId; phase: string; topic: string }
>;

export type LearningLoopAssessmentAttachedEvent = BaseEvent<
  "learning-loop.assessment-attached",
  { learningLoopId: LearningLoopId; assessmentId: AssessmentId }
>;

export type LearningLoopAttemptRecordedEvent = BaseEvent<
  "learning-loop.attempt-recorded",
  { learningLoopId: LearningLoopId; attemptId: AttemptId }
>;

export type LearningLoopEvaluationRecordedEvent = BaseEvent<
  "learning-loop.evaluation-recorded",
  { learningLoopId: LearningLoopId; evaluationId: EvaluationId }
>;

export type LearningLoopKnowledgeGapRecordedEvent = BaseEvent<
  "learning-loop.knowledge-gap-recorded",
  { learningLoopId: LearningLoopId; knowledgeGapId: KnowledgeGapId }
>;

export type LearningLoopWorkPlanAttachedEvent = BaseEvent<
  "learning-loop.work-plan-attached",
  { learningLoopId: LearningLoopId; workPlanId: WorkPlanId }
>;

export type LearningLoopArtifactAttachedEvent = BaseEvent<
  "learning-loop.artifact-attached",
  { learningLoopId: LearningLoopId; artifactId: ArtifactId }
>;

export type LearningLoopMasteryProfileUpdatedEvent = BaseEvent<
  "learning-loop.mastery-profile-updated",
  { learningLoopId: LearningLoopId; masteryProfileId: MasteryProfileId }
>;

export type MasterDataSourceRegisteredEvent = BaseEvent<
  "master-data.source-registered",
  { sourceId: MasterDataSourceId; name: string }
>;

export type WorkspaceTaskAttachedEvent = BaseEvent<
  "workspace.task-attached",
  { taskId: TaskId }
>;

export type WorkspaceWorkPlanAttachedEvent = BaseEvent<
  "workspace.work-plan-attached",
  { workPlanId: WorkPlanId }
>;

export type WorkspaceArtifactAttachedEvent = BaseEvent<
  "workspace.artifact-attached",
  { artifactId: ArtifactId }
>;

export type PolicyEvaluatedEvent = BaseEvent<
  "policy.evaluated",
  { policyId: PolicyId; outcome: "failed" | "passed" }
>;

export type DomainEvent =
  | AgentInvokedEvent
  | ArtifactGeneratedEvent
  | ArtifactRevisedEvent
  | AssessmentArtifactAttachedEvent
  | AssessmentCreatedEvent
  | AttemptCreatedEvent
  | EvaluationCreatedEvent
  | LearningLoopArtifactAttachedEvent
  | LearningLoopAssessmentAttachedEvent
  | LearningLoopAttemptRecordedEvent
  | LearningLoopCreatedEvent
  | LearningLoopEvaluationRecordedEvent
  | LearningLoopKnowledgeGapRecordedEvent
  | LearningLoopMasteryProfileUpdatedEvent
  | LearningLoopWorkPlanAttachedEvent
  | MasterDataSourceRegisteredEvent
  | PolicyEvaluatedEvent
  | TaskCreatedEvent
  | TaskStateChangedEvent
  | WorkPlanArtifactAttachedEvent
  | WorkPlanAssumptionRecordedEvent
  | WorkPlanCreatedEvent
  | WorkspaceArtifactAttachedEvent
  | WorkspaceTaskAttachedEvent
  | WorkspaceWorkPlanAttachedEvent;

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

export class DomainEventRecorder {
  private readonly items: DomainEvent[] = [];

  constructor(private readonly workspaceId: WorkspaceId) {}

  get boundWorkspaceId(): WorkspaceId {
    return this.workspaceId;
  }

  assertWorkspace(workspaceId: WorkspaceId): void {
    if (workspaceId !== this.workspaceId) {
      throw new Error(
        `DomainEventRecorder is bound to workspace ${this.workspaceId} and cannot record events for ${workspaceId}.`
      );
    }
  }

  recordTaskCreated(taskId: TaskId, title: string, state: TaskState): void {
    this.items.push(makeEvent(this.workspaceId, "task.created", { taskId, title, state }));
  }

  recordTaskStateChanged(taskId: TaskId, from: TaskState, to: TaskState): void {
    this.items.push(makeEvent(this.workspaceId, "task.state_changed", { taskId, from, to }));
  }

  recordWorkPlanCreated(workPlanId: WorkPlanId, objective: string): void {
    this.items.push(makeEvent(this.workspaceId, "work-plan.created", { workPlanId, objective }));
  }

  recordWorkPlanAssumption(workPlanId: WorkPlanId, assumption: string): void {
    this.items.push(
      makeEvent(this.workspaceId, "work-plan.assumption-recorded", {
        workPlanId,
        assumption
      })
    );
  }

  recordWorkPlanArtifactAttached(workPlanId: WorkPlanId, artifactId: ArtifactId): void {
    this.items.push(
      makeEvent(this.workspaceId, "work-plan.artifact-attached", {
        workPlanId,
        artifactId
      })
    );
  }

  recordAgentInvoked(agentId: AgentId, role: string): void {
    this.items.push(makeEvent(this.workspaceId, "agent.invoked", { agentId, role }));
  }

  recordArtifactGenerated(
    artifactId: ArtifactId,
    artifactType: string,
    taskId: TaskId | undefined,
    version: number
  ): void {
    this.items.push(
      makeEvent(this.workspaceId, "artifact.generated", {
        artifactId,
        artifactType,
        taskId,
        version
      })
    );
  }

  recordArtifactRevised(artifactId: ArtifactId, version: number): void {
    this.items.push(
      makeEvent(this.workspaceId, "artifact.revised", {
        artifactId,
        version
      })
    );
  }

  recordAssessmentCreated(assessmentId: AssessmentId, kind: string, topic: string): void {
    this.items.push(
      makeEvent(this.workspaceId, "assessment.created", {
        assessmentId,
        kind,
        topic
      })
    );
  }

  recordAssessmentArtifactAttached(assessmentId: AssessmentId, artifactId: ArtifactId): void {
    this.items.push(
      makeEvent(this.workspaceId, "assessment.artifact-attached", {
        assessmentId,
        artifactId
      })
    );
  }

  recordAttemptCreated(attemptId: AttemptId, assessmentId: AssessmentId): void {
    this.items.push(
      makeEvent(this.workspaceId, "attempt.created", {
        attemptId,
        assessmentId
      })
    );
  }

  recordEvaluationCreated(
    evaluationId: EvaluationId,
    assessmentId: AssessmentId,
    score: number
  ): void {
    this.items.push(
      makeEvent(this.workspaceId, "evaluation.created", {
        evaluationId,
        assessmentId,
        score
      })
    );
  }

  recordLearningLoopCreated(
    learningLoopId: LearningLoopId,
    phase: string,
    topic: string
  ): void {
    this.items.push(
      makeEvent(this.workspaceId, "learning-loop.created", {
        learningLoopId,
        phase,
        topic
      })
    );
  }

  recordLearningLoopAssessmentAttached(
    learningLoopId: LearningLoopId,
    assessmentId: AssessmentId
  ): void {
    this.items.push(
      makeEvent(this.workspaceId, "learning-loop.assessment-attached", {
        learningLoopId,
        assessmentId
      })
    );
  }

  recordLearningLoopAttemptRecorded(
    learningLoopId: LearningLoopId,
    attemptId: AttemptId
  ): void {
    this.items.push(
      makeEvent(this.workspaceId, "learning-loop.attempt-recorded", {
        learningLoopId,
        attemptId
      })
    );
  }

  recordLearningLoopEvaluationRecorded(
    learningLoopId: LearningLoopId,
    evaluationId: EvaluationId
  ): void {
    this.items.push(
      makeEvent(this.workspaceId, "learning-loop.evaluation-recorded", {
        learningLoopId,
        evaluationId
      })
    );
  }

  recordLearningLoopKnowledgeGapRecorded(
    learningLoopId: LearningLoopId,
    knowledgeGapId: KnowledgeGapId
  ): void {
    this.items.push(
      makeEvent(this.workspaceId, "learning-loop.knowledge-gap-recorded", {
        learningLoopId,
        knowledgeGapId
      })
    );
  }

  recordLearningLoopWorkPlanAttached(
    learningLoopId: LearningLoopId,
    workPlanId: WorkPlanId
  ): void {
    this.items.push(
      makeEvent(this.workspaceId, "learning-loop.work-plan-attached", {
        learningLoopId,
        workPlanId
      })
    );
  }

  recordLearningLoopArtifactAttached(
    learningLoopId: LearningLoopId,
    artifactId: ArtifactId
  ): void {
    this.items.push(
      makeEvent(this.workspaceId, "learning-loop.artifact-attached", {
        learningLoopId,
        artifactId
      })
    );
  }

  recordLearningLoopMasteryProfileUpdated(
    learningLoopId: LearningLoopId,
    masteryProfileId: MasteryProfileId
  ): void {
    this.items.push(
      makeEvent(this.workspaceId, "learning-loop.mastery-profile-updated", {
        learningLoopId,
        masteryProfileId
      })
    );
  }

  recordMasterDataSourceRegistered(sourceId: MasterDataSourceId, name: string): void {
    this.items.push(
      makeEvent(this.workspaceId, "master-data.source-registered", {
        sourceId,
        name
      })
    );
  }

  recordWorkspaceTaskAttached(taskId: TaskId): void {
    this.items.push(makeEvent(this.workspaceId, "workspace.task-attached", { taskId }));
  }

  recordWorkspaceWorkPlanAttached(workPlanId: WorkPlanId): void {
    this.items.push(makeEvent(this.workspaceId, "workspace.work-plan-attached", { workPlanId }));
  }

  recordWorkspaceArtifactAttached(artifactId: ArtifactId): void {
    this.items.push(makeEvent(this.workspaceId, "workspace.artifact-attached", { artifactId }));
  }

  recordPolicyEvaluated(policyId: PolicyId, outcome: "failed" | "passed"): void {
    this.items.push(makeEvent(this.workspaceId, "policy.evaluated", { policyId, outcome }));
  }

  all(): readonly DomainEvent[] {
    return this.items.map((event) => ({
      ...event,
      payload: { ...event.payload }
    })) as readonly DomainEvent[];
  }
}

export function createDomainEventRecorder(workspaceId: WorkspaceId): DomainEventRecorder {
  return new DomainEventRecorder(workspaceId);
}
