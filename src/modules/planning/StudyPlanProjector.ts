import type {
  KnowledgeGap,
  LearningLoop,
  MasteryProfile
} from "../../domain/learning/LearningLoop.js";
import type { Agent } from "../../domain/primitives/Agent.js";
import type { Artifact } from "../../domain/primitives/Artifact.js";
import type { DomainEvent } from "../../domain/primitives/Event.js";
import type { TaskGraph } from "../../domain/primitives/TaskGraph.js";
import type { Task } from "../../domain/primitives/Task.js";
import type { WorkPlan } from "../../domain/primitives/WorkPlan.js";
import type { Workspace } from "../../domain/primitives/Workspace.js";
import type { TaskId } from "../../domain/primitives/ids.js";
import type {
  StudyPlanArtifactContent,
  StudyPlanResponse
} from "../../domain/study/StudyPlanning.js";

export interface StudyPlanAggregate {
  workspace: Workspace;
  learningLoop: LearningLoop;
  agent: Agent;
  tasks: readonly Task[];
  taskGraph: TaskGraph;
  blockedTaskIds: readonly TaskId[];
  workPlan: WorkPlan;
  artifact: Artifact<StudyPlanArtifactContent, "study-plan">;
  knowledgeGaps: readonly KnowledgeGap[];
  masteryProfile?: MasteryProfile;
  events: readonly DomainEvent[];
}

export class StudyPlanProjector {
  project(aggregate: StudyPlanAggregate): StudyPlanResponse {
    return {
      workspace: aggregate.workspace.toSnapshot(),
      learningLoop: aggregate.learningLoop.toSnapshot(),
      agent: aggregate.agent.toSnapshot(),
      tasks: aggregate.tasks.map((task) => task.toSnapshot()),
      taskGraph: aggregate.taskGraph.toSnapshot(),
      blockedTaskIds: [...aggregate.blockedTaskIds],
      workPlan: aggregate.workPlan.toSnapshot(),
      artifact: aggregate.artifact.toSnapshot(),
      knowledgeGaps: aggregate.knowledgeGaps.map((gap) => gap.toSnapshot()),
      masteryProfile: aggregate.masteryProfile?.toSnapshot(),
      events: aggregate.events.map((event) => ({
        ...event,
        payload: { ...event.payload }
      })) as readonly DomainEvent[]
    };
  }
}
