import type { Assessment } from "../../domain/learning/Assessment.js";
import type { LearningLoop } from "../../domain/learning/LearningLoop.js";
import type { Agent } from "../../domain/primitives/Agent.js";
import type { Artifact } from "../../domain/primitives/Artifact.js";
import type { DomainEventRecorder } from "../../domain/primitives/Event.js";
import type { Task } from "../../domain/primitives/Task.js";
import { Workspace } from "../../domain/primitives/Workspace.js";
import { ok } from "../../domain/primitives/result.js";
import type { AssessmentArtifactContent } from "../../domain/study/AssessmentGeneration.js";
import {
  createLearningLoopRecord,
  type LearningLoopRecord
} from "../planning/LearningLoopRepository.js";
import type { InitialAssessmentAggregate } from "./AssessmentProjector.js";
import type { RuntimeTraceSeed } from "../runtime/RuntimeTrace.js";
import {
  upsertRuntimeConversationBinding,
  type RuntimeConversationBinding
} from "../runtime/RuntimeConversationBinding.js";

export class WorkspaceAssessmentAssembler {
  assemble(input: {
    agent: Agent;
    artifact: Artifact<AssessmentArtifactContent, "assessment">;
    assessment: Assessment;
    events: DomainEventRecorder;
    learningLoop: LearningLoop;
    record?: LearningLoopRecord;
    runtimeConversationBinding?: RuntimeConversationBinding;
    runtimeTrace?: RuntimeTraceSeed;
    task: Task;
    workspace: Workspace;
  }) {
    const learningLoop = input.learningLoop.recordInitialAssessmentGenerated(
      {
        assessmentId: input.assessment.id,
        artifactId: input.artifact.id
      },
      input.events
    );

    let workspace = input.workspace.attachTask(input.task.id, input.events);
    workspace = workspace.attachArtifact(input.artifact.id, input.events);
    const allEvents = input.events.all();
    workspace = input.record
      ? workspace.appendEventLedger(allEvents.map((event) => event.id))
      : workspace.recordEventLedger(allEvents.map((event) => event.id));

    const existingRecord = input.record;
    const tasks = [...(existingRecord?.tasks ?? []), input.task];
    const artifacts = [...(existingRecord?.artifacts ?? []), input.artifact];
    const events = [...(existingRecord?.events ?? []), ...allEvents];
    const workPlans = [...(existingRecord?.workPlans ?? [])];
    const learningLoops = [
      ...(existingRecord?.learningLoops.filter((candidate) => candidate.id !== learningLoop.id) ?? []),
      learningLoop
    ];
    const assessments = [
      ...(existingRecord?.assessments ?? []),
      input.assessment
    ];

    return ok({
      record: createLearningLoopRecord({
        workspace,
        tasks,
        workPlans,
        artifacts,
        events,
        learningLoops,
        assessments,
        attempts: [...(existingRecord?.attempts ?? [])],
        evaluations: [...(existingRecord?.evaluations ?? [])],
        knowledgeGaps: [...(existingRecord?.knowledgeGaps ?? [])],
        masteryProfiles: [...(existingRecord?.masteryProfiles ?? [])],
        practiceActivities: [...(existingRecord?.practiceActivities ?? [])],
        activeReviewSessions: [...(existingRecord?.activeReviewSessions ?? [])],
        runtimeConversationBindings: upsertRuntimeConversationBinding(
          existingRecord?.runtimeConversationBindings ?? [],
          input.runtimeConversationBinding
        ),
        runtimeTraces: [...(existingRecord?.runtimeTraces ?? [])]
      }),
      aggregate: {
        workspace,
        learningLoop,
        agent: input.agent,
        task: input.task,
        assessment: input.assessment,
        artifact: input.artifact,
        events: allEvents,
        runtimeTrace: input.runtimeTrace
      } satisfies InitialAssessmentAggregate
    });
  }
}
