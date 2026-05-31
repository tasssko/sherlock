import type { ActiveReviewSession } from "../../domain/learning/ActiveReviewSession.js";
import type { Assessment, Attempt, Evaluation } from "../../domain/learning/Assessment.js";
import type { LearningLoopBatch } from "../../domain/learning/LearningLoopBatch.js";
import { firstActionableLoopUnit } from "../../domain/learning/LoopUnit.js";
import type { LoopUnit } from "../../domain/learning/LoopUnit.js";
import type { LoopUnitQuestionAssignment } from "../../domain/learning/LoopUnitQuestionAssignment.js";
import type {
  KnowledgeGap,
  LearningLoop,
  MasteryProfile
} from "../../domain/learning/LearningLoop.js";
import type { PracticeActivity } from "../../domain/learning/PracticeActivity.js";
import type { QuestionSeed, QuestionVariant } from "../../domain/learning/QuestionBank.js";
import type { Artifact } from "../../domain/primitives/Artifact.js";
import type { DomainEvent } from "../../domain/primitives/Event.js";
import { TaskGraph } from "../../domain/primitives/TaskGraph.js";
import type { Task } from "../../domain/primitives/Task.js";
import type { WorkPlan } from "../../domain/primitives/WorkPlan.js";
import type { Workspace } from "../../domain/primitives/Workspace.js";
import type {
  AssessmentArtifactContent
} from "../../domain/study/AssessmentGeneration.js";
import type { LearningLoopResumeResponse } from "../../domain/study/LearningLoops.js";
import type { StudyPlanArtifactContent } from "../../domain/study/StudyPlanning.js";
import { NextActionProjector } from "./NextActionProjector.js";
import {
  projectLoopBatchFromCanonical,
  projectPracticeActivityFromCanonical
} from "../questions/QuestionBankLoopAdapter.js";

export interface LearningLoopResumeAggregate {
  workspace: Workspace;
  learningLoop: LearningLoop;
  currentAssessment?: Assessment;
  assessmentArtifact?: Artifact<AssessmentArtifactContent, "assessment">;
  latestAttempt?: Attempt;
  latestEvaluation?: Evaluation;
  knowledgeGaps: readonly KnowledgeGap[];
  masteryProfile?: MasteryProfile;
  studyPlan?: {
    artifact: Artifact<StudyPlanArtifactContent, "study-plan">;
    tasks: readonly Task[];
    workPlan: WorkPlan;
  };
  loopBatch?: LearningLoopBatch;
  loopUnits?: readonly LoopUnit[];
  loopUnitQuestionAssignments?: readonly LoopUnitQuestionAssignment[];
  questionSeeds?: readonly QuestionSeed[];
  questionVariants?: readonly QuestionVariant[];
  practiceActivities: readonly PracticeActivity[];
  currentPracticeActivity?: PracticeActivity;
  latestActiveReviewSession?: ActiveReviewSession;
  events: readonly DomainEvent[];
}

export class LearningLoopProjector {
  private readonly nextActionProjector = new NextActionProjector();

  project(aggregate: LearningLoopResumeAggregate): LearningLoopResumeResponse {
    const studyPlanRootTaskId = aggregate.studyPlan
      ? aggregate.studyPlan.artifact.taskId ?? aggregate.studyPlan.tasks[0]?.id
      : undefined;
    const projectedStudyPlan =
      aggregate.studyPlan && studyPlanRootTaskId
        ? TaskGraph.create(studyPlanRootTaskId, aggregate.studyPlan.tasks)
        : undefined;

    const taskGraph = projectedStudyPlan?.ok ? projectedStudyPlan.value : undefined;
    const blockedTaskIds = taskGraph?.blockedTaskIds(aggregate.studyPlan?.tasks ?? []) ?? [];
    const projectedLoopBatch = this.projectLoopBatch(aggregate);
    const projectedCurrentPracticeActivity = this.projectPracticeActivity(aggregate);
    const projectedPracticeActivities = aggregate.practiceActivities.map((activity) =>
      activity.id === aggregate.currentPracticeActivity?.id && projectedCurrentPracticeActivity
        ? projectedCurrentPracticeActivity
        : activity.toSnapshot()
    );

    return {
      learningLoopId: aggregate.learningLoop.id,
      phase: aggregate.learningLoop.phase,
      nextAction: this.nextActionProjector.project({
        learningLoop: aggregate.learningLoop,
        assessmentId: aggregate.currentAssessment?.id,
        loopBatch: aggregate.loopBatch,
        loopUnits: aggregate.loopUnits,
        practiceActivityId: projectedCurrentPracticeActivity?.id ?? aggregate.currentPracticeActivity?.id,
        workPlanId: aggregate.studyPlan?.workPlan.id
      }),
      workspace: aggregate.workspace.toSnapshot(),
      learningLoop: aggregate.learningLoop.toSnapshot(),
      currentAssessment: aggregate.currentAssessment?.toSnapshot(),
      assessmentArtifact: aggregate.assessmentArtifact?.toSnapshot(),
      latestAttempt: aggregate.latestAttempt?.toSnapshot(),
      latestEvaluation: aggregate.latestEvaluation?.toSnapshot(),
      knowledgeGaps: aggregate.knowledgeGaps.map((gap) => gap.toSnapshot()),
      masteryProfile: aggregate.masteryProfile?.toSnapshot(),
      loopBatch: projectedLoopBatch,
      studyPlan:
        aggregate.studyPlan && taskGraph
          ? {
              artifact: aggregate.studyPlan.artifact.toSnapshot(),
              blockedTaskIds,
              taskGraph: taskGraph.toSnapshot(),
              tasks: aggregate.studyPlan.tasks.map((task) => task.toSnapshot()),
              workPlan: aggregate.studyPlan.workPlan.toSnapshot()
            }
          : undefined,
      practiceActivities: projectedPracticeActivities,
      currentPracticeActivity: projectedCurrentPracticeActivity,
      latestActiveReviewSession: aggregate.latestActiveReviewSession?.toSnapshot(),
      events: aggregate.events.map((event) => ({
        ...event,
        payload: { ...event.payload }
      })) as readonly DomainEvent[]
    };
  }

  private projectLoopBatch(
    aggregate: LearningLoopResumeAggregate
  ): LearningLoopResumeResponse["loopBatch"] {
    const compatibilityLoopBatch = aggregate.loopBatch?.toSnapshot();
    const hasCanonicalLoopStructure =
      (aggregate.loopUnits?.length ?? 0) > 0 ||
      (aggregate.loopUnitQuestionAssignments?.length ?? 0) > 0 ||
      (aggregate.questionVariants?.length ?? 0) > 0;

    if (!compatibilityLoopBatch && !hasCanonicalLoopStructure) {
      return undefined;
    }

    return projectLoopBatchFromCanonical({
      // Resume should prefer canonical loop/unit/variant state. The persisted
      // loopBatch snapshot is only a compatibility wrapper and fallback source
      // for fields canonical rows do not yet carry.
      loopBatch: compatibilityLoopBatch,
      learningLoopId: aggregate.learningLoop.id,
      loopUnits: aggregate.loopUnits ?? [],
      loopUnitQuestionAssignments: aggregate.loopUnitQuestionAssignments ?? [],
      questionSeeds: aggregate.questionSeeds ?? [],
      questionVariants: aggregate.questionVariants ?? []
    });
  }

  private projectPracticeActivity(
    aggregate: LearningLoopResumeAggregate
  ): LearningLoopResumeResponse["currentPracticeActivity"] {
    const activeLoopUnitId =
      firstActionableLoopUnit(aggregate.loopUnits ?? [])?.id ??
      aggregate.loopBatch?.firstActionableUnit()?.id;

    return projectPracticeActivityFromCanonical({
      // Current practice projection is canonical-first. The saved practice
      // snapshot remains an explicit compatibility fallback when there is no
      // actionable canonical unit/assignment state to project from.
      practiceActivity: aggregate.currentPracticeActivity?.toSnapshot(),
      learningLoopId: aggregate.learningLoop.id,
      activeLoopUnitId,
      loopUnitQuestionAssignments: aggregate.loopUnitQuestionAssignments ?? [],
      questionSeeds: aggregate.questionSeeds ?? [],
      questionVariants: aggregate.questionVariants ?? []
    });
  }
}
