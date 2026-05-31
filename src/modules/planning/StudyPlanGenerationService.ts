import { Artifact, ArtifactProvenance } from "../../domain/primitives/Artifact.js";
import { StudyPlanningContext } from "../../domain/primitives/Context.js";
import { createDomainEventRecorder } from "../../domain/primitives/Event.js";
import { err, type Result } from "../../domain/primitives/result.js";
import type { CreateStudyPlanCommand } from "../../domain/study/StudyPlanning.js";
import { LearningLoopSelector } from "../learning/LearningLoopSelector.js";
import type { LearningLoop } from "../../domain/learning/LearningLoop.js";
import type { LearningLoopRecord } from "./LearningLoopRepository.js";
import type { StudyPlanAggregate } from "./StudyPlanProjector.js";
import { StudyPlanAdaptation } from "./StudyPlanAdaptation.js";
import { StudyPlanTaskAssembler } from "./StudyPlanTaskAssembler.js";
import { StudyPlanWorkPlanBuilder } from "./StudyPlanWorkPlanBuilder.js";
import {
  createStudyPlannerAgent,
  validateGeneratedStudyPlan
} from "./StudyPlannerAgent.js";
import { WorkspaceStudyPlanAssembler } from "./WorkspaceStudyPlanAssembler.js";
import type { AgentRuntime } from "../runtime/AgentRuntime.js";
import { FixtureAgentRuntime } from "../runtime/FixtureAgentRuntime.js";
import type { RuntimeConversationBinding } from "../runtime/RuntimeConversationBinding.js";
import type { MasterDataInterpretationCandidate } from "../masterData/MasterDataInterpretation.js";
import { projectMasteryProfile } from "../mastery/MasteryStateService.js";

export interface GenerateStudyPlanInput {
  command: CreateStudyPlanCommand;
  existingRecord?: LearningLoopRecord;
  materialInterpretations?: readonly MasterDataInterpretationCandidate[];
}

export class StudyPlanGenerationService {
  constructor(
    private readonly loopSelector = new LearningLoopSelector(),
    private readonly adaptation = new StudyPlanAdaptation(),
    private readonly taskAssembler = new StudyPlanTaskAssembler(),
    private readonly workPlanBuilder = new StudyPlanWorkPlanBuilder(),
    private readonly aggregateAssembler = new WorkspaceStudyPlanAssembler(),
    private readonly runtime: AgentRuntime = new FixtureAgentRuntime()
  ) {}

  async run(input: GenerateStudyPlanInput): Promise<Result<StudyPlanAggregate>> {
    const workspace = input.existingRecord?.workspace;
    if (!workspace) {
      return err({
        code: "NOT_FOUND",
        message: "A learning loop must exist before generating a study plan."
      });
    }

    const events = createDomainEventRecorder(workspace.id);
    const topic = input.command.focusTopics[0] ?? "study";
    const learningLoop = this.loopSelector.findByTopic(input.existingRecord, topic);
    if (!learningLoop) {
      return err({
        code: "NOT_FOUND",
        message: `No diagnosed learning loop was found for topic ${topic}.`
      });
    }
    const loopKnowledgeGaps =
      input.existingRecord?.knowledgeGaps.filter((gap) => learningLoop.knowledgeGapIds.includes(gap.id)) ??
      [];
    const masteryProfile = input.existingRecord
      ? projectMasteryProfileForLoop(input.existingRecord, learningLoop)
      : undefined;
    const activeReviewSessions =
      input.existingRecord?.activeReviewSessions.filter(
        (candidate) => candidate.toSnapshot().learningLoopId === learningLoop.id
      ) ?? [];
    const adaptedPlan = this.adaptation.adapt({
      activeReviewSessions,
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
    const generated = await this.runtime.generateStudyPlan({
      context,
      learningLoopId: learningLoop.id,
      materialInterpretations: input.materialInterpretations,
      runtimeConversationBinding: input.existingRecord?.runtimeConversationBindings.find(
        (binding) => binding.learningLoopId === learningLoop.id
      )
    });
    if (!generated.ok) {
      return generated;
    }
    const policyEvaluation = validateGeneratedStudyPlan(
      agent,
      context,
      generated.value.artifactContent,
      events
    );
    if (!policyEvaluation.ok) {
      return policyEvaluation;
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

    const aggregate = this.aggregateAssembler.assemble({
      workspace,
      agent,
      parentTask: completedTasks.value.parentTask,
      completedChildTasks: completedTasks.value.childTasks,
      workPlan,
      artifact,
      learningLoop,
      knowledgeGaps: loopKnowledgeGaps,
      masteryProfile,
      events,
      runtimeTrace: generated.value.runtimeTrace
    });
    if (!aggregate.ok) {
      return aggregate;
    }

    return {
      ok: true,
      value: {
        ...aggregate.value,
        runtimeConversationBinding: generated.value.runtimeConversationBinding,
        runtimeTrace: generated.value.runtimeTrace,
        // keep aggregate shape, trace is internal-only
      }
    };
  }
}

function projectMasteryProfileForLoop(record: LearningLoopRecord, learningLoop: LearningLoop) {
  const topicStates = (record.masteryStates ?? []).filter(
    (candidate) =>
      candidate.learningLoopId === learningLoop.id && candidate.seedId === undefined
  );
  if (topicStates.length === 0) {
    return learningLoop.masteryProfileId
      ? record.masteryProfiles.find((candidate) => candidate.id === learningLoop.masteryProfileId)
      : undefined;
  }

  return projectMasteryProfile({
    existingProfile: learningLoop.masteryProfileId
      ? record.masteryProfiles.find((candidate) => candidate.id === learningLoop.masteryProfileId)
      : undefined,
    learningLoop,
    topicStates
  });
}
