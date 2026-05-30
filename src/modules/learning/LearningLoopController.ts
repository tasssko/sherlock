import { err, ok, type Result } from "../../domain/primitives/result.js";
import type { DomainEvent } from "../../domain/primitives/Event.js";
import type { LearningLoopResumeResponse } from "../../domain/study/LearningLoops.js";
import type { LearningLoopRepository } from "../planning/LearningLoopRepository.js";
import type { Task } from "../../domain/primitives/Task.js";
import { LearningLoopProjector } from "./LearningLoopProjector.js";

export class LearningLoopController {
  constructor(
    private readonly repository: LearningLoopRepository,
    private readonly projector = new LearningLoopProjector()
  ) {}

  get(learningLoopId: string): Result<LearningLoopResumeResponse> {
    const located = this.repository.findRecordByLearningLoopId(learningLoopId as never);
    if (!located) {
      return err({
        code: "NOT_FOUND",
        message: `Learning loop ${learningLoopId} was not found.`
      });
    }

    const learningLoop = located.record.learningLoops.find(
      (candidate) => candidate.id === (learningLoopId as never)
    );
    if (!learningLoop) {
      return err({
        code: "NOT_FOUND",
        message: `Learning loop ${learningLoopId} was not found.`
      });
    }

    const currentAssessment = located.record.assessments
      .filter((candidate) => candidate.learningLoopId === learningLoop.id)
      .at(-1);
    const assessmentArtifact = currentAssessment?.toSnapshot().artifactId
      ? located.record.artifacts.find(
          (candidate) => candidate.id === currentAssessment.toSnapshot().artifactId
        )
      : undefined;
    const latestAttempt = currentAssessment
      ? located.record.attempts.filter((candidate) => candidate.assessmentId === currentAssessment.id).at(-1)
      : undefined;
    const latestEvaluation = latestAttempt
      ? located.record.evaluations
          .filter((candidate) => candidate.toSnapshot().attemptId === latestAttempt.id)
          .at(-1)
      : undefined;
    const knowledgeGaps = located.record.knowledgeGaps.filter((candidate) =>
      learningLoop.knowledgeGapIds.includes(candidate.id)
    );
    const masteryProfile = learningLoop.masteryProfileId
      ? located.record.masteryProfiles.find((candidate) => candidate.id === learningLoop.masteryProfileId)
      : undefined;
    const studyPlanArtifact = located.record.artifacts
      .filter(
        (candidate) =>
          learningLoop.toSnapshot().artifactIds.includes(candidate.id) && candidate.type === "study-plan"
      )
      .at(-1);
    const workPlan = located.record.workPlans
      .filter((candidate) => learningLoop.toSnapshot().workPlanIds.includes(candidate.id))
      .at(-1);
    const studyPlanTasks =
      studyPlanArtifact?.taskId
        ? this.collectTaskSubgraph(located.record.tasks, studyPlanArtifact.taskId)
        : [];
    const practiceActivities = located.record.practiceActivities.filter((candidate) =>
      candidate.learningLoopId === learningLoop.id
    );
    const currentPracticeActivity = practiceActivities.at(-1);
    const latestActiveReviewSession = currentPracticeActivity?.reviewSessionIds.length
      ? located.record.activeReviewSessions.find(
          (candidate) =>
            candidate.id === currentPracticeActivity.reviewSessionIds[currentPracticeActivity.reviewSessionIds.length - 1]
        )
      : located.record.activeReviewSessions
          .filter((candidate) => candidate.toSnapshot().learningLoopId === learningLoop.id)
          .at(-1);

    const relatedTaskIds = new Set<string>();
    if (studyPlanArtifact?.taskId) {
      relatedTaskIds.add(studyPlanArtifact.taskId);
    }
    const practiceTaskId = currentPracticeActivity?.toSnapshot().taskId;
    if (practiceTaskId) {
      relatedTaskIds.add(practiceTaskId);
    }
    for (const task of studyPlanTasks) {
      relatedTaskIds.add(task.id);
    }

    const relatedArtifactIds = new Set(learningLoop.toSnapshot().artifactIds);
    const relatedAssessmentIds = new Set(learningLoop.toSnapshot().assessmentIds);
    const relatedAttemptIds = new Set(learningLoop.toSnapshot().attemptIds);
    const relatedEvaluationIds = new Set(learningLoop.toSnapshot().evaluationIds);
    const relatedPracticeActivityIds = new Set(learningLoop.toSnapshot().practiceActivityIds);
    const relatedWorkPlanIds = new Set(learningLoop.toSnapshot().workPlanIds);
    const relatedReviewIds = new Set(learningLoop.toSnapshot().activeReviewSessionIds);

    const events = located.record.events.filter((event) =>
      this.isLoopRelatedEvent(event, {
        learningLoopId: learningLoop.id,
        relatedArtifactIds,
        relatedAssessmentIds,
        relatedAttemptIds,
        relatedEvaluationIds,
        relatedPracticeActivityIds,
        relatedReviewIds,
        relatedTaskIds,
        relatedWorkPlanIds
      })
    );

    return ok(
      this.projector.project({
        workspace: located.record.workspace,
        learningLoop,
        currentAssessment,
        assessmentArtifact: assessmentArtifact as never,
        latestAttempt,
        latestEvaluation,
        knowledgeGaps,
        masteryProfile,
        studyPlan:
          studyPlanArtifact && workPlan && studyPlanTasks.length > 0
            ? {
                artifact: studyPlanArtifact as never,
                tasks: studyPlanTasks,
                workPlan
              }
            : undefined,
        practiceActivities,
        currentPracticeActivity,
        latestActiveReviewSession,
        events
      })
    );
  }

  private collectTaskSubgraph(tasks: readonly Task[], rootTaskId: string): Task[] {
    const taskById = new Map(tasks.map((task) => [task.id, task]));
    const queue = [rootTaskId];
    const visited = new Set<string>();
    const collected: Task[] = [];

    while (queue.length > 0) {
      const taskId = queue.shift();
      if (!taskId || visited.has(taskId)) {
        continue;
      }
      visited.add(taskId);
      const task = taskById.get(taskId as never);
      if (!task) {
        continue;
      }
      collected.push(task);
      for (const childTaskId of task.childTaskIds) {
        queue.push(childTaskId);
      }
    }

    return collected;
  }

  private isLoopRelatedEvent(
    event: DomainEvent,
    input: {
      learningLoopId: string;
      relatedArtifactIds: ReadonlySet<string>;
      relatedAssessmentIds: ReadonlySet<string>;
      relatedAttemptIds: ReadonlySet<string>;
      relatedEvaluationIds: ReadonlySet<string>;
      relatedPracticeActivityIds: ReadonlySet<string>;
      relatedReviewIds: ReadonlySet<string>;
      relatedTaskIds: ReadonlySet<string>;
      relatedWorkPlanIds: ReadonlySet<string>;
    }
  ) {
    const payload = event.payload as Record<string, unknown>;

    return (
      payload.learningLoopId === input.learningLoopId ||
      (typeof payload.artifactId === "string" && input.relatedArtifactIds.has(payload.artifactId)) ||
      (typeof payload.assessmentId === "string" && input.relatedAssessmentIds.has(payload.assessmentId)) ||
      (typeof payload.attemptId === "string" && input.relatedAttemptIds.has(payload.attemptId)) ||
      (typeof payload.evaluationId === "string" && input.relatedEvaluationIds.has(payload.evaluationId)) ||
      (typeof payload.practiceActivityId === "string" &&
        input.relatedPracticeActivityIds.has(payload.practiceActivityId)) ||
      (typeof payload.activeReviewSessionId === "string" &&
        input.relatedReviewIds.has(payload.activeReviewSessionId)) ||
      (typeof payload.taskId === "string" && input.relatedTaskIds.has(payload.taskId)) ||
      (typeof payload.workPlanId === "string" && input.relatedWorkPlanIds.has(payload.workPlanId))
    );
  }
}
