import { WorkPlan } from "../../domain/primitives/WorkPlan.js";
import { capabilityCatalog } from "../../domain/primitives/Capability.js";
import type { StudyPlanningContext } from "../../domain/primitives/Context.js";
import type { DomainEventRecorder } from "../../domain/primitives/Event.js";
import type { Task } from "../../domain/primitives/Task.js";
import type { ArtifactId, WorkspaceId } from "../../domain/primitives/ids.js";
import type { StudyPlannerOutput } from "./StudyPlannerAgent.js";

export class StudyPlanWorkPlanBuilder {
  create(
    context: StudyPlanningContext,
    workspaceId: WorkspaceId,
    childTasks: readonly Task[],
    events: DomainEventRecorder
  ): WorkPlan {
    return WorkPlan.create(
      {
        workspaceId,
        objective: context.objective,
        facts: context.facts(),
        requiredCapabilities: [
          capabilityCatalog.generateStudyPlan.id,
          capabilityCatalog.createChildTask.id,
          capabilityCatalog.createArtifact.id
        ],
        stages: childTasks.map((childTask, index) => ({
          id: `stage_${index + 1}`,
          title: context.focusTopics[index] ?? `Topic ${index + 1}`,
          objective: `Create and complete the ${context.focusTopics[index] ?? "topic"} study block.`,
          taskIds: [childTask.id]
        })),
        acceptanceCriteria: [
          {
            id: "acceptance_structured_response",
            description: "Return a structured workspace snapshot rather than free text."
          },
          {
            id: "acceptance_visible_lifecycle",
            description: "Expose tasks, work plan, artifact, and events together."
          }
        ]
      },
      events
    );
  }

  applyPlannerOutput(
    workPlan: WorkPlan,
    plannerOutput: StudyPlannerOutput,
    artifactId: ArtifactId,
    events: DomainEventRecorder
  ): WorkPlan {
    let next = workPlan;

    for (const assumption of plannerOutput.assumptions) {
      next = next.recordAssumption(assumption, events);
    }

    return next.attachArtifact(artifactId, events);
  }
}
