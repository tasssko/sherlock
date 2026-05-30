import type { PracticeActivityContext } from "../../domain/primitives/Context.js";
import type { DomainEventRecorder } from "../../domain/primitives/Event.js";
import { Task } from "../../domain/primitives/Task.js";
import type { ArtifactId, WorkspaceId } from "../../domain/primitives/ids.js";
import type { Result } from "../../domain/primitives/result.js";

export class PracticeActivityTaskAssembler {
  create(
    context: PracticeActivityContext,
    workspaceId: WorkspaceId,
    events: DomainEventRecorder
  ): Task {
    return Task.create(
      {
        workspaceId,
        title: `Generate flashcard practice for ${context.topic}`,
        kind: "practice-activity",
        input: {
          objective: `Generate practice to improve diagnosed gaps in ${context.topic}.`,
          facts: context.facts().map((fact) => `${fact.label}: ${fact.value}`),
          topic: context.topic
        }
      },
      events
    );
  }

  complete(
    task: Task,
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
        artifactIds: [] as readonly ArtifactId[],
        summary
      },
      new Set(),
      events
    );
  }
}
