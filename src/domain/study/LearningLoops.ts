import type {
  AssessmentSnapshot,
  AttemptSnapshot,
  EvaluationSnapshot
} from "../learning/Assessment.js";
import type { ActiveReviewSessionSnapshot } from "../learning/ActiveReviewSession.js";
import type {
  KnowledgeGapSnapshot,
  LearningLoopSnapshot,
  MasteryProfileSnapshot
} from "../learning/LearningLoop.js";
import type { PracticeActivitySnapshot } from "../learning/PracticeActivity.js";
import type {
  AssessmentArtifactContent,
  InitialAssessmentResponse
} from "./AssessmentGeneration.js";
import type { DomainEvent } from "../primitives/Event.js";
import type { ArtifactSnapshot } from "../primitives/Artifact.js";
import type { TaskGraphSnapshot } from "../primitives/TaskGraph.js";
import type { TaskSnapshot } from "../primitives/Task.js";
import type { WorkPlanSnapshot } from "../primitives/WorkPlan.js";
import type { WorkspaceSnapshot } from "../primitives/Workspace.js";
import type { LearningLoopRouteProjection } from "./NextAction.js";
import type { LearningLoopBatchSnapshot } from "./LoopBatches.js";
import type { StudyPlanArtifactContent } from "./StudyPlanning.js";

export interface ResumableStudyPlanProjection {
  artifact: ArtifactSnapshot<StudyPlanArtifactContent, "study-plan">;
  blockedTaskIds: readonly string[];
  taskGraph: TaskGraphSnapshot;
  tasks: readonly TaskSnapshot[];
  workPlan: WorkPlanSnapshot;
}

export interface LearningLoopResumeResponse extends LearningLoopRouteProjection {
  workspace: WorkspaceSnapshot;
  learningLoop: LearningLoopSnapshot;
  currentAssessment?: AssessmentSnapshot;
  assessmentArtifact?: InitialAssessmentResponse["artifact"];
  latestAttempt?: AttemptSnapshot;
  latestEvaluation?: EvaluationSnapshot;
  knowledgeGaps: readonly KnowledgeGapSnapshot[];
  masteryProfile?: MasteryProfileSnapshot;
  studyPlan?: ResumableStudyPlanProjection;
  loopBatch?: LearningLoopBatchSnapshot;
  practiceActivities: readonly PracticeActivitySnapshot[];
  currentPracticeActivity?: PracticeActivitySnapshot;
  latestActiveReviewSession?: ActiveReviewSessionSnapshot;
  events: readonly DomainEvent[];
}
