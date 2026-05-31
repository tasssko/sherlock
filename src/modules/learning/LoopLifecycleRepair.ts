import { createDomainEventRecorder } from "../../domain/primitives/Event.js";
import { err, ok, type Result } from "../../domain/primitives/result.js";
import {
  createLearningLoopRecord,
  type LearningLoopRecord
} from "../planning/LearningLoopRepository.js";
import type { LearnerWorkspaceKey } from "../planning/LearnerWorkspaceKey.js";

export interface LearningLoopRepairCandidate {
  learnerKey: string;
  learningLoopId: string;
  topic: string;
  phase: string;
  status: string;
  reason: string;
}

export function findStrandedLearningLoops(
  learnerKey: LearnerWorkspaceKey,
  record: LearningLoopRecord
): readonly LearningLoopRepairCandidate[] {
  return record.learningLoops
    .filter((loop) => isStrandedLearningLoop(loop.toSnapshot()))
    .map((loop) => ({
      learnerKey: learnerKey.value,
      learningLoopId: loop.id,
      topic: loop.topic,
      phase: loop.phase,
      status: loop.status,
      reason: "legacy study-planning loop has no work plan and should not remain active"
    }));
}

export function supersedeLearningLoop(
  record: LearningLoopRecord,
  learningLoopId: string
): Result<LearningLoopRecord> {
  const target = record.learningLoops.find((candidate) => candidate.id === (learningLoopId as never));
  if (!target) {
    return err({
      code: "NOT_FOUND",
      message: `Learning loop ${learningLoopId} was not found in the selected record.`
    });
  }

  const events = createDomainEventRecorder(record.workspace.id);
  const learningLoops = record.learningLoops.map((candidate) =>
    candidate.id === target.id ? candidate.supersede(events) : candidate
  );
  const newEvents = events.all();
  const workspace = newEvents.length
    ? record.workspace.appendEventLedger(newEvents.map((event) => event.id))
    : record.workspace;

  return ok(
    createLearningLoopRecord({
      ...record,
      workspace,
      events: [...record.events, ...newEvents],
      learningLoops
    })
  );
}

function isStrandedLearningLoop(snapshot: {
  phase: string;
  status?: string;
  workPlanIds: readonly string[];
}): boolean {
  return (
    (snapshot.status ?? "active") === "active" &&
    snapshot.phase === "study-planning" &&
    snapshot.workPlanIds.length === 0
  );
}
