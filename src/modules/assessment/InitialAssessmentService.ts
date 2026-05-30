import { InitialAssessmentContext } from "../../domain/primitives/Context.js";
import { createDomainEventRecorder } from "../../domain/primitives/Event.js";
import { Workspace } from "../../domain/primitives/Workspace.js";
import { type Result } from "../../domain/primitives/result.js";
import type { CreateInitialAssessmentCommand } from "../../domain/study/AssessmentGeneration.js";
import { LearningLoopSelector } from "../learning/LearningLoopSelector.js";
import type { StudyWorkspaceRecord } from "../planning/StudyPlanRepository.js";
import { AssessmentTaskAssembler } from "./AssessmentTaskAssembler.js";
import type { InitialAssessmentAggregate } from "./AssessmentProjector.js";
import { InitialAssessmentAssembler } from "./InitialAssessmentAssembler.js";
import { MasterDataSourceSelector } from "./MasterDataSourceSelector.js";
import { WorkspaceAssessmentAssembler } from "./WorkspaceAssessmentAssembler.js";

export interface InitialAssessmentServiceResult {
  aggregate: InitialAssessmentAggregate;
  record: StudyWorkspaceRecord;
}

export class InitialAssessmentService {
  constructor(
    private readonly sourceSelector: MasterDataSourceSelector,
    private readonly loopSelector = new LearningLoopSelector(),
    private readonly taskAssembler = new AssessmentTaskAssembler(),
    private readonly assessmentAssembler = new InitialAssessmentAssembler(),
    private readonly workspaceAssembler = new WorkspaceAssessmentAssembler()
  ) {}

  run(
    command: CreateInitialAssessmentCommand,
    record?: StudyWorkspaceRecord
  ): Result<InitialAssessmentServiceResult> {
    const sourceSelection = this.sourceSelector.select(command.topic, command.questionCount);
    if (!sourceSelection.ok) {
      return sourceSelection;
    }

    const workspace =
      record?.workspace ??
      Workspace.create({
        title: `${command.learnerName} Study Workspace`,
        learner: {
          name: command.learnerName,
          yearGroup: command.yearGroup,
          availableMinutesByDay: {}
        },
        activeObjective: `Diagnose and improve ${command.topic}.`
      });
    const events = createDomainEventRecorder(workspace.id);
    const learningLoop = this.loopSelector.findOrCreate({
      objective: `Build secure understanding in ${command.topic}.`,
      record,
      topic: command.topic,
      workspace,
      events,
      sourceIds: [sourceSelection.value.source.id]
    });
    const context = InitialAssessmentContext.create({
      command,
      sourceName: sourceSelection.value.source.name
    });
    const task = this.taskAssembler.create(context, workspace.id, events);
    const assembled = this.assessmentAssembler.assemble({
      context,
      events,
      learningLoop,
      source: sourceSelection.value.source,
      sourceItems: sourceSelection.value.items,
      task,
      workspace
    });
    if (!assembled.ok) {
      return assembled;
    }

    const completedTask = this.taskAssembler.complete(
      task,
      assembled.value.artifact.id,
      `${command.topic} initial assessment with ${command.questionCount} items.`,
      events
    );
    if (!completedTask.ok) {
      return completedTask;
    }

    return this.workspaceAssembler.assemble({
      agent: assembled.value.agent,
      artifact: assembled.value.artifact,
      assessment: assembled.value.assessment,
      events,
      learningLoop,
      record,
      task: completedTask.value,
      workspace
    });
  }
}
