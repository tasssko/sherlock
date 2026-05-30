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
import { NextActionProjector } from "../learning/NextActionProjector.js";
import type { RuntimeTraceSeed } from "../runtime/RuntimeTrace.js";

export interface InitialAssessmentAggregate {
  workspace: Workspace;
  learningLoop: LearningLoop;
  agent: Agent;
  task: Task;
  assessment: Assessment;
  artifact: Artifact<AssessmentArtifactContent, "assessment">;
  events: readonly DomainEvent[];
  runtimeTrace?: RuntimeTraceSeed;
}

export class AssessmentProjector {
  private readonly nextActionProjector = new NextActionProjector();

  project(aggregate: InitialAssessmentAggregate): InitialAssessmentResponse {
    return {
      learningLoopId: aggregate.learningLoop.id,
      phase: aggregate.learningLoop.phase,
      nextAction: this.nextActionProjector.project({
        learningLoop: aggregate.learningLoop,
        assessmentId: aggregate.assessment.id
      }),
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
