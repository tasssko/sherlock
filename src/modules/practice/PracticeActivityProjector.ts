import type { ActiveReviewSession } from "../../domain/learning/ActiveReviewSession.js";
import type { LearningLoop, MasteryProfile } from "../../domain/learning/LearningLoop.js";
import type { LoopUnit } from "../../domain/learning/LoopUnit.js";
import type { LoopUnitQuestionAssignment } from "../../domain/learning/LoopUnitQuestionAssignment.js";
import type { MasteryState } from "../../domain/learning/MasteryState.js";
import type { PracticeActivity } from "../../domain/learning/PracticeActivity.js";
import { firstActionableLoopUnit } from "../../domain/learning/LoopUnit.js";
import type { QuestionSeed, QuestionVariant } from "../../domain/learning/QuestionBank.js";
import type { Agent } from "../../domain/primitives/Agent.js";
import type { DomainEvent } from "../../domain/primitives/Event.js";
import type { Task } from "../../domain/primitives/Task.js";
import type { Workspace } from "../../domain/primitives/Workspace.js";
import type {
  PracticeActivityCompletionResponse,
  PracticeActivityListResponse,
  PracticeActivityResponse
} from "../../domain/study/PracticeActivities.js";
import { NextActionProjector } from "../learning/NextActionProjector.js";
import type { RuntimeTraceSeed } from "../runtime/RuntimeTrace.js";
import { projectMasteryProfile as projectCanonicalMasteryProfile } from "../mastery/MasteryStateService.js";
import { projectPracticeActivityFromCanonical } from "../questions/QuestionBankLoopAdapter.js";

export interface PracticeActivityAggregate {
  workspace: Workspace;
  learningLoop: LearningLoop;
  agent: Agent;
  task: Task;
  practiceActivity: PracticeActivity;
  loopUnits?: readonly LoopUnit[];
  loopUnitQuestionAssignments?: readonly LoopUnitQuestionAssignment[];
  questionSeeds?: readonly QuestionSeed[];
  questionVariants?: readonly QuestionVariant[];
  events: readonly DomainEvent[];
  runtimeTrace?: RuntimeTraceSeed;
}

export interface PracticeActivityCompletionAggregate {
  activeReviewSession: ActiveReviewSession;
  workspace: Workspace;
  learningLoop: LearningLoop;
  practiceActivity: PracticeActivity;
  masteryProfile: MasteryProfile;
  masteryStates?: readonly MasteryState[];
  loopUnits?: readonly LoopUnit[];
  loopUnitQuestionAssignments?: readonly LoopUnitQuestionAssignment[];
  questionSeeds?: readonly QuestionSeed[];
  questionVariants?: readonly QuestionVariant[];
  events: readonly DomainEvent[];
}

export class PracticeActivityProjector {
  private readonly nextActionProjector = new NextActionProjector();

  project(aggregate: PracticeActivityAggregate): PracticeActivityResponse {
    return {
      learningLoopId: aggregate.learningLoop.id,
      phase: aggregate.learningLoop.phase,
      nextAction: this.nextActionProjector.project({
        learningLoop: aggregate.learningLoop,
        practiceActivityId: aggregate.practiceActivity.id
      }),
      workspace: aggregate.workspace.toSnapshot(),
      learningLoop: aggregate.learningLoop.toSnapshot(),
      agent: aggregate.agent.toSnapshot(),
      task: aggregate.task.toSnapshot(),
      practiceActivity: aggregate.practiceActivity.toSnapshot(),
      events: aggregate.events.map((event) => ({
        ...event,
        payload: { ...event.payload }
      })) as readonly DomainEvent[]
    };
  }

  projectCompletion(
    aggregate: PracticeActivityCompletionAggregate
  ): PracticeActivityCompletionResponse {
    const projectedPracticeActivity = this.projectPracticeActivity(aggregate);
    const projectedMasteryProfile = this.projectMasteryProfile(aggregate);
    return {
      learningLoopId: aggregate.learningLoop.id,
      phase: aggregate.learningLoop.phase,
      nextAction: this.nextActionProjector.project({
        learningLoop: aggregate.learningLoop,
        practiceActivityId: projectedPracticeActivity.id
      }),
      workspace: aggregate.workspace.toSnapshot(),
      learningLoop: aggregate.learningLoop.toSnapshot(),
      practiceActivity: projectedPracticeActivity,
      activeReviewSession: aggregate.activeReviewSession.toSnapshot(),
      masteryProfile: projectedMasteryProfile.toSnapshot(),
      events: aggregate.events.map((event) => ({
        ...event,
        payload: { ...event.payload }
      })) as readonly DomainEvent[]
    };
  }

  projectList(input: {
    learningLoop: LearningLoop;
    practiceActivities: readonly PracticeActivity[];
    loopUnits?: readonly LoopUnit[];
    loopUnitQuestionAssignments?: readonly LoopUnitQuestionAssignment[];
    questionSeeds?: readonly QuestionSeed[];
    questionVariants?: readonly QuestionVariant[];
  }): PracticeActivityListResponse {
    const activeLoopUnitId = firstActionableLoopUnit(input.loopUnits ?? [])?.id;
    const projectedPracticeActivities = input.practiceActivities.map((activity) =>
      projectPracticeActivityFromCanonical({
        practiceActivity: activity.toSnapshot(),
        learningLoopId: input.learningLoop.id,
        activeLoopUnitId,
        loopUnitQuestionAssignments: input.loopUnitQuestionAssignments ?? [],
        questionSeeds: input.questionSeeds ?? [],
        questionVariants: input.questionVariants ?? []
      }) ?? activity.toSnapshot()
    );
    return {
      learningLoopId: input.learningLoop.id,
      phase: input.learningLoop.phase,
      nextAction: this.nextActionProjector.project({
        learningLoop: input.learningLoop,
        practiceActivityId: projectedPracticeActivities[0]?.id
      }),
      learningLoop: input.learningLoop.toSnapshot(),
      practiceActivities: projectedPracticeActivities
    };
  }

  private projectPracticeActivity(
    aggregate:
      | PracticeActivityAggregate
      | PracticeActivityCompletionAggregate
  ) {
    const activeLoopUnitId = firstActionableLoopUnit(aggregate.loopUnits ?? [])?.id;
    return (
      projectPracticeActivityFromCanonical({
        practiceActivity: aggregate.practiceActivity.toSnapshot(),
        learningLoopId: aggregate.learningLoop.id,
        activeLoopUnitId,
        loopUnitQuestionAssignments: aggregate.loopUnitQuestionAssignments ?? [],
        questionSeeds: aggregate.questionSeeds ?? [],
        questionVariants: aggregate.questionVariants ?? []
      }) ?? aggregate.practiceActivity.toSnapshot()
    );
  }

  private projectMasteryProfile(
    aggregate: PracticeActivityCompletionAggregate
  ): MasteryProfile {
    const topicStates = (aggregate.masteryStates ?? []).filter(
      (candidate) =>
        candidate.learningLoopId === aggregate.learningLoop.id &&
        candidate.toSnapshot().seedId === undefined
    );
    if (topicStates.length === 0) {
      // Completion responses should reflect canonical mastery when it exists.
      // The stored mastery profile remains only a compatibility fallback.
      return aggregate.masteryProfile;
    }

    return projectCanonicalMasteryProfile({
      existingProfile: aggregate.masteryProfile,
      learningLoop: aggregate.learningLoop,
      topicStates
    });
  }
}
