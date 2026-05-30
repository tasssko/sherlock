import { Artifact, ArtifactProvenance } from "../../domain/primitives/Artifact.js";
import { StudyPlanningContext } from "../../domain/primitives/Context.js";
import { createDomainEventRecorder } from "../../domain/primitives/Event.js";
import { Workspace } from "../../domain/primitives/Workspace.js";
import type { Result } from "../../domain/primitives/result.js";
import type { CreateStudyPlanCommand } from "../../domain/study/StudyPlanning.js";
import { LearningLoopSelector } from "../learning/LearningLoopSelector.js";
import type { StudyWorkspaceRecord } from "./StudyPlanRepository.js";
import type { StudyPlanAggregate } from "./StudyPlanProjector.js";
import { StudyPlanAdaptation } from "./StudyPlanAdaptation.js";
import { StudyPlanTaskAssembler } from "./StudyPlanTaskAssembler.js";
import { StudyPlanWorkPlanBuilder } from "./StudyPlanWorkPlanBuilder.js";
import { createStudyPlannerAgent, generateStudyPlan } from "./StudyPlannerAgent.js";
import { WorkspaceStudyPlanAssembler } from "./WorkspaceStudyPlanAssembler.js";

export interface StudyPlanWorkflowInput {
  command: CreateStudyPlanCommand;
  existingRecord?: StudyWorkspaceRecord;
}

export class StudyPlanWorkflow {
  constructor(
    private readonly loopSelector = new LearningLoopSelector(),
    private readonly adaptation = new StudyPlanAdaptation(),
    private readonly taskAssembler = new StudyPlanTaskAssembler(),
    private readonly workPlanBuilder = new StudyPlanWorkPlanBuilder(),
    private readonly aggregateAssembler = new WorkspaceStudyPlanAssembler()
  ) {}

  run(input: StudyPlanWorkflowInput): Result<StudyPlanAggregate> {
    let workspace =
      input.existingRecord?.workspace ??
      Workspace.create({
        title: input.command.workspaceLabel ?? `${input.command.learnerName} Study Workspace`,
        learner: {
          name: input.command.learnerName,
          yearGroup: input.command.yearGroup,
          availableMinutesByDay: input.command.availableMinutesByDay
        },
        activeObjective: input.command.objective
      });

    const events = createDomainEventRecorder(workspace.id);
    const topic = input.command.focusTopics[0] ?? "study";
    const learningLoop = this.loopSelector.findOrCreate({
      objective: input.command.objective,
      record: input.existingRecord,
      topic,
      workspace,
      events
    });
    const loopKnowledgeGaps =
      input.existingRecord?.knowledgeGaps.filter((gap) => learningLoop.knowledgeGapIds.includes(gap.id)) ??
      [];
    const masteryProfile = input.existingRecord?.masteryProfiles.find(
      (candidate) => candidate.id === learningLoop.toSnapshot().masteryProfileId
    );
    const adaptedPlan = this.adaptation.adapt({
      command: input.command,
      learningLoop,
      knowledgeGaps: loopKnowledgeGaps,
      masteryProfile
    });
    const context = StudyPlanningContext.fromCommand(input.command, {
      diagnosedGaps: adaptedPlan.diagnosedGaps,
      focusTopics: adaptedPlan.focusTopics,
      learningLoopId: learningLoop.id,
      objective: adaptedPlan.objective
    });

    const taskAssembly = this.taskAssembler.create(context, workspace.id, events);
    if (!taskAssembly.ok) {
      return taskAssembly;
    }

    let workPlan = this.workPlanBuilder.create(
      context,
      workspace.id,
      taskAssembly.value.childTasks,
      events
    );

    const agent = createStudyPlannerAgent();
    const generated = generateStudyPlan(agent, context, events);
    if (!generated.ok) {
      return generated;
    }

    const artifact = Artifact.create(
      {
        workspaceId: workspace.id,
        taskId: taskAssembly.value.parentTask.id,
        type: "study-plan",
        content: generated.value.artifactContent,
        provenance: ArtifactProvenance.create({
          controller: "StudyPlanController",
          taskId: taskAssembly.value.parentTask.id,
          agentId: agent.id,
          sourceArtifactIds: [],
          sourceTopics: [],
          facts: context.facts().map((fact) => `${fact.label}: ${fact.value}`),
          assumptions: generated.value.assumptions.map((assumption) => assumption.statement),
          decisions: generated.value.decisions
        })
      },
      events
    );

    workPlan = this.workPlanBuilder.applyPlannerOutput(workPlan, generated.value, artifact.id, events);

    const completedTasks = this.taskAssembler.complete(
      {
        artifactId: artifact.id,
        artifactSummary: generated.value.artifactContent.summary,
        childTaskSummaries: generated.value.childTaskSummaries,
        taskAssembly: taskAssembly.value
      },
      events
    );
    if (!completedTasks.ok) {
      return completedTasks;
    }

    return this.aggregateAssembler.assemble({
      workspace,
      agent,
      parentTask: completedTasks.value.parentTask,
      completedChildTasks: completedTasks.value.childTasks,
      workPlan,
      artifact,
      learningLoop,
      knowledgeGaps: loopKnowledgeGaps,
      masteryProfile,
      events
    });
  }
}
