import type { ActiveReviewSession } from "../../domain/learning/ActiveReviewSession.js";
import type { LearningLoop, MasteryProfile } from "../../domain/learning/LearningLoop.js";
import type { PracticeActivity } from "../../domain/learning/PracticeActivity.js";
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

export interface PracticeActivityAggregate {
  workspace: Workspace;
  learningLoop: LearningLoop;
  agent: Agent;
  task: Task;
  practiceActivity: PracticeActivity;
  events: readonly DomainEvent[];
  runtimeTrace?: RuntimeTraceSeed;
}

export interface PracticeActivityCompletionAggregate {
  activeReviewSession: ActiveReviewSession;
  workspace: Workspace;
  learningLoop: LearningLoop;
  practiceActivity: PracticeActivity;
  masteryProfile: MasteryProfile;
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
    return {
      learningLoopId: aggregate.learningLoop.id,
      phase: aggregate.learningLoop.phase,
      nextAction: this.nextActionProjector.project({
        learningLoop: aggregate.learningLoop,
        practiceActivityId: aggregate.practiceActivity.id
      }),
      workspace: aggregate.workspace.toSnapshot(),
      learningLoop: aggregate.learningLoop.toSnapshot(),
      practiceActivity: aggregate.practiceActivity.toSnapshot(),
      activeReviewSession: aggregate.activeReviewSession.toSnapshot(),
      masteryProfile: aggregate.masteryProfile.toSnapshot(),
      events: aggregate.events.map((event) => ({
        ...event,
        payload: { ...event.payload }
      })) as readonly DomainEvent[]
    };
  }

  projectList(input: {
    learningLoop: LearningLoop;
    practiceActivities: readonly PracticeActivity[];
  }): PracticeActivityListResponse {
    return {
      learningLoopId: input.learningLoop.id,
      phase: input.learningLoop.phase,
      nextAction: this.nextActionProjector.project({
        learningLoop: input.learningLoop,
        practiceActivityId: input.practiceActivities[0]?.id
      }),
      learningLoop: input.learningLoop.toSnapshot(),
      practiceActivities: input.practiceActivities.map((activity) => activity.toSnapshot())
    };
  }
}
