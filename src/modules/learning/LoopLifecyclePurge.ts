import { Workspace } from "../../domain/primitives/Workspace.js";
import { err, ok, type Result } from "../../domain/primitives/result.js";
import type { DomainEvent } from "../../domain/primitives/Event.js";
import type { RuntimeTrace } from "../runtime/RuntimeTrace.js";
import {
  createLearningLoopRecord,
  type LearningLoopRecord
} from "../planning/LearningLoopRepository.js";
import type { LearnerWorkspaceKey } from "../planning/LearnerWorkspaceKey.js";

export interface LearningLoopPurgeCandidate {
  learnerKey: string;
  learningLoopId: string;
  topic: string;
  phase: string;
  status: string;
  reason: string;
}

export function findPurgeableLearningLoops(
  learnerKey: LearnerWorkspaceKey,
  record: LearningLoopRecord
): readonly LearningLoopPurgeCandidate[] {
  return record.learningLoops
    .filter((loop) => loop.status !== "active")
    .map((loop) => ({
      learnerKey: learnerKey.value,
      learningLoopId: loop.id,
      topic: loop.topic,
      phase: loop.phase,
      status: loop.status,
      reason: `loop is ${loop.status} and no longer part of the active learner journey`
    }));
}

export function purgeLearningLoops(
  record: LearningLoopRecord,
  learningLoopIds: readonly string[]
): Result<LearningLoopRecord> {
  if (learningLoopIds.length === 0) {
    return err({
      code: "VALIDATION_ERROR",
      message: "At least one learning loop id is required for purge."
    });
  }

  const targetLoops = record.learningLoops.filter((loop) =>
    learningLoopIds.includes(loop.id)
  );
  if (targetLoops.length !== learningLoopIds.length) {
    const missingId = learningLoopIds.find(
      (learningLoopId) => !targetLoops.some((loop) => loop.id === learningLoopId)
    );
    return err({
      code: "NOT_FOUND",
      message: `Learning loop ${missingId} was not found in the selected record.`
    });
  }

  const activeTarget = targetLoops.find((loop) => loop.status === "active");
  if (activeTarget) {
    return err({
      code: "STATE_CONFLICT",
      message: `Learning loop ${activeTarget.id} is still active and cannot be purged.`
    });
  }

  const purgeLoopIds = new Set(targetLoops.map((loop) => loop.id));
  const purgeAssessmentIds = new Set<string>();
  const purgeAttemptIds = new Set<string>();
  const purgeEvaluationIds = new Set<string>();
  const purgeKnowledgeGapIds = new Set<string>();
  const purgeWorkPlanIds = new Set<string>();
  const purgeArtifactIds = new Set<string>();
  const purgePracticeActivityIds = new Set<string>();
  const purgeActiveReviewSessionIds = new Set<string>();
  const purgeMasteryProfileIds = new Set<string>();
  const purgeTaskIds = new Set<string>();

  for (const loop of targetLoops) {
    const snapshot = loop.toSnapshot();
    snapshot.assessmentIds.forEach((id) => purgeAssessmentIds.add(id));
    snapshot.attemptIds.forEach((id) => purgeAttemptIds.add(id));
    snapshot.evaluationIds.forEach((id) => purgeEvaluationIds.add(id));
    snapshot.knowledgeGapIds.forEach((id) => purgeKnowledgeGapIds.add(id));
    snapshot.workPlanIds.forEach((id) => purgeWorkPlanIds.add(id));
    snapshot.artifactIds.forEach((id) => purgeArtifactIds.add(id));
    snapshot.practiceActivityIds.forEach((id) => purgePracticeActivityIds.add(id));
    snapshot.activeReviewSessionIds.forEach((id) => purgeActiveReviewSessionIds.add(id));
    if (snapshot.masteryProfileId) {
      purgeMasteryProfileIds.add(snapshot.masteryProfileId);
    }
  }

  for (const assessment of record.assessments) {
    const snapshot = assessment.toSnapshot();
    if (purgeLoopIds.has(snapshot.learningLoopId)) {
      purgeAssessmentIds.add(snapshot.id);
      if (snapshot.artifactId) {
        purgeArtifactIds.add(snapshot.artifactId);
      }
    }
  }

  for (const attempt of record.attempts) {
    const snapshot = attempt.toSnapshot();
    if (purgeAssessmentIds.has(snapshot.assessmentId)) {
      purgeAttemptIds.add(snapshot.id);
    }
  }

  for (const evaluation of record.evaluations) {
    const snapshot = evaluation.toSnapshot();
    if (
      purgeAssessmentIds.has(snapshot.assessmentId) ||
      purgeAttemptIds.has(snapshot.attemptId)
    ) {
      purgeEvaluationIds.add(snapshot.id);
    }
  }

  for (const practiceActivity of record.practiceActivities) {
    const snapshot = practiceActivity.toSnapshot();
    if (purgeLoopIds.has(snapshot.learningLoopId)) {
      purgePracticeActivityIds.add(snapshot.id);
      if (snapshot.taskId) {
        purgeTaskIds.add(snapshot.taskId);
      }
      snapshot.reviewSessionIds.forEach((id) => purgeActiveReviewSessionIds.add(id));
    }
  }

  for (const activeReviewSession of record.activeReviewSessions) {
    const snapshot = activeReviewSession.toSnapshot();
    if (
      purgeLoopIds.has(snapshot.learningLoopId) ||
      purgePracticeActivityIds.has(snapshot.practiceActivityId)
    ) {
      purgeActiveReviewSessionIds.add(snapshot.id);
    }
  }

  for (const loopBatch of record.loopBatches) {
    const snapshot = loopBatch.toSnapshot();
    if (purgeLoopIds.has(snapshot.learningLoopId)) {
      purgeKnowledgeGapIdsForBatch(snapshot, purgeKnowledgeGapIds);
    }
  }

  let changed = true;
  while (changed) {
    changed = false;

    for (const workPlan of record.workPlans) {
      const snapshot = workPlan.toSnapshot();
      const referencesPurgedTask = snapshot.stages.some((stage) =>
        stage.taskIds.some((taskId) => purgeTaskIds.has(taskId))
      );
      const referencesPurgedArtifact = snapshot.artifactIds.some((artifactId) =>
        purgeArtifactIds.has(artifactId)
      );
      if (
        purgeWorkPlanIds.has(snapshot.id) ||
        referencesPurgedTask ||
        referencesPurgedArtifact
      ) {
        if (!purgeWorkPlanIds.has(snapshot.id)) {
          purgeWorkPlanIds.add(snapshot.id);
          changed = true;
        }
        snapshot.stages.forEach((stage) =>
          stage.taskIds.forEach((taskId) => purgeTaskIds.add(taskId))
        );
        snapshot.artifactIds.forEach((artifactId) => purgeArtifactIds.add(artifactId));
      }
    }

    for (const artifact of record.artifacts) {
      const snapshot = artifact.toSnapshot();
      const referencesPurgedArtifact = snapshot.provenance.sourceArtifactIds.some((artifactId) =>
        purgeArtifactIds.has(artifactId)
      );
      if (
        purgeArtifactIds.has(snapshot.id) ||
        (snapshot.taskId && purgeTaskIds.has(snapshot.taskId)) ||
        (snapshot.provenance.taskId && purgeTaskIds.has(snapshot.provenance.taskId)) ||
        referencesPurgedArtifact
      ) {
        if (!purgeArtifactIds.has(snapshot.id)) {
          purgeArtifactIds.add(snapshot.id);
          changed = true;
        }
        if (snapshot.taskId) {
          purgeTaskIds.add(snapshot.taskId);
        }
        if (snapshot.provenance.taskId) {
          purgeTaskIds.add(snapshot.provenance.taskId);
        }
      }
    }

    for (const task of record.tasks) {
      const snapshot = task.toSnapshot();
      if (
        purgeTaskIds.has(snapshot.id) ||
        (snapshot.parentTaskId && purgeTaskIds.has(snapshot.parentTaskId)) ||
        snapshot.childTaskIds.some((taskId) => purgeTaskIds.has(taskId)) ||
        snapshot.dependencies.some((taskId) => purgeTaskIds.has(taskId)) ||
        snapshot.output?.artifactIds.some((artifactId) => purgeArtifactIds.has(artifactId))
      ) {
        if (!purgeTaskIds.has(snapshot.id)) {
          purgeTaskIds.add(snapshot.id);
          changed = true;
        }
      }
    }
  }

  const purgeIds = new Set<string>([
    ...purgeLoopIds,
    ...purgeAssessmentIds,
    ...purgeAttemptIds,
    ...purgeEvaluationIds,
    ...purgeKnowledgeGapIds,
    ...purgeWorkPlanIds,
    ...purgeArtifactIds,
    ...purgePracticeActivityIds,
    ...purgeActiveReviewSessionIds,
    ...purgeMasteryProfileIds,
    ...purgeTaskIds
  ]);

  const learningLoops = record.learningLoops.filter((loop) => !purgeLoopIds.has(loop.id));
  const assessments = record.assessments.filter(
    (assessment) => !purgeAssessmentIds.has(assessment.id)
  );
  const attempts = record.attempts.filter((attempt) => !purgeAttemptIds.has(attempt.id));
  const evaluations = record.evaluations.filter(
    (evaluation) => !purgeEvaluationIds.has(evaluation.id)
  );
  const knowledgeGaps = record.knowledgeGaps.filter(
    (gap) => !purgeKnowledgeGapIds.has(gap.id)
  );
  const workPlans = record.workPlans.filter((workPlan) => !purgeWorkPlanIds.has(workPlan.id));
  const artifacts = record.artifacts.filter((artifact) => !purgeArtifactIds.has(artifact.id));
  const practiceActivities = record.practiceActivities.filter(
    (practiceActivity) => !purgePracticeActivityIds.has(practiceActivity.id)
  );
  const activeReviewSessions = record.activeReviewSessions.filter(
    (session) => !purgeActiveReviewSessionIds.has(session.id)
  );
  const masteryProfiles = record.masteryProfiles.filter(
    (profile) => !purgeMasteryProfileIds.has(profile.id)
  );
  const loopBatches = record.loopBatches.filter(
    (loopBatch) => !purgeLoopIds.has(loopBatch.learningLoopId)
  );
  const runtimeConversationBindings = record.runtimeConversationBindings.filter(
    (binding) => !purgeLoopIds.has(binding.learningLoopId)
  );
  const runtimeTraces = record.runtimeTraces.filter(
    (trace) => !runtimeTraceReferencesPurgedIds(trace, purgeIds)
  );
  const tasks = record.tasks.filter((task) => !purgeTaskIds.has(task.id));
  const events = record.events.filter((event) => !eventReferencesPurgedIds(event, purgeIds));

  const workspaceSnapshot = record.workspace.toSnapshot();
  const workspace = Workspace.rehydrate({
    ...workspaceSnapshot,
    taskIds: tasks.map((task) => task.id),
    workPlanIds: workPlans.map((workPlan) => workPlan.id),
    artifactIds: artifacts.map((artifact) => artifact.id),
    eventIds: events.map((event) => event.id),
    updatedAt: new Date().toISOString()
  });

  return ok(
    createLearningLoopRecord({
      workspace,
      tasks,
      workPlans,
      artifacts,
      events,
      learningLoops,
      assessments,
      attempts,
      evaluations,
      knowledgeGaps,
      masteryProfiles,
      practiceActivities,
      activeReviewSessions,
      loopBatches,
      runtimeConversationBindings,
      runtimeTraces
    })
  );
}

export function clearAllLearningLoops(record: LearningLoopRecord): LearningLoopRecord {
  const workspaceSnapshot = record.workspace.toSnapshot();
  const workspace = Workspace.rehydrate({
    ...workspaceSnapshot,
    taskIds: [],
    workPlanIds: [],
    artifactIds: [],
    eventIds: [],
    updatedAt: new Date().toISOString()
  });

  return createLearningLoopRecord({
    workspace,
    tasks: [],
    workPlans: [],
    artifacts: [],
    events: [],
    learningLoops: [],
    assessments: [],
    attempts: [],
    evaluations: [],
    knowledgeGaps: [],
    masteryProfiles: [],
    practiceActivities: [],
    activeReviewSessions: [],
    loopBatches: [],
    runtimeConversationBindings: [],
    runtimeTraces: []
  });
}

function purgeKnowledgeGapIdsForBatch(
  snapshot: ReturnType<LearningLoopRecord["loopBatches"][number]["toSnapshot"]>,
  purgeKnowledgeGapIds: Set<string>
): void {
  for (const unit of snapshot.units) {
    unit.targetKnowledgeGapIds.forEach((knowledgeGapId) =>
      purgeKnowledgeGapIds.add(knowledgeGapId)
    );
  }
}

function eventReferencesPurgedIds(event: DomainEvent, purgeIds: ReadonlySet<string>): boolean {
  return valueReferencesPurgedIds(event.payload, purgeIds);
}

function runtimeTraceReferencesPurgedIds(
  trace: RuntimeTrace,
  purgeIds: ReadonlySet<string>
): boolean {
  return valueReferencesPurgedIds(trace.toSnapshot(), purgeIds);
}

function valueReferencesPurgedIds(
  value: unknown,
  purgeIds: ReadonlySet<string>
): boolean {
  if (typeof value === "string") {
    return purgeIds.has(value);
  }
  if (Array.isArray(value)) {
    return value.some((entry) => valueReferencesPurgedIds(entry, purgeIds));
  }
  if (!value || typeof value !== "object") {
    return false;
  }

  return Object.values(value).some((entry) => valueReferencesPurgedIds(entry, purgeIds));
}
