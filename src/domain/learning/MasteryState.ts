import type {
  LearningLoopId,
  MasteryStateId,
  QuestionSeedId
} from "../primitives/ids.js";
import { createMasteryStateId } from "../primitives/ids.js";

export type MasteryStateStatus = "weak" | "developing" | "secure";

export interface MasteryStateSnapshot {
  id: MasteryStateId;
  learningLoopId?: LearningLoopId;
  topic: string;
  seedId?: QuestionSeedId;
  status: MasteryStateStatus;
  score: number;
  lastReviewedAt?: string;
  nextReviewAt?: string;
  updatedAt: string;
}

export class MasteryState {
  private constructor(private readonly snapshot: MasteryStateSnapshot) {}

  static create(input: Omit<MasteryStateSnapshot, "id" | "updatedAt">): MasteryState {
    return new MasteryState({
      id: createMasteryStateId(),
      updatedAt: new Date().toISOString(),
      ...input
    });
  }

  static rehydrate(snapshot: MasteryStateSnapshot): MasteryState {
    return new MasteryState({ ...snapshot });
  }

  get id(): MasteryStateId {
    return this.snapshot.id;
  }

  get learningLoopId(): LearningLoopId | undefined {
    return this.snapshot.learningLoopId;
  }

  get topic(): string {
    return this.snapshot.topic;
  }

  get seedId(): QuestionSeedId | undefined {
    return this.snapshot.seedId;
  }

  record(input: {
    lastReviewedAt?: string;
    nextReviewAt?: string;
    score: number;
    status: MasteryStateStatus;
  }): MasteryState {
    return new MasteryState({
      ...this.snapshot,
      score: input.score,
      status: input.status,
      lastReviewedAt: input.lastReviewedAt,
      nextReviewAt: input.nextReviewAt,
      updatedAt: new Date().toISOString()
    });
  }

  toSnapshot(): MasteryStateSnapshot {
    return { ...this.snapshot };
  }
}
