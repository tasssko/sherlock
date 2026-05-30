import type { LearningLoopSnapshot, MasteryProfileSnapshot } from "../learning/LearningLoop.js";
import type { ActiveReviewSessionSnapshot } from "../learning/ActiveReviewSession.js";
import type { PracticeActivitySnapshot } from "../learning/PracticeActivity.js";
import type { AgentSnapshot } from "../primitives/Agent.js";
import type { DomainEvent } from "../primitives/Event.js";
import type { TaskSnapshot } from "../primitives/Task.js";
import type { WorkspaceSnapshot } from "../primitives/Workspace.js";

export interface CreatePracticeActivityCommand {
  learningLoopId: string;
  kind: "flashcard_set";
  cardCount: number;
}

export interface CompletePracticeActivityCommand {
  practiceActivityId: string;
  responses: readonly {
    practiceItemId: string;
    responseText: string;
    confidence: "high" | "low" | "medium";
    note?: string;
  }[];
}

export interface ListPracticeActivitiesQuery {
  learningLoopId: string;
}

export interface PracticeActivityResponse {
  workspace: WorkspaceSnapshot;
  learningLoop: LearningLoopSnapshot;
  agent: AgentSnapshot;
  task: TaskSnapshot;
  practiceActivity: PracticeActivitySnapshot;
  events: readonly DomainEvent[];
}

export interface PracticeActivityCompletionResponse {
  workspace: WorkspaceSnapshot;
  learningLoop: LearningLoopSnapshot;
  practiceActivity: PracticeActivitySnapshot;
  activeReviewSession: ActiveReviewSessionSnapshot;
  masteryProfile: MasteryProfileSnapshot;
  events: readonly DomainEvent[];
}

export interface PracticeActivityListResponse {
  learningLoop: LearningLoopSnapshot;
  practiceActivities: readonly PracticeActivitySnapshot[];
}
