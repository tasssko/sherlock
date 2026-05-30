import { LearningLoop } from "../../domain/learning/LearningLoop.js";
import type { DomainEventRecorder } from "../../domain/primitives/Event.js";
import type { Workspace } from "../../domain/primitives/Workspace.js";
import type { StudyWorkspaceRecord } from "../planning/StudyPlanRepository.js";

export class LearningLoopSelector {
  findOrCreate(input: {
    objective: string;
    record?: StudyWorkspaceRecord;
    topic: string;
    workspace: Workspace;
    events: DomainEventRecorder;
    sourceIds?: readonly string[];
  }): LearningLoop {
    const existing = input.record?.learningLoops.find((candidate) => candidate.topic === input.topic);
    if (existing) {
      return existing;
    }

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
}
