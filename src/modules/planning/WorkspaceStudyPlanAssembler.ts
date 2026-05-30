import type {
  KnowledgeGap,
  LearningLoop,
  MasteryProfile
} from "../../domain/learning/LearningLoop.js";
import { TaskGraph } from "../../domain/primitives/TaskGraph.js";
import type { DomainEventRecorder } from "../../domain/primitives/Event.js";
import type { Task } from "../../domain/primitives/Task.js";
import type { WorkPlan } from "../../domain/primitives/WorkPlan.js";
import { Workspace } from "../../domain/primitives/Workspace.js";
import type { Artifact } from "../../domain/primitives/Artifact.js";
import type { StudyPlanArtifactContent } from "../../domain/study/StudyPlanning.js";
import { ok, type Result } from "../../domain/primitives/result.js";
import type { StudyPlanAggregate } from "./StudyPlanProjector.js";
import type { Agent } from "../../domain/primitives/Agent.js";
import type { RuntimeTraceSeed } from "../runtime/RuntimeTrace.js";
import type { RuntimeConversationBinding } from "../runtime/RuntimeConversationBinding.js";

export interface WorkspaceStudyPlanAssemblerInput {
  agent: Agent;
  artifact: Artifact<StudyPlanArtifactContent, "study-plan">;
  completedChildTasks: readonly Task[];
  events: DomainEventRecorder;
  knowledgeGaps: readonly KnowledgeGap[];
  learningLoop: LearningLoop;
  masteryProfile?: MasteryProfile;
  parentTask: Task;
  runtimeConversationBinding?: RuntimeConversationBinding;
  runtimeTrace?: RuntimeTraceSeed;
  workPlan: WorkPlan;
  workspace: Workspace;
}

export class WorkspaceStudyPlanAssembler {
  assemble(input: WorkspaceStudyPlanAssemblerInput): Result<StudyPlanAggregate> {
    const tasks = [input.parentTask, ...input.completedChildTasks];
    const taskGraph = TaskGraph.create(input.parentTask.id, tasks);
    if (!taskGraph.ok) {
      return taskGraph;
    }

    let workspace = input.workspace;
    const learningLoop = input.learningLoop.recordStudyPlanAdapted(
      {
        workPlanId: input.workPlan.id,
        artifactId: input.artifact.id,
        diagnosedGapCount: input.knowledgeGaps.length
      },
      input.events
    );
    for (const task of tasks) {
      workspace = workspace.attachTask(task.id, input.events);
    }
    workspace = workspace.attachWorkPlan(input.workPlan.id, input.events);
    workspace = workspace.attachArtifact(input.artifact.id, input.events);

    const allEvents = input.events.all();
    workspace = workspace.appendEventLedger(allEvents.map((event) => event.id));

    return ok({
      workspace,
      learningLoop,
      agent: input.agent,
      tasks,
      taskGraph: taskGraph.value,
      blockedTaskIds: taskGraph.value.blockedTaskIds(tasks),
      workPlan: input.workPlan,
      artifact: input.artifact,
      knowledgeGaps: input.knowledgeGaps,
      masteryProfile: input.masteryProfile,
      events: allEvents,
      runtimeConversationBinding: input.runtimeConversationBinding,
      runtimeTrace: input.runtimeTrace
    });
  }
}
