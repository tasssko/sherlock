import type {
  KnowledgeGap,
  LearningLoop,
  MasteryProfile
} from "../../domain/learning/LearningLoop.js";
import type { MasteryState } from "../../domain/learning/MasteryState.js";
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
import { NextActionProjector } from "../learning/NextActionProjector.js";
import type { RuntimeTraceSeed } from "../runtime/RuntimeTrace.js";
import type { RuntimeConversationBinding } from "../runtime/RuntimeConversationBinding.js";
import { projectMasteryProfile as projectCanonicalMasteryProfile } from "../mastery/MasteryStateService.js";

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
  masteryStates?: readonly MasteryState[];
  events: readonly DomainEvent[];
  runtimeConversationBinding?: RuntimeConversationBinding;
  runtimeTrace?: RuntimeTraceSeed;
}

export class StudyPlanProjector {
  private readonly nextActionProjector = new NextActionProjector();

  project(aggregate: StudyPlanAggregate): StudyPlanResponse {
    const projectedMasteryProfile = this.projectMasteryProfile(aggregate);
    return {
      learningLoopId: aggregate.learningLoop.id,
      phase: aggregate.learningLoop.phase,
      nextAction: this.nextActionProjector.project({
        learningLoop: aggregate.learningLoop,
        workPlanId: aggregate.workPlan.id
      }),
      workspace: aggregate.workspace.toSnapshot(),
      learningLoop: aggregate.learningLoop.toSnapshot(),
      agent: aggregate.agent.toSnapshot(),
      tasks: aggregate.tasks.map((task) => task.toSnapshot()),
      taskGraph: aggregate.taskGraph.toSnapshot(),
      blockedTaskIds: [...aggregate.blockedTaskIds],
      workPlan: aggregate.workPlan.toSnapshot(),
      artifact: aggregate.artifact.toSnapshot(),
      knowledgeGaps: aggregate.knowledgeGaps.map((gap) => gap.toSnapshot()),
      masteryProfile: projectedMasteryProfile?.toSnapshot(),
      events: aggregate.events.map((event) => ({
        ...event,
        payload: { ...event.payload }
      })) as readonly DomainEvent[]
    };
  }

  private projectMasteryProfile(aggregate: StudyPlanAggregate): MasteryProfile | undefined {
    const topicStates = (aggregate.masteryStates ?? []).filter(
      (candidate) =>
        candidate.learningLoopId === aggregate.learningLoop.id &&
        candidate.toSnapshot().seedId === undefined
    );
    if (topicStates.length === 0) {
      // Study-plan responses should surface canonical topic mastery when it is
      // available. The stored mastery profile is preserved only as a
      // compatibility projection fallback.
      return aggregate.masteryProfile;
    }

    return projectCanonicalMasteryProfile({
      existingProfile: aggregate.masteryProfile,
      learningLoop: aggregate.learningLoop,
      topicStates
    });
  }
}
