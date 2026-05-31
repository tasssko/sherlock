import type { ArtifactId } from "../primitives/ids.js";
import type {
  AssessmentId,
  AttemptId,
  EvaluationId,
  LearningLoopId,
  MasterDataItemId,
  WorkspaceId
} from "../primitives/ids.js";
import {
  createAssessmentId,
  createAttemptId,
  createEvaluationId
} from "../primitives/ids.js";
import type { DomainEventRecorder } from "../primitives/Event.js";

export type AssessmentKind = "initial-diagnostic";
export type AssessmentDifficulty = "easy" | "medium" | "stretch";
export type AssessmentQuestionType = "free_form" | "multiple_choice" | "multiple_select";

export interface AssessmentOption {
  id: string;
  text: string;
}

export interface AssessmentItem {
  id: string;
  topic: string;
  prompt: string;
  canonicalAnswer: string;
  visibleMaterial: string;
  difficulty: AssessmentDifficulty;
  sourceMasterDataItemId: MasterDataItemId;
  questionType?: AssessmentQuestionType;
  options?: readonly AssessmentOption[];
  correctOptionIds?: readonly string[];
  hint?: string;
  sourceFact?: string;
}

export interface AssessmentSnapshot {
  id: AssessmentId;
  workspaceId: WorkspaceId;
  learningLoopId: LearningLoopId;
  kind: AssessmentKind;
  topic: string;
  itemIds: readonly string[];
  sourceMasterDataItemIds: readonly MasterDataItemId[];
  items: readonly AssessmentItem[];
  artifactId?: ArtifactId;
  createdAt: string;
}

export interface CreateAssessmentInput {
  workspaceId: WorkspaceId;
  learningLoopId: LearningLoopId;
  topic: string;
  items: readonly AssessmentItem[];
}

export class Assessment {
  private constructor(private readonly snapshot: AssessmentSnapshot) {}

  static create(input: CreateAssessmentInput, events: DomainEventRecorder): Assessment {
    events.assertWorkspace(input.workspaceId);
    const assessment = new Assessment({
      id: createAssessmentId(),
      workspaceId: input.workspaceId,
      learningLoopId: input.learningLoopId,
      kind: "initial-diagnostic",
      topic: input.topic,
      itemIds: input.items.map((item) => item.id),
      sourceMasterDataItemIds: input.items.map((item) => item.sourceMasterDataItemId),
      items: input.items.map((item) => ({ ...item })),
      createdAt: new Date().toISOString()
    });

    events.recordAssessmentCreated(assessment.id, assessment.kind, assessment.topic);

    return assessment;
  }

  static rehydrate(snapshot: AssessmentSnapshot): Assessment {
    return new Assessment({
      ...snapshot,
      itemIds: [...snapshot.itemIds],
      sourceMasterDataItemIds: [...snapshot.sourceMasterDataItemIds],
      items: snapshot.items.map((item) => ({ ...item }))
    });
  }

  get id(): AssessmentId {
    return this.snapshot.id;
  }

  get workspaceId(): WorkspaceId {
    return this.snapshot.workspaceId;
  }

  get learningLoopId(): LearningLoopId {
    return this.snapshot.learningLoopId;
  }

  get kind(): AssessmentKind {
    return this.snapshot.kind;
  }

  get topic(): string {
    return this.snapshot.topic;
  }

  get items(): readonly AssessmentItem[] {
    return this.snapshot.items;
  }

  attachArtifact(artifactId: ArtifactId, events: DomainEventRecorder): Assessment {
    events.assertWorkspace(this.snapshot.workspaceId);
    if (this.snapshot.artifactId === artifactId) {
      return this;
    }

    const next = new Assessment({
      ...this.snapshot,
      artifactId
    });

    events.recordAssessmentArtifactAttached(next.id, artifactId);
    return next;
  }

  toSnapshot(): AssessmentSnapshot {
    return {
      ...this.snapshot,
      itemIds: [...this.snapshot.itemIds],
      sourceMasterDataItemIds: [...this.snapshot.sourceMasterDataItemIds],
      items: this.snapshot.items.map((item) => ({ ...item }))
    };
  }
}

export interface AttemptResponse {
  itemId: string;
  answer: string;
}

export interface AttemptSnapshot {
  id: AttemptId;
  workspaceId: WorkspaceId;
  assessmentId: AssessmentId;
  responses: readonly AttemptResponse[];
  submittedAt: string;
}

export class Attempt {
  private constructor(private readonly snapshot: AttemptSnapshot) {}

  static create(
    workspaceId: WorkspaceId,
    assessmentId: AssessmentId,
    responses: readonly AttemptResponse[],
    events: DomainEventRecorder
  ): Attempt {
    events.assertWorkspace(workspaceId);
    const attempt = new Attempt({
      id: createAttemptId(),
      workspaceId,
      assessmentId,
      responses: responses.map((response) => ({ ...response })),
      submittedAt: new Date().toISOString()
    });

    events.recordAttemptCreated(attempt.id, assessmentId);

    return attempt;
  }

  static rehydrate(snapshot: AttemptSnapshot): Attempt {
    return new Attempt({
      ...snapshot,
      responses: snapshot.responses.map((response) => ({ ...response }))
    });
  }

  get id(): AttemptId {
    return this.snapshot.id;
  }

  get assessmentId(): AssessmentId {
    return this.snapshot.assessmentId;
  }

  get responses(): readonly AttemptResponse[] {
    return this.snapshot.responses;
  }

  toSnapshot(): AttemptSnapshot {
    return {
      ...this.snapshot,
      responses: this.snapshot.responses.map((response) => ({ ...response }))
    };
  }
}

export interface EvaluationItemResult {
  itemId: string;
  correct: boolean;
  feedback: string;
  topic: string;
}

export interface EvaluationSnapshot {
  id: EvaluationId;
  workspaceId: WorkspaceId;
  assessmentId: AssessmentId;
  attemptId: AttemptId;
  score: number;
  itemResults: readonly EvaluationItemResult[];
  createdAt: string;
}

export class Evaluation {
  private constructor(private readonly snapshot: EvaluationSnapshot) {}

  static create(input: {
    workspaceId: WorkspaceId;
    assessmentId: AssessmentId;
    attemptId: AttemptId;
    score: number;
    itemResults: readonly EvaluationItemResult[];
  }, events: DomainEventRecorder): Evaluation {
    events.assertWorkspace(input.workspaceId);
    const evaluation = new Evaluation({
      id: createEvaluationId(),
      workspaceId: input.workspaceId,
      assessmentId: input.assessmentId,
      attemptId: input.attemptId,
      score: input.score,
      itemResults: input.itemResults.map((result) => ({ ...result })),
      createdAt: new Date().toISOString()
    });

    events.recordEvaluationCreated(evaluation.id, evaluation.assessmentId, evaluation.score);

    return evaluation;
  }

  static rehydrate(snapshot: EvaluationSnapshot): Evaluation {
    return new Evaluation({
      ...snapshot,
      itemResults: snapshot.itemResults.map((item) => ({ ...item }))
    });
  }

  get id(): EvaluationId {
    return this.snapshot.id;
  }

  get score(): number {
    return this.snapshot.score;
  }

  get assessmentId(): AssessmentId {
    return this.snapshot.assessmentId;
  }

  get itemResults(): readonly EvaluationItemResult[] {
    return this.snapshot.itemResults;
  }

  toSnapshot(): EvaluationSnapshot {
    return {
      ...this.snapshot,
      itemResults: this.snapshot.itemResults.map((item) => ({ ...item }))
    };
  }
}
