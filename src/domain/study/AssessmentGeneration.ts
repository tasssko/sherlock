import type {
  AssessmentSnapshot,
  AttemptSnapshot,
  EvaluationSnapshot
} from "../learning/Assessment.js";
import type {
  KnowledgeGapSnapshot,
  LearningLoopSnapshot,
  MasteryProfileSnapshot
} from "../learning/LearningLoop.js";
import type { AgentSnapshot } from "../primitives/Agent.js";
import type { ArtifactSnapshot } from "../primitives/Artifact.js";
import type { DomainEvent } from "../primitives/Event.js";
import type { TaskSnapshot } from "../primitives/Task.js";
import type { WorkspaceSnapshot } from "../primitives/Workspace.js";

export interface CreateInitialAssessmentCommand {
  learnerName: string;
  yearGroup: string;
  topic: string;
  questionCount: number;
}

export interface AssessmentArtifactItem {
  id: string;
  prompt: string;
  difficulty: "easy" | "medium" | "stretch";
}

export interface AssessmentArtifactContent {
  topic: string;
  questionCount: number;
  instructions: string;
  items: readonly AssessmentArtifactItem[];
}

export interface InitialAssessmentResponse {
  workspace: WorkspaceSnapshot;
  learningLoop: LearningLoopSnapshot;
  agent: AgentSnapshot;
  task: TaskSnapshot;
  assessment: AssessmentSnapshot;
  artifact: ArtifactSnapshot<AssessmentArtifactContent, "assessment">;
  events: readonly DomainEvent[];
}

export interface SubmitAssessmentAttemptCommand {
  assessmentId: string;
  responses: readonly {
    itemId: string;
    answer: string;
  }[];
}

export interface AssessmentAttemptResponse {
  workspace: WorkspaceSnapshot;
  learningLoop: LearningLoopSnapshot;
  attempt: AttemptSnapshot;
  evaluation: EvaluationSnapshot;
  knowledgeGaps: readonly KnowledgeGapSnapshot[];
  masteryProfile: MasteryProfileSnapshot;
  events: readonly DomainEvent[];
}
