import { InitialAssessmentContext } from "../../domain/primitives/Context.js";
import { createDomainEventRecorder } from "../../domain/primitives/Event.js";
import { Workspace } from "../../domain/primitives/Workspace.js";
import { type Result } from "../../domain/primitives/result.js";
import type { CreateInitialAssessmentCommand } from "../../domain/study/AssessmentGeneration.js";
import { LearningLoopSelector } from "../learning/LearningLoopSelector.js";
import type { LearningLoopRecord } from "../planning/LearningLoopRepository.js";
import { AssessmentTaskAssembler } from "./AssessmentTaskAssembler.js";
import type { InitialAssessmentAggregate } from "./AssessmentProjector.js";
import { InitialAssessmentAssembler } from "./InitialAssessmentAssembler.js";
import { MasterDataSourceSelector } from "./MasterDataSourceSelector.js";
import { WorkspaceAssessmentAssembler } from "./WorkspaceAssessmentAssembler.js";
import { FixtureAgentRuntime } from "../runtime/FixtureAgentRuntime.js";
import { appendSucceededRuntimeTrace } from "../runtime/RuntimeTraceLedger.js";

export interface InitialAssessmentServiceResult {
  aggregate: InitialAssessmentAggregate;
  record: LearningLoopRecord;
}

export class InitialAssessmentService {
  constructor(
    private readonly sourceSelector: MasterDataSourceSelector,
    private readonly loopSelector = new LearningLoopSelector(),
    private readonly taskAssembler = new AssessmentTaskAssembler(),
    private readonly assessmentAssembler = new InitialAssessmentAssembler(new FixtureAgentRuntime()),
    private readonly workspaceAssembler = new WorkspaceAssessmentAssembler()
  ) {}

  async run(
    command: CreateInitialAssessmentCommand,
    record?: LearningLoopRecord
  ): Promise<Result<InitialAssessmentServiceResult>> {
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
    const learningLoop =
      this.loopSelector.findByTopic(record, command.topic) ??
      this.loopSelector.createForInitialAssessment({
        objective: `Build secure understanding in ${command.topic}.`,
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
    const assembled = await this.assessmentAssembler.assemble({
      context,
      events,
      learningLoop,
      runtimeConversationBinding: record?.runtimeConversationBindings.find(
        (binding) => binding.learningLoopId === learningLoop.id
      ),
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

    const assembledWorkspace = this.workspaceAssembler.assemble({
      agent: assembled.value.agent,
      artifact: assembled.value.artifact,
      assessment: assembled.value.assessment,
      events,
      learningLoop,
      record,
      runtimeConversationBinding: assembled.value.runtimeConversationBinding,
      runtimeTrace: assembled.value.runtimeTrace,
      task: completedTask.value,
      workspace
    });
    if (!assembledWorkspace.ok) {
      return assembledWorkspace;
    }

    return {
      ok: true,
      value: {
        aggregate: assembledWorkspace.value.aggregate,
        record: appendSucceededRuntimeTrace(assembledWorkspace.value.record, {
          seed: assembled.value.runtimeTrace,
          producedDomainIds: [
            assembled.value.assessment.id,
            assembled.value.artifact.id,
            completedTask.value.id
          ]
        })
      }
    };
  }
}
