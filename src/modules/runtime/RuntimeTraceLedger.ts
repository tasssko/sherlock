import type { LearningLoopRecord } from "../planning/LearningLoopRepository.js";
import { createLearningLoopRecord } from "../planning/LearningLoopRepository.js";
import { RuntimeTrace, type RuntimeTraceSeed } from "./RuntimeTrace.js";

export function appendSucceededRuntimeTrace(
  record: LearningLoopRecord,
  input: {
    producedDomainIds: readonly string[];
    seed?: RuntimeTraceSeed;
  }
): LearningLoopRecord {
  if (!input.seed) {
    return record;
  }

  return createLearningLoopRecord({
    ...record,
    runtimeConversationBindings: [...record.runtimeConversationBindings],
    runtimeTraces: [
      ...record.runtimeTraces,
      RuntimeTrace.succeed({
        seed: input.seed,
        producedDomainIds: input.producedDomainIds
      })
    ]
  });
}

export function appendFailedRuntimeTrace(
  record: LearningLoopRecord,
  input: {
    error: { code: string; message: string };
    producedDomainIds?: readonly string[];
    seed?: RuntimeTraceSeed;
  }
): LearningLoopRecord {
  if (!input.seed) {
    return record;
  }

  return createLearningLoopRecord({
    ...record,
    runtimeConversationBindings: [...record.runtimeConversationBindings],
    runtimeTraces: [
      ...record.runtimeTraces,
      RuntimeTrace.fail({
        seed: input.seed,
        producedDomainIds: input.producedDomainIds,
        error: input.error
      })
    ]
  });
}
