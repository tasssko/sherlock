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
  createStudyWorkspaceRecord,
  type StudyWorkspaceRecord
} from "../planning/StudyPlanRepository.js";
import type { InitialAssessmentAggregate } from "./AssessmentProjector.js";

export class WorkspaceAssessmentAssembler {
  assemble(input: {
    agent: Agent;
    artifact: Artifact<AssessmentArtifactContent, "assessment">;
    assessment: Assessment;
    events: DomainEventRecorder;
    learningLoop: LearningLoop;
    record?: StudyWorkspaceRecord;
    task: Task;
    workspace: Workspace;
  }) {
    let learningLoop = input.learningLoop.attachAssessment(input.assessment.id, input.events);
    learningLoop = learningLoop.attachArtifact(input.artifact.id, input.events);

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
      record: createStudyWorkspaceRecord({
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
        masteryProfiles: [...(existingRecord?.masteryProfiles ?? [])]
      }),
      aggregate: {
        workspace,
        learningLoop,
        agent: input.agent,
        task: input.task,
        assessment: input.assessment,
        artifact: input.artifact,
        events: allEvents
      } satisfies InitialAssessmentAggregate
    });
  }
}
