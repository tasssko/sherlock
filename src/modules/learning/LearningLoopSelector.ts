import { LearningLoop } from "../../domain/learning/LearningLoop.js";
import type { DomainEventRecorder } from "../../domain/primitives/Event.js";
import type { Workspace } from "../../domain/primitives/Workspace.js";
import type { LearningLoopRecord } from "../planning/LearningLoopRepository.js";

export class LearningLoopSelector {
  findByTopic(record: LearningLoopRecord | undefined, topic: string): LearningLoop | undefined {
    return record?.learningLoops.find((candidate) => candidate.topic === topic);
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
}
