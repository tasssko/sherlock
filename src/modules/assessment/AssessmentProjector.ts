import type { Assessment } from "../../domain/learning/Assessment.js";
import type { LearningLoop } from "../../domain/learning/LearningLoop.js";
import type { Agent } from "../../domain/primitives/Agent.js";
import type { Artifact } from "../../domain/primitives/Artifact.js";
import type { DomainEvent } from "../../domain/primitives/Event.js";
import type { Task } from "../../domain/primitives/Task.js";
import type { Workspace } from "../../domain/primitives/Workspace.js";
import type {
  AssessmentArtifactContent,
  InitialAssessmentResponse
} from "../../domain/study/AssessmentGeneration.js";

export interface InitialAssessmentAggregate {
  workspace: Workspace;
  learningLoop: LearningLoop;
  agent: Agent;
  task: Task;
  assessment: Assessment;
  artifact: Artifact<AssessmentArtifactContent, "assessment">;
  events: readonly DomainEvent[];
}

export class AssessmentProjector {
  project(aggregate: InitialAssessmentAggregate): InitialAssessmentResponse {
    return {
      workspace: aggregate.workspace.toSnapshot(),
      learningLoop: aggregate.learningLoop.toSnapshot(),
      agent: aggregate.agent.toSnapshot(),
      task: aggregate.task.toSnapshot(),
      assessment: aggregate.assessment.toSnapshot(),
      artifact: aggregate.artifact.toSnapshot(),
      events: aggregate.events.map((event) => ({
        ...event,
        payload: { ...event.payload }
      })) as readonly DomainEvent[]
    };
  }
}
