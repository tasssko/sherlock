import { Task } from "../../domain/primitives/Task.js";
import type { DomainEventRecorder } from "../../domain/primitives/Event.js";
import type { ArtifactId, WorkspaceId } from "../../domain/primitives/ids.js";
import { ok, type Result } from "../../domain/primitives/result.js";
import type { StudyPlanningContext } from "../../domain/primitives/Context.js";

export interface StudyPlanTaskAssembly {
  parentTask: Task;
  childTasks: readonly Task[];
}

export interface CompleteStudyPlanTasksInput {
  artifactId: ArtifactId;
  artifactSummary: string;
  childTaskSummaries: readonly string[];
  taskAssembly: StudyPlanTaskAssembly;
}

export class StudyPlanTaskAssembler {
  create(
    context: StudyPlanningContext,
    workspaceId: WorkspaceId,
    events: DomainEventRecorder
  ): Result<StudyPlanTaskAssembly> {
    const parentTaskCreated = Task.create(
      {
        workspaceId,
        title: `Create weekly study plan for ${context.learnerName}`,
        kind: "study-plan",
        input: {
          objective: context.objective,
          facts: context.facts().map((fact) => `${fact.label}: ${fact.value}`)
        }
      },
      events
    );

    const childTasks = context.focusTopics.map((topic) =>
      Task.create(
        {
          workspaceId,
          title: `Plan ${topic} study block`,
          kind: "topic-plan",
          parentTaskId: parentTaskCreated.id,
          input: {
            objective: `Prepare a study session for ${topic}.`,
            facts: context.facts().map((fact) => `${fact.label}: ${fact.value}`),
            topic
          }
        },
        events
      )
    );

    const parentTask = parentTaskCreated
      .attachChildren(childTasks.map((task) => task.id))
      .dependOn(childTasks.map((task) => task.id));

    return ok({
      parentTask,
      childTasks
    });
  }

  complete(
    input: CompleteStudyPlanTasksInput,
    events: DomainEventRecorder
  ): Result<StudyPlanTaskAssembly> {
    const plannedParent = input.taskAssembly.parentTask.plan(events);
    if (!plannedParent.ok) {
      return plannedParent;
    }

    const completedChildTaskIds = new Set<typeof input.taskAssembly.childTasks[number]["id"]>();
    const completedChildTasks: Task[] = [];

    for (const [index, childTask] of input.taskAssembly.childTasks.entries()) {
      const planned = childTask.plan(events);
      if (!planned.ok) {
        return planned;
      }

      const ready = planned.value.markReady(completedChildTaskIds, events);
      if (!ready.ok) {
        return ready;
      }

      const running = ready.value.start(events);
      if (!running.ok) {
        return running;
      }

      const completed = running.value.complete(
        {
          artifactIds: [],
          summary:
            input.childTaskSummaries[index] ??
            "Prepare a focused study block with retrieval and self-check."
        },
        completedChildTaskIds,
        events
      );
      if (!completed.ok) {
        return completed;
      }

      completedChildTaskIds.add(completed.value.id);
      completedChildTasks.push(completed.value);
    }

    const parentReady = plannedParent.value.markReady(completedChildTaskIds, events);
    if (!parentReady.ok) {
      return parentReady;
    }

    const parentRunning = parentReady.value.start(events);
    if (!parentRunning.ok) {
      return parentRunning;
    }

    const parentCompleted = parentRunning.value.complete(
      {
        artifactIds: [input.artifactId],
        summary: input.artifactSummary
      },
      completedChildTaskIds,
      events
    );
    if (!parentCompleted.ok) {
      return parentCompleted;
    }

    return ok({
      parentTask: parentCompleted.value,
      childTasks: completedChildTasks
    });
  }
}
