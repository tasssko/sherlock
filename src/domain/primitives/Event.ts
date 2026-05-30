import type {
  ActiveReviewSessionId,
  AgentId,
  ArtifactId,
  AssessmentId,
  AttemptId,
  EventId,
  EvaluationId,
  KnowledgeGapId,
  LearningLoopId,
  MasterDataItemId,
  MasterDataSourceId,
  MasteryProfileId,
  PracticeActivityId,
  TaskId,
  WorkPlanId,
  WorkspaceId
} from "./ids.js";
import { createEventId } from "./ids.js";
import type { PolicyId } from "./Policy.js";
import type { TaskState } from "./Task.js";
import type { PracticeActivityKind } from "../learning/PracticeActivity.js";

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

export type InitialAssessmentGeneratedEvent = BaseEvent<
  "initial-assessment.generated",
  { learningLoopId: LearningLoopId; assessmentId: AssessmentId; artifactId: ArtifactId }
>;

export type AssessmentAttemptSubmittedEvent = BaseEvent<
  "assessment-attempt.submitted",
  { learningLoopId: LearningLoopId; assessmentId: AssessmentId; attemptId: AttemptId }
>;

export type AssessmentEvaluatedEvent = BaseEvent<
  "assessment.evaluated",
  {
    learningLoopId: LearningLoopId;
    assessmentId: AssessmentId;
    evaluationId: EvaluationId;
    score: number;
  }
>;

export type KnowledgeGapsIdentifiedEvent = BaseEvent<
  "knowledge-gaps.identified",
  { learningLoopId: LearningLoopId; knowledgeGapIds: readonly KnowledgeGapId[] }
>;

export type StudyPlanAdaptedEvent = BaseEvent<
  "study-plan.adapted",
  {
    learningLoopId: LearningLoopId;
    workPlanId: WorkPlanId;
    artifactId: ArtifactId;
    diagnosedGapCount: number;
  }
>;

export type PracticeActivityGeneratedEvent = BaseEvent<
  "practice-activity.generated",
  {
    learningLoopId: LearningLoopId;
    practiceActivityId: PracticeActivityId;
    kind: PracticeActivityKind;
    targetKnowledgeGapIds: readonly KnowledgeGapId[];
    sourceMasterDataItemIds: readonly MasterDataItemId[];
  }
>;

export type PracticeActivityCompletedEvent = BaseEvent<
  "practice-activity.completed",
  {
    activeReviewSessionId: ActiveReviewSessionId;
    learningLoopId: LearningLoopId;
    practiceActivityId: PracticeActivityId;
    masteryScore: number;
  }
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
  | AssessmentAttemptSubmittedEvent
  | AssessmentEvaluatedEvent
  | AssessmentCreatedEvent
  | AttemptCreatedEvent
  | EvaluationCreatedEvent
  | InitialAssessmentGeneratedEvent
  | KnowledgeGapsIdentifiedEvent
  | LearningLoopCreatedEvent
  | LearningLoopMasteryProfileUpdatedEvent
  | MasterDataSourceRegisteredEvent
  | PolicyEvaluatedEvent
  | PracticeActivityCompletedEvent
  | PracticeActivityGeneratedEvent
  | StudyPlanAdaptedEvent
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

  recordInitialAssessmentGenerated(
    learningLoopId: LearningLoopId,
    assessmentId: AssessmentId,
    artifactId: ArtifactId
  ): void {
    this.items.push(
      makeEvent(this.workspaceId, "initial-assessment.generated", {
        learningLoopId,
        assessmentId,
        artifactId
      })
    );
  }

  recordAssessmentAttemptSubmitted(
    learningLoopId: LearningLoopId,
    assessmentId: AssessmentId,
    attemptId: AttemptId
  ): void {
    this.items.push(
      makeEvent(this.workspaceId, "assessment-attempt.submitted", {
        learningLoopId,
        assessmentId,
        attemptId
      })
    );
  }

  recordAssessmentEvaluated(
    learningLoopId: LearningLoopId,
    assessmentId: AssessmentId,
    evaluationId: EvaluationId,
    score: number
  ): void {
    this.items.push(
      makeEvent(this.workspaceId, "assessment.evaluated", {
        learningLoopId,
        assessmentId,
        evaluationId,
        score
      })
    );
  }

  recordKnowledgeGapsIdentified(
    learningLoopId: LearningLoopId,
    knowledgeGapIds: readonly KnowledgeGapId[]
  ): void {
    this.items.push(
      makeEvent(this.workspaceId, "knowledge-gaps.identified", {
        learningLoopId,
        knowledgeGapIds: [...knowledgeGapIds]
      })
    );
  }

  recordStudyPlanAdapted(
    learningLoopId: LearningLoopId,
    workPlanId: WorkPlanId,
    artifactId: ArtifactId,
    diagnosedGapCount: number
  ): void {
    this.items.push(
      makeEvent(this.workspaceId, "study-plan.adapted", {
        learningLoopId,
        workPlanId,
        artifactId,
        diagnosedGapCount
      })
    );
  }

  recordPracticeActivityGenerated(
    learningLoopId: LearningLoopId,
    practiceActivityId: PracticeActivityId,
    kind: PracticeActivityKind,
    targetKnowledgeGapIds: readonly KnowledgeGapId[],
    sourceMasterDataItemIds: readonly MasterDataItemId[]
  ): void {
    this.items.push(
      makeEvent(this.workspaceId, "practice-activity.generated", {
        learningLoopId,
        practiceActivityId,
        kind,
        targetKnowledgeGapIds: [...targetKnowledgeGapIds],
        sourceMasterDataItemIds: [...sourceMasterDataItemIds]
      })
    );
  }

  recordPracticeActivityCompleted(
    learningLoopId: LearningLoopId,
    practiceActivityId: PracticeActivityId,
    activeReviewSessionId: ActiveReviewSessionId,
    masteryScore: number
  ): void {
    this.items.push(
      makeEvent(this.workspaceId, "practice-activity.completed", {
        activeReviewSessionId,
        learningLoopId,
        practiceActivityId,
        masteryScore
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
