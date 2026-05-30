import type { InitialAssessmentContext } from "../../domain/primitives/Context.js";
import type { DomainEventRecorder } from "../../domain/primitives/Event.js";
import { Task } from "../../domain/primitives/Task.js";
import type { ArtifactId, WorkspaceId } from "../../domain/primitives/ids.js";
import type { Result } from "../../domain/primitives/result.js";

export class AssessmentTaskAssembler {
  create(
    context: InitialAssessmentContext,
    workspaceId: WorkspaceId,
    events: DomainEventRecorder
  ): Task {
    return Task.create(
      {
        workspaceId,
        title: `Generate initial assessment for ${context.topic}`,
        kind: "assessment",
        input: {
          objective: `Generate a diagnostic assessment for ${context.topic}.`,
          facts: context.facts().map((fact) => `${fact.label}: ${fact.value}`),
          topic: context.topic
        }
      },
      events
    );
  }

  complete(
    task: Task,
    artifactId: ArtifactId,
    summary: string,
    events: DomainEventRecorder
  ): Result<Task> {
    const planned = task.plan(events);
    if (!planned.ok) {
      return planned;
    }

    const ready = planned.value.markReady(new Set(), events);
    if (!ready.ok) {
      return ready;
    }

    const running = ready.value.start(events);
    if (!running.ok) {
      return running;
    }

    return running.value.complete(
      {
        artifactIds: [artifactId],
        summary
      },
      new Set(),
      events
    );
  }
}
