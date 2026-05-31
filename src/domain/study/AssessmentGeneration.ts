import type {
  AssessmentSnapshot,
  AssessmentQuestionType,
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
import type { LearningLoopRouteProjection } from "./NextAction.js";
import type { LearningLoopBatchSnapshot } from "./LoopBatches.js";

export interface CreateInitialAssessmentCommand {
  learnerName: string;
  yearGroup: string;
  topic: string;
  questionCount: number;
}

export interface AssessmentBlueprint {
  coveredSubtopics: readonly string[];
  difficultyProfile: {
    easy: number;
    medium: number;
    stretch: number;
  };
  maxQuestionCount: number;
  objectiveRefs: readonly string[];
  questionCount: number;
  questionTypeMix: readonly AssessmentQuestionType[];
  rationale: string;
  sourceRefs: readonly string[];
  targetDurationMinutes: number;
}

export interface AssessmentArtifactItem {
  id: string;
  prompt: string;
  difficulty: "easy" | "medium" | "stretch";
  questionType?: "free_form" | "multiple_choice" | "multiple_select";
  hint?: string;
}

export interface AssessmentArtifactContent {
  topic: string;
  questionCount: number;
  instructions: string;
  items: readonly AssessmentArtifactItem[];
}

export interface InitialAssessmentResponse extends LearningLoopRouteProjection {
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

export interface AssessmentAttemptResponse extends LearningLoopRouteProjection {
  workspace: WorkspaceSnapshot;
  learningLoop: LearningLoopSnapshot;
  attempt: AttemptSnapshot;
  evaluation: EvaluationSnapshot;
  knowledgeGaps: readonly KnowledgeGapSnapshot[];
  loopBatch?: LearningLoopBatchSnapshot;
  masteryProfile?: MasteryProfileSnapshot;
  events: readonly DomainEvent[];
}
