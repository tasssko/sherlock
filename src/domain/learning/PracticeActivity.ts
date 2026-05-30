import type {
  ActiveReviewSessionId,
  KnowledgeGapId,
  LearningLoopId,
  MasterDataItemId,
  PracticeActivityId,
  TaskId,
  WorkspaceId
} from "../primitives/ids.js";
import { createPracticeActivityId } from "../primitives/ids.js";

export type PracticeActivityKind =
  | "concept_mapping"
  | "flashcard_set"
  | "practice_problems"
  | "retrieval_writing"
  | "spaced_repetition_review";
export type ReviewConfidence = "high" | "low" | "medium";

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  topic: string;
  knowledgeGapId: KnowledgeGapId;
  learningObjective: string;
  sourceMasterDataItemId: MasterDataItemId;
  sourceVisibleSentence: string;
}

export interface FlashcardSet {
  instructions: string;
  cards: readonly Flashcard[];
}

export interface PracticeItem {
  id: string;
  prompt: string;
  expectedResponse: string;
  topic: string;
  knowledgeGapId: KnowledgeGapId;
  learningObjective: string;
  sourceMasterDataItemId: MasterDataItemId;
  sourceVisibleSentence: string;
}

export interface PracticeItemResponse {
  practiceItemId: string;
  responseText: string;
  confidence: ReviewConfidence;
  note?: string;
}

export interface PracticeActivitySnapshot {
  id: PracticeActivityId;
  workspaceId: WorkspaceId;
  learningLoopId: LearningLoopId;
  kind: PracticeActivityKind;
  title: string;
  taskId?: TaskId;
  targetKnowledgeGapIds: readonly KnowledgeGapId[];
  learningObjectives: readonly string[];
  sourceMasterDataItemIds: readonly MasterDataItemId[];
  reviewSessionIds: readonly ActiveReviewSessionId[];
  nextReviewAt: string;
  reviewIntervalHours: number;
  easeSignal: "easy" | "hard" | "steady";
  flashcardSet: FlashcardSet;
  lastReviewedAt?: string;
  createdAt: string;
}

export interface CreatePracticeActivityInput {
  workspaceId: WorkspaceId;
  learningLoopId: LearningLoopId;
  title: string;
  taskId?: TaskId;
  targetKnowledgeGapIds: readonly KnowledgeGapId[];
  learningObjectives: readonly string[];
  sourceMasterDataItemIds: readonly MasterDataItemId[];
  flashcardSet: FlashcardSet;
}

export class PracticeActivity {
  private constructor(private readonly snapshot: PracticeActivitySnapshot) {}

  static create(input: CreatePracticeActivityInput): PracticeActivity {
    const createdAt = new Date().toISOString();
    const nextReviewAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    return new PracticeActivity({
      id: createPracticeActivityId(),
      workspaceId: input.workspaceId,
      learningLoopId: input.learningLoopId,
      kind: "flashcard_set",
      title: input.title,
      taskId: input.taskId,
      targetKnowledgeGapIds: [...input.targetKnowledgeGapIds],
      learningObjectives: [...input.learningObjectives],
      sourceMasterDataItemIds: [...input.sourceMasterDataItemIds],
      reviewSessionIds: [],
      nextReviewAt,
      reviewIntervalHours: 24,
      easeSignal: "steady",
      flashcardSet: {
        instructions: input.flashcardSet.instructions,
        cards: input.flashcardSet.cards.map((card) => ({ ...card }))
      },
      createdAt
    });
  }

  static rehydrate(snapshot: PracticeActivitySnapshot): PracticeActivity {
    return new PracticeActivity({
      ...snapshot,
      targetKnowledgeGapIds: [...snapshot.targetKnowledgeGapIds],
      learningObjectives: [...snapshot.learningObjectives],
      sourceMasterDataItemIds: [...snapshot.sourceMasterDataItemIds],
      reviewSessionIds: [...snapshot.reviewSessionIds],
      flashcardSet: {
        instructions: snapshot.flashcardSet.instructions,
        cards: snapshot.flashcardSet.cards.map((card) => ({ ...card }))
      }
    });
  }

  get id(): PracticeActivityId {
    return this.snapshot.id;
  }

  get learningLoopId(): LearningLoopId {
    return this.snapshot.learningLoopId;
  }

  get workspaceId(): WorkspaceId {
    return this.snapshot.workspaceId;
  }

  get kind(): PracticeActivityKind {
    return this.snapshot.kind;
  }

  get targetKnowledgeGapIds(): readonly KnowledgeGapId[] {
    return this.snapshot.targetKnowledgeGapIds;
  }

  get learningObjectives(): readonly string[] {
    return this.snapshot.learningObjectives;
  }

  get sourceMasterDataItemIds(): readonly MasterDataItemId[] {
    return this.snapshot.sourceMasterDataItemIds;
  }

  get reviewSessionIds(): readonly ActiveReviewSessionId[] {
    return this.snapshot.reviewSessionIds;
  }

  get nextReviewAt(): string {
    return this.snapshot.nextReviewAt;
  }

  get reviewIntervalHours(): number {
    return this.snapshot.reviewIntervalHours;
  }

  get easeSignal(): "easy" | "hard" | "steady" {
    return this.snapshot.easeSignal;
  }

  get flashcardSet(): FlashcardSet {
    return this.snapshot.flashcardSet;
  }

  get practiceItems(): readonly PracticeItem[] {
    return this.snapshot.flashcardSet.cards.map((card) => ({
      id: card.id,
      prompt: card.front,
      expectedResponse: card.back,
      topic: card.topic,
      knowledgeGapId: card.knowledgeGapId,
      learningObjective: card.learningObjective,
      sourceMasterDataItemId: card.sourceMasterDataItemId,
      sourceVisibleSentence: card.sourceVisibleSentence
    }));
  }

  recordReviewSession(input: {
    completedAt: string;
    easeSignal: "easy" | "hard" | "steady";
    nextReviewAt: string;
    reviewIntervalHours: number;
    reviewSessionId: ActiveReviewSessionId;
  }): PracticeActivity {
    return new PracticeActivity({
      ...this.snapshot,
      reviewSessionIds: [...this.snapshot.reviewSessionIds, input.reviewSessionId],
      nextReviewAt: input.nextReviewAt,
      reviewIntervalHours: input.reviewIntervalHours,
      easeSignal: input.easeSignal,
      lastReviewedAt: input.completedAt
    });
  }

  toSnapshot(): PracticeActivitySnapshot {
    return {
      ...this.snapshot,
      targetKnowledgeGapIds: [...this.snapshot.targetKnowledgeGapIds],
      learningObjectives: [...this.snapshot.learningObjectives],
      sourceMasterDataItemIds: [...this.snapshot.sourceMasterDataItemIds],
      reviewSessionIds: [...this.snapshot.reviewSessionIds],
      flashcardSet: {
        instructions: this.snapshot.flashcardSet.instructions,
        cards: this.snapshot.flashcardSet.cards.map((card) => ({ ...card }))
      }
    };
  }
}
