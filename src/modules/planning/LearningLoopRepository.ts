import type { ActiveReviewSession } from "../../domain/learning/ActiveReviewSession.js";
import type { Assessment, Attempt, Evaluation } from "../../domain/learning/Assessment.js";
import type { LearnerEvidence } from "../../domain/learning/LearnerEvidence.js";
import type { LoopUnit } from "../../domain/learning/LoopUnit.js";
import type { LoopUnitQuestionAssignment } from "../../domain/learning/LoopUnitQuestionAssignment.js";
import type { MasteryState } from "../../domain/learning/MasteryState.js";
import type { LearningLoopBatch } from "../../domain/learning/LearningLoopBatch.js";
import type {
  KnowledgeGap,
  LearningLoop,
  MasteryProfile,
} from "../../domain/learning/LearningLoop.js";
import type { MasterDataItem, MasterDataSource } from "../../domain/learning/MasterData.js";
import type { PracticeActivity } from "../../domain/learning/PracticeActivity.js";
import type { QuestionSeed, QuestionVariant } from "../../domain/learning/QuestionBank.js";
import type { RuntimeTrace } from "../runtime/RuntimeTrace.js";
import type { RuntimeConversationBinding } from "../runtime/RuntimeConversationBinding.js";
import type { Artifact, ArtifactType } from "../../domain/primitives/Artifact.js";
import type { DomainEvent } from "../../domain/primitives/Event.js";
import type { AssessmentId, LearningLoopId, PracticeActivityId } from "../../domain/primitives/ids.js";
import type { Task } from "../../domain/primitives/Task.js";
import type { WorkPlan } from "../../domain/primitives/WorkPlan.js";
import type { Workspace } from "../../domain/primitives/Workspace.js";
import type {
  MasterDataUploadResponse,
  UploadMasterDataCommand
} from "../../domain/study/MasterDataUpload.js";
import type { LearnerWorkspaceKey } from "./LearnerWorkspaceKey.js";

export interface LearningLoopRecord {
  workspace: Workspace;
  tasks: readonly Task[];
  workPlans: readonly WorkPlan[];
  artifacts: readonly Artifact<unknown, ArtifactType>[];
  events: readonly DomainEvent[];
  learningLoops: readonly LearningLoop[];
  assessments: readonly Assessment[];
  attempts: readonly Attempt[];
  evaluations: readonly Evaluation[];
  knowledgeGaps: readonly KnowledgeGap[];
  masteryProfiles: readonly MasteryProfile[];
  practiceActivities: readonly PracticeActivity[];
  activeReviewSessions: readonly ActiveReviewSession[];
  learnerEvidence?: readonly LearnerEvidence[];
  masteryStates?: readonly MasteryState[];
  loopBatches: readonly LearningLoopBatch[];
  loopUnits?: readonly LoopUnit[];
  loopUnitQuestionAssignments?: readonly LoopUnitQuestionAssignment[];
  questionSeeds?: readonly QuestionSeed[];
  questionVariants?: readonly QuestionVariant[];
  runtimeConversationBindings: readonly RuntimeConversationBinding[];
  runtimeTraces: readonly RuntimeTrace[];
}

export function createLearningLoopRecord(record: LearningLoopRecord): LearningLoopRecord {
  return {
    workspace: record.workspace,
    tasks: [...record.tasks],
    workPlans: [...record.workPlans],
    artifacts: [...record.artifacts],
    events: [...record.events],
    learningLoops: [...record.learningLoops],
    assessments: [...record.assessments],
    attempts: [...record.attempts],
    evaluations: [...record.evaluations],
    knowledgeGaps: [...record.knowledgeGaps],
    masteryProfiles: [...record.masteryProfiles],
    practiceActivities: [...record.practiceActivities],
    activeReviewSessions: [...record.activeReviewSessions],
    learnerEvidence: [...(record.learnerEvidence ?? [])],
    masteryStates: [...(record.masteryStates ?? [])],
    loopBatches: [...record.loopBatches],
    loopUnits: [...(record.loopUnits ?? [])],
    loopUnitQuestionAssignments: [...(record.loopUnitQuestionAssignments ?? [])],
    questionSeeds: [...(record.questionSeeds ?? [])],
    questionVariants: [...(record.questionVariants ?? [])],
    runtimeConversationBindings: [...record.runtimeConversationBindings],
    runtimeTraces: [...record.runtimeTraces]
  };
}

export interface LocatedLearningLoopRecord {
  key: LearnerWorkspaceKey;
  record: LearningLoopRecord;
}

export interface LearningLoopRepository {
  findMasterDataByTopic(topic: string): {
    source: MasterDataSource;
    items: readonly MasterDataItem[];
  }[];
  findMasterDataBySourceIds(sourceIds: readonly string[]): {
    source: MasterDataSource;
    items: readonly MasterDataItem[];
  }[];
  findMasterDataSourcesByIds(sourceIds: readonly string[]): readonly MasterDataSource[];
  findRecord(key: LearnerWorkspaceKey): LearningLoopRecord | undefined;
  findRecordByAssessmentId(assessmentId: AssessmentId): LocatedLearningLoopRecord | undefined;
  findRecordByLearningLoopId(learningLoopId: LearningLoopId): LocatedLearningLoopRecord | undefined;
  findRecordByPracticeActivityId(
    practiceActivityId: PracticeActivityId
  ): LocatedLearningLoopRecord | undefined;
  registerMasterData(command: UploadMasterDataCommand): MasterDataUploadResponse;
  saveRecord(key: LearnerWorkspaceKey, record: LearningLoopRecord): void;
}
