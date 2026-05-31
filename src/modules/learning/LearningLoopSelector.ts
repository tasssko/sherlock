import { LearningLoop } from "../../domain/learning/LearningLoop.js";
import type { DomainEventRecorder } from "../../domain/primitives/Event.js";
import type { Workspace } from "../../domain/primitives/Workspace.js";
import type { LearningLoopRecord } from "../planning/LearningLoopRepository.js";

export class LearningLoopSelector {
  findByTopic(record: LearningLoopRecord | undefined, topic: string): LearningLoop | undefined {
    if (!record) {
      return undefined;
    }

    for (let index = record.learningLoops.length - 1; index >= 0; index -= 1) {
      const candidate = record.learningLoops[index];
      if (candidate?.topic === topic && this.isReusable(candidate)) {
        return candidate;
      }
    }

    return undefined;
  }

  reconcileTopicLoops(
    record: LearningLoopRecord | undefined,
    topic: string,
    retainedLoopId: string | undefined,
    events: DomainEventRecorder
  ): readonly LearningLoop[] {
    if (!record) {
      return [];
    }

    return record.learningLoops.map((candidate) => {
      if (
        candidate.topic !== topic ||
        !candidate.isActive() ||
        candidate.id === (retainedLoopId as never)
      ) {
        return candidate;
      }

      return candidate.supersede(events);
    });
  }

  createForInitialAssessment(input: {
    objective: string;
    topic: string;
    workspace: Workspace;
    events: DomainEventRecorder;
    sourceIds?: readonly string[];
  }): LearningLoop {
    return LearningLoop.create(
      {
        workspaceId: input.workspace.id,
        objective: input.objective,
        topic: input.topic,
        sourceIds: input.sourceIds as never
      },
      input.events
    );
  }

  private isReusable(loop: LearningLoop): boolean {
    if (!loop.isActive()) {
      return false;
    }

    return !this.isStrandedLegacyLoop(loop);
  }

  private isStrandedLegacyLoop(loop: LearningLoop): boolean {
    const snapshot = loop.toSnapshot();
    return snapshot.phase === "study-planning" && snapshot.workPlanIds.length === 0;
  }
}
