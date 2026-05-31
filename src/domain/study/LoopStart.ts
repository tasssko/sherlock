import type { DomainEvent } from "../primitives/Event.js";
import type { WorkspaceSnapshot } from "../primitives/Workspace.js";
import type { LearningLoopRouteProjection } from "./NextAction.js";
import type { LearningLoopSnapshot, KnowledgeGapSnapshot } from "../learning/LearningLoop.js";
import type { LearningLoopBatchSnapshot } from "./LoopBatches.js";

export interface CreateInitialLoopBatchCommand {
  desiredLoopCount: number;
  learnerName: string;
  objective: string;
  topic: string;
  yearGroup: string;
}

export interface InitialLoopBatchResponse extends LearningLoopRouteProjection {
  events: readonly DomainEvent[];
  knowledgeGaps: readonly KnowledgeGapSnapshot[];
  learningLoop: LearningLoopSnapshot;
  loopBatch: LearningLoopBatchSnapshot;
  workspace: WorkspaceSnapshot;
}
