export type Brand<TValue, TBrand extends string> = TValue & {
  readonly __brand: TBrand;
};

export type AgentId = Brand<string, "AgentId">;
export type ActiveReviewSessionId = Brand<string, "ActiveReviewSessionId">;
export type ArtifactId = Brand<string, "ArtifactId">;
export type AssessmentId = Brand<string, "AssessmentId">;
export type AttemptId = Brand<string, "AttemptId">;
export type EventId = Brand<string, "EventId">;
export type EvaluationId = Brand<string, "EvaluationId">;
export type KnowledgeGapId = Brand<string, "KnowledgeGapId">;
export type LearnerEvidenceId = Brand<string, "LearnerEvidenceId">;
export type LearningLoopBatchId = Brand<string, "LearningLoopBatchId">;
export type LearningLoopId = Brand<string, "LearningLoopId">;
export type LearningLoopUnitId = Brand<string, "LearningLoopUnitId">;
export type LoopUnitQuestionAssignmentId = Brand<string, "LoopUnitQuestionAssignmentId">;
export type MasterDataItemId = Brand<string, "MasterDataItemId">;
export type MasterDataSourceId = Brand<string, "MasterDataSourceId">;
export type MasteryStateId = Brand<string, "MasteryStateId">;
export type MasteryProfileId = Brand<string, "MasteryProfileId">;
export type PracticeActivityId = Brand<string, "PracticeActivityId">;
export type QuestionSeedId = Brand<string, "QuestionSeedId">;
export type QuestionVariantId = Brand<string, "QuestionVariantId">;
export type RuntimeTraceId = Brand<string, "RuntimeTraceId">;
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

export function createActiveReviewSessionId(): ActiveReviewSessionId {
  return createId("review") as ActiveReviewSessionId;
}

export function createArtifactId(): ArtifactId {
  return createId("artifact") as ArtifactId;
}

export function createAssessmentId(): AssessmentId {
  return createId("assessment") as AssessmentId;
}

export function createAttemptId(): AttemptId {
  return createId("attempt") as AttemptId;
}

export function createEventId(): EventId {
  return createId("event") as EventId;
}

export function createEvaluationId(): EvaluationId {
  return createId("evaluation") as EvaluationId;
}

export function createKnowledgeGapId(): KnowledgeGapId {
  return createId("gap") as KnowledgeGapId;
}

export function createLearnerEvidenceId(): LearnerEvidenceId {
  return createId("evidence") as LearnerEvidenceId;
}

export function createLearningLoopBatchId(): LearningLoopBatchId {
  return createId("loop_batch") as LearningLoopBatchId;
}

export function createLearningLoopId(): LearningLoopId {
  return createId("loop") as LearningLoopId;
}

export function createLearningLoopUnitId(): LearningLoopUnitId {
  return createId("loop_unit") as LearningLoopUnitId;
}

export function createLoopUnitQuestionAssignmentId(): LoopUnitQuestionAssignmentId {
  return createId("loop_assignment") as LoopUnitQuestionAssignmentId;
}

export function createMasterDataItemId(): MasterDataItemId {
  return createId("master_item") as MasterDataItemId;
}

export function createMasterDataSourceId(): MasterDataSourceId {
  return createId("master_source") as MasterDataSourceId;
}

export function createMasteryProfileId(): MasteryProfileId {
  return createId("mastery") as MasteryProfileId;
}

export function createMasteryStateId(): MasteryStateId {
  return createId("mastery_state") as MasteryStateId;
}

export function createPracticeActivityId(): PracticeActivityId {
  return createId("practice") as PracticeActivityId;
}

export function createQuestionSeedId(): QuestionSeedId {
  return createId("question_seed") as QuestionSeedId;
}

export function createQuestionVariantId(): QuestionVariantId {
  return createId("question_variant") as QuestionVariantId;
}

export function createRuntimeTraceId(): RuntimeTraceId {
  return createId("runtime_trace") as RuntimeTraceId;
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
