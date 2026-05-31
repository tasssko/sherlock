import type {
  KnowledgeGapId,
  LearningLoopId,
  LearningLoopUnitId
} from "../primitives/ids.js";
import { createLearningLoopUnitId } from "../primitives/ids.js";
import type { LearningLoopUnitState } from "../study/LoopBatches.js";

export interface LoopUnitSnapshot {
  id: LearningLoopUnitId;
  learningLoopId: LearningLoopId;
  focus: string;
  reason: string;
  objectiveRefs: readonly string[];
  sourceRefs: readonly string[];
  shortExplanation: string;
  learnerTask: string;
  targetKnowledgeGapIds: readonly KnowledgeGapId[];
  state: LearningLoopUnitState;
  sequence: number;
  createdAt: string;
}

export class LoopUnit {
  private constructor(private readonly snapshot: LoopUnitSnapshot) {}

  static create(input: Omit<LoopUnitSnapshot, "createdAt" | "id">): LoopUnit {
    return new LoopUnit({
      id: createLearningLoopUnitId(),
      createdAt: new Date().toISOString(),
      ...input,
      objectiveRefs: [...input.objectiveRefs],
      sourceRefs: [...input.sourceRefs],
      targetKnowledgeGapIds: [...input.targetKnowledgeGapIds]
    });
  }

  static rehydrate(snapshot: LoopUnitSnapshot): LoopUnit {
    return new LoopUnit({
      ...snapshot,
      objectiveRefs: [...snapshot.objectiveRefs],
      sourceRefs: [...snapshot.sourceRefs],
      targetKnowledgeGapIds: [...snapshot.targetKnowledgeGapIds]
    });
  }

  get id(): LearningLoopUnitId {
    return this.snapshot.id;
  }

  get learningLoopId(): LearningLoopId {
    return this.snapshot.learningLoopId;
  }

  get state(): LearningLoopUnitState {
    return this.snapshot.state;
  }

  get sequence(): number {
    return this.snapshot.sequence;
  }

  recordState(state: LearningLoopUnitState): LoopUnit {
    return new LoopUnit({
      ...this.snapshot,
      state
    });
  }

  toSnapshot(): LoopUnitSnapshot {
    return {
      ...this.snapshot,
      objectiveRefs: [...this.snapshot.objectiveRefs],
      sourceRefs: [...this.snapshot.sourceRefs],
      targetKnowledgeGapIds: [...this.snapshot.targetKnowledgeGapIds]
    };
  }
}

export function firstActionableLoopUnit(
  loopUnits: readonly LoopUnit[]
): LoopUnit | undefined {
  const sorted = [...loopUnits].sort((left, right) => left.sequence - right.sequence);
  return (
    sorted.find((candidate) => candidate.state === "in_progress") ??
    sorted.find((candidate) => candidate.state === "ready")
  );
}

export function markFirstReadyLoopUnitInProgress(
  loopUnits: readonly LoopUnit[]
): readonly LoopUnit[] {
  let activated = false;
  return [...loopUnits]
    .sort((left, right) => left.sequence - right.sequence)
    .map((candidate) => {
      if (activated || candidate.state !== "ready") {
        return candidate;
      }

      activated = true;
      return candidate.recordState("in_progress");
    });
}

export function completeCurrentLoopUnit(
  loopUnits: readonly LoopUnit[]
): readonly LoopUnit[] {
  let completed = false;
  let unlocked = false;

  return [...loopUnits]
    .sort((left, right) => left.sequence - right.sequence)
    .map((candidate) => {
      if (!completed && (candidate.state === "in_progress" || candidate.state === "ready")) {
        completed = true;
        return candidate.recordState("completed");
      }

      if (completed && !unlocked && candidate.state === "locked") {
        unlocked = true;
        return candidate.recordState("ready");
      }

      return candidate;
    });
}
