import type { ArtifactId, WorkPlanId } from "../primitives/ids.js";
import type { PracticeActivityKind } from "./PracticeActivity.js";
import type {
  ActiveReviewSessionId,
  AssessmentId,
  AttemptId,
  EvaluationId,
  KnowledgeGapId,
  LearningLoopId,
  MasterDataItemId,
  MasterDataSourceId,
  MasteryProfileId,
  PracticeActivityId,
  WorkspaceId
} from "../primitives/ids.js";
import {
  createKnowledgeGapId,
  createLearningLoopId,
  createMasteryProfileId
} from "../primitives/ids.js";
import type { DomainEventRecorder } from "../primitives/Event.js";

export type LearningLoopPhase =
  | "initial-assessment"
  | "diagnosis"
  | "study-planning"
  | "practice"
  | "reassessment"
  | "mastery-tracking";

export interface LearningLoopSnapshot {
  id: LearningLoopId;
  workspaceId: WorkspaceId;
  objective: string;
  topic: string;
  phase: LearningLoopPhase;
  assessmentIds: readonly AssessmentId[];
  attemptIds: readonly AttemptId[];
  evaluationIds: readonly EvaluationId[];
  knowledgeGapIds: readonly KnowledgeGapId[];
  workPlanIds: readonly WorkPlanId[];
  artifactIds: readonly ArtifactId[];
  practiceActivityIds: readonly PracticeActivityId[];
  activeReviewSessionIds: readonly ActiveReviewSessionId[];
  masteryProfileId?: MasteryProfileId;
  sourceIds: readonly MasterDataSourceId[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateLearningLoopInput {
  workspaceId: WorkspaceId;
  objective: string;
  topic: string;
  sourceIds?: readonly MasterDataSourceId[];
}

export class LearningLoop {
  private constructor(private readonly snapshot: LearningLoopSnapshot) {}

  static create(input: CreateLearningLoopInput, events: DomainEventRecorder): LearningLoop {
    events.assertWorkspace(input.workspaceId);
    const loop = new LearningLoop({
      id: createLearningLoopId(),
      workspaceId: input.workspaceId,
      objective: input.objective,
      topic: input.topic,
      phase: "initial-assessment",
      assessmentIds: [],
      attemptIds: [],
      evaluationIds: [],
      knowledgeGapIds: [],
      workPlanIds: [],
      artifactIds: [],
      practiceActivityIds: [],
      activeReviewSessionIds: [],
      sourceIds: [...(input.sourceIds ?? [])],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    events.recordLearningLoopCreated(loop.id, loop.phase, loop.topic);

    return loop;
  }

  static rehydrate(snapshot: LearningLoopSnapshot): LearningLoop {
    return new LearningLoop({
      ...snapshot,
      assessmentIds: [...snapshot.assessmentIds],
      attemptIds: [...snapshot.attemptIds],
      evaluationIds: [...snapshot.evaluationIds],
      knowledgeGapIds: [...snapshot.knowledgeGapIds],
      workPlanIds: [...snapshot.workPlanIds],
      artifactIds: [...snapshot.artifactIds],
      practiceActivityIds: [...snapshot.practiceActivityIds],
      activeReviewSessionIds: [...snapshot.activeReviewSessionIds],
      sourceIds: [...snapshot.sourceIds]
    });
  }

  get id(): LearningLoopId {
    return this.snapshot.id;
  }

  get workspaceId(): WorkspaceId {
    return this.snapshot.workspaceId;
  }

  get objective(): string {
    return this.snapshot.objective;
  }

  get topic(): string {
    return this.snapshot.topic;
  }

  get phase(): LearningLoopPhase {
    return this.snapshot.phase;
  }

  get knowledgeGapIds(): readonly KnowledgeGapId[] {
    return this.snapshot.knowledgeGapIds;
  }

  get evaluationIds(): readonly EvaluationId[] {
    return this.snapshot.evaluationIds;
  }

  get masteryProfileId(): MasteryProfileId | undefined {
    return this.snapshot.masteryProfileId;
  }

  get practiceActivityIds(): readonly PracticeActivityId[] {
    return this.snapshot.practiceActivityIds;
  }

  get activeReviewSessionIds(): readonly ActiveReviewSessionId[] {
    return this.snapshot.activeReviewSessionIds;
  }

  isDiagnosed(): boolean {
    return this.snapshot.evaluationIds.length > 0 && this.snapshot.knowledgeGapIds.length > 0;
  }

  recordInitialAssessmentGenerated(
    input: { assessmentId: AssessmentId; artifactId: ArtifactId },
    events: DomainEventRecorder
  ): LearningLoop {
    events.assertWorkspace(this.snapshot.workspaceId);
    const next = new LearningLoop({
      ...this.snapshot,
      assessmentIds: this.appendUnique(this.snapshot.assessmentIds, input.assessmentId),
      artifactIds: this.appendUnique(this.snapshot.artifactIds, input.artifactId),
      phase: "diagnosis",
      updatedAt: new Date().toISOString()
    });

    events.recordInitialAssessmentGenerated(this.snapshot.id, input.assessmentId, input.artifactId);
    return next;
  }

  recordAssessmentAttemptSubmitted(
    input: { assessmentId: AssessmentId; attemptId: AttemptId },
    events: DomainEventRecorder
  ): LearningLoop {
    events.assertWorkspace(this.snapshot.workspaceId);
    const next = new LearningLoop({
      ...this.snapshot,
      attemptIds: this.appendUnique(this.snapshot.attemptIds, input.attemptId),
      phase: "diagnosis",
      updatedAt: new Date().toISOString()
    });

    events.recordAssessmentAttemptSubmitted(this.snapshot.id, input.assessmentId, input.attemptId);
    return next;
  }

  recordAssessmentEvaluated(
    input: { assessmentId: AssessmentId; evaluationId: EvaluationId; score: number },
    events: DomainEventRecorder
  ): LearningLoop {
    events.assertWorkspace(this.snapshot.workspaceId);
    const next = new LearningLoop({
      ...this.snapshot,
      evaluationIds: this.appendUnique(this.snapshot.evaluationIds, input.evaluationId),
      phase: "study-planning",
      updatedAt: new Date().toISOString()
    });

    events.recordAssessmentEvaluated(
      this.snapshot.id,
      input.assessmentId,
      input.evaluationId,
      input.score
    );
    return next;
  }

  identifyKnowledgeGaps(
    knowledgeGapIds: readonly KnowledgeGapId[],
    events: DomainEventRecorder
  ): LearningLoop {
    events.assertWorkspace(this.snapshot.workspaceId);
    const nextKnowledgeGapIds = [...this.snapshot.knowledgeGapIds];
    for (const gapId of knowledgeGapIds) {
      if (!nextKnowledgeGapIds.includes(gapId)) {
        nextKnowledgeGapIds.push(gapId);
      }
    }

    const next = new LearningLoop({
      ...this.snapshot,
      knowledgeGapIds: nextKnowledgeGapIds,
      phase: "study-planning",
      updatedAt: new Date().toISOString()
    });

    events.recordKnowledgeGapsIdentified(this.snapshot.id, knowledgeGapIds);
    return next;
  }

  recordStudyPlanAdapted(
    input: { workPlanId: WorkPlanId; artifactId: ArtifactId; diagnosedGapCount: number },
    events: DomainEventRecorder
  ): LearningLoop {
    events.assertWorkspace(this.snapshot.workspaceId);
    const next = new LearningLoop({
      ...this.snapshot,
      workPlanIds: this.appendUnique(this.snapshot.workPlanIds, input.workPlanId),
      artifactIds: this.appendUnique(this.snapshot.artifactIds, input.artifactId),
      phase: "practice",
      updatedAt: new Date().toISOString()
    });

    events.recordStudyPlanAdapted(
      this.snapshot.id,
      input.workPlanId,
      input.artifactId,
      input.diagnosedGapCount
    );
    return next;
  }

  recordPracticeActivityGenerated(
    input: {
      practiceActivityId: PracticeActivityId;
      kind: PracticeActivityKind;
      targetKnowledgeGapIds: readonly KnowledgeGapId[];
      sourceMasterDataItemIds: readonly MasterDataItemId[];
    },
    events: DomainEventRecorder
  ): LearningLoop {
    events.assertWorkspace(this.snapshot.workspaceId);
    const next = new LearningLoop({
      ...this.snapshot,
      practiceActivityIds: this.appendUnique(
        this.snapshot.practiceActivityIds,
        input.practiceActivityId
      ),
      phase: "practice",
      updatedAt: new Date().toISOString()
    });

    events.recordPracticeActivityGenerated(
      this.snapshot.id,
      input.practiceActivityId,
      input.kind,
      input.targetKnowledgeGapIds,
      input.sourceMasterDataItemIds
    );
    return next;
  }

  recordPracticeActivityCompleted(
    input: {
      activeReviewSessionId: ActiveReviewSessionId;
      masteryScore: number;
      practiceActivityId: PracticeActivityId;
      remainingKnowledgeGapIds: readonly KnowledgeGapId[];
    },
    events: DomainEventRecorder
  ): LearningLoop {
    events.assertWorkspace(this.snapshot.workspaceId);
    const next = new LearningLoop({
      ...this.snapshot,
      activeReviewSessionIds: this.appendUnique(
        this.snapshot.activeReviewSessionIds,
        input.activeReviewSessionId
      ),
      knowledgeGapIds: [...input.remainingKnowledgeGapIds],
      phase: input.remainingKnowledgeGapIds.length > 0 ? "study-planning" : "mastery-tracking",
      updatedAt: new Date().toISOString()
    });

    events.recordPracticeActivityCompleted(
      this.snapshot.id,
      input.practiceActivityId,
      input.activeReviewSessionId,
      input.masteryScore
    );
    return next;
  }

  attachMasteryProfile(profileId: MasteryProfileId, events: DomainEventRecorder): LearningLoop {
    events.assertWorkspace(this.snapshot.workspaceId);
    const next = new LearningLoop({
      ...this.snapshot,
      masteryProfileId: profileId,
      updatedAt: new Date().toISOString()
    });

    events.recordLearningLoopMasteryProfileUpdated(this.snapshot.id, profileId);
    return next;
  }

  toSnapshot(): LearningLoopSnapshot {
    return {
      ...this.snapshot,
      assessmentIds: [...this.snapshot.assessmentIds],
      attemptIds: [...this.snapshot.attemptIds],
      evaluationIds: [...this.snapshot.evaluationIds],
      knowledgeGapIds: [...this.snapshot.knowledgeGapIds],
      workPlanIds: [...this.snapshot.workPlanIds],
      artifactIds: [...this.snapshot.artifactIds],
      practiceActivityIds: [...this.snapshot.practiceActivityIds],
      activeReviewSessionIds: [...this.snapshot.activeReviewSessionIds],
      sourceIds: [...this.snapshot.sourceIds]
    };
  }

  private appendUnique<TValue>(items: readonly TValue[], value: TValue): readonly TValue[] {
    return items.includes(value) ? items : [...items, value];
  }
}

export type KnowledgeGapSeverity = "high" | "medium" | "low";

export interface KnowledgeGapSnapshot {
  id: KnowledgeGapId;
  learningLoopId: LearningLoopId;
  topic: string;
  description: string;
  evidence: string;
  severity: KnowledgeGapSeverity;
  createdAt: string;
}

export class KnowledgeGap {
  private constructor(private readonly snapshot: KnowledgeGapSnapshot) {}

  static create(input: {
    learningLoopId: LearningLoopId;
    topic: string;
    description: string;
    evidence: string;
    severity: KnowledgeGapSeverity;
  }): KnowledgeGap {
    return new KnowledgeGap({
      id: createKnowledgeGapId(),
      learningLoopId: input.learningLoopId,
      topic: input.topic,
      description: input.description,
      evidence: input.evidence,
      severity: input.severity,
      createdAt: new Date().toISOString()
    });
  }

  static rehydrate(snapshot: KnowledgeGapSnapshot): KnowledgeGap {
    return new KnowledgeGap({ ...snapshot });
  }

  get id(): KnowledgeGapId {
    return this.snapshot.id;
  }

  get topic(): string {
    return this.snapshot.topic;
  }

  toSnapshot(): KnowledgeGapSnapshot {
    return { ...this.snapshot };
  }
}

export type MasteryStatus = "developing" | "secure";

export interface TopicMasterySnapshot {
  topic: string;
  score: number;
  status: MasteryStatus;
}

export interface MasteryProfileSnapshot {
  id: MasteryProfileId;
  learningLoopId: LearningLoopId;
  topics: readonly TopicMasterySnapshot[];
  updatedAt: string;
}

export class MasteryProfile {
  private constructor(private readonly snapshot: MasteryProfileSnapshot) {}

  static create(learningLoopId: LearningLoopId): MasteryProfile {
    return new MasteryProfile({
      id: createMasteryProfileId(),
      learningLoopId,
      topics: [],
      updatedAt: new Date().toISOString()
    });
  }

  static rehydrate(snapshot: MasteryProfileSnapshot): MasteryProfile {
    return new MasteryProfile({
      ...snapshot,
      topics: snapshot.topics.map((topic) => ({ ...topic }))
    });
  }

  get id(): MasteryProfileId {
    return this.snapshot.id;
  }

  recordTopicScore(topic: string, score: number): MasteryProfile {
    const nextTopics = this.snapshot.topics.filter((entry) => entry.topic !== topic);
    nextTopics.push({
      topic,
      score,
      status: score >= 0.8 ? "secure" : "developing"
    });

    return new MasteryProfile({
      ...this.snapshot,
      topics: nextTopics,
      updatedAt: new Date().toISOString()
    });
  }

  toSnapshot(): MasteryProfileSnapshot {
    return {
      ...this.snapshot,
      topics: this.snapshot.topics.map((topic) => ({ ...topic }))
    };
  }
}
