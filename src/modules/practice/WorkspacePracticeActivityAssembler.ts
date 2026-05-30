import type { LearningLoop } from "../../domain/learning/LearningLoop.js";
import type { PracticeActivity } from "../../domain/learning/PracticeActivity.js";
import type { Agent } from "../../domain/primitives/Agent.js";
import type { DomainEventRecorder } from "../../domain/primitives/Event.js";
import type { Task } from "../../domain/primitives/Task.js";
import { Workspace } from "../../domain/primitives/Workspace.js";
import { ok } from "../../domain/primitives/result.js";
import {
  createLearningLoopRecord,
  type LearningLoopRecord
} from "../planning/LearningLoopRepository.js";
import type { PracticeActivityAggregate } from "./PracticeActivityProjector.js";
import type { RuntimeTraceSeed } from "../runtime/RuntimeTrace.js";
import {
  upsertRuntimeConversationBinding,
  type RuntimeConversationBinding
} from "../runtime/RuntimeConversationBinding.js";

export class WorkspacePracticeActivityAssembler {
  assemble(input: {
    agent: Agent;
    events: DomainEventRecorder;
    learningLoop: LearningLoop;
    practiceActivity: PracticeActivity;
    record: LearningLoopRecord;
    runtimeConversationBinding?: RuntimeConversationBinding;
    runtimeTrace?: RuntimeTraceSeed;
    task: Task;
    workspace: Workspace;
  }) {
    const learningLoop = input.learningLoop.recordPracticeActivityGenerated(
      {
        practiceActivityId: input.practiceActivity.id,
        kind: input.practiceActivity.kind,
        targetKnowledgeGapIds: input.practiceActivity.targetKnowledgeGapIds,
        sourceMasterDataItemIds: input.practiceActivity.sourceMasterDataItemIds
      },
      input.events
    );

    let workspace = input.workspace.attachTask(input.task.id, input.events);
    const allEvents = input.events.all();
    workspace = workspace.appendEventLedger(allEvents.map((event) => event.id));

    return ok({
      record: createLearningLoopRecord({
        workspace,
        tasks: [...input.record.tasks, input.task],
        workPlans: [...input.record.workPlans],
        artifacts: [...input.record.artifacts],
        events: [...input.record.events, ...allEvents],
        learningLoops: [
          ...input.record.learningLoops.filter((candidate) => candidate.id !== learningLoop.id),
          learningLoop
        ],
        assessments: [...input.record.assessments],
        attempts: [...input.record.attempts],
        evaluations: [...input.record.evaluations],
        knowledgeGaps: [...input.record.knowledgeGaps],
        masteryProfiles: [...input.record.masteryProfiles],
        practiceActivities: [...input.record.practiceActivities, input.practiceActivity],
        activeReviewSessions: [...input.record.activeReviewSessions],
        runtimeConversationBindings: upsertRuntimeConversationBinding(
          input.record.runtimeConversationBindings,
          input.runtimeConversationBinding
        ),
        runtimeTraces: [...input.record.runtimeTraces]
      }),
      aggregate: {
        workspace,
        learningLoop,
        agent: input.agent,
        task: input.task,
        practiceActivity: input.practiceActivity,
        events: allEvents,
        runtimeTrace: input.runtimeTrace
      } satisfies PracticeActivityAggregate
    });
  }
}
