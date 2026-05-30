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

export interface PracticeActivityAggregate {
  workspace: Workspace;
  learningLoop: LearningLoop;
  agent: Agent;
  task: Task;
  practiceActivity: PracticeActivity;
  events: readonly DomainEvent[];
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
  project(aggregate: PracticeActivityAggregate): PracticeActivityResponse {
    return {
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
      learningLoop: input.learningLoop.toSnapshot(),
      practiceActivities: input.practiceActivities.map((activity) => activity.toSnapshot())
    };
  }
}
