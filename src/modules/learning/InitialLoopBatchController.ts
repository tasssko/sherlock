import { KnowledgeGap, LearningLoop } from "../../domain/learning/LearningLoop.js";
import { LearningLoopBatch } from "../../domain/learning/LearningLoopBatch.js";
import type { Controller } from "../../domain/primitives/Controller.js";
import { createDomainEventRecorder } from "../../domain/primitives/Event.js";
import { err, ok, type Result } from "../../domain/primitives/result.js";
import { Workspace } from "../../domain/primitives/Workspace.js";
import type {
  CreateInitialLoopBatchCommand,
  InitialLoopBatchResponse
} from "../../domain/study/LoopStart.js";
import { MasterDataSourceSelector } from "../assessment/MasterDataSourceSelector.js";
import { createLearningLoopRecord, type LearningLoopRepository } from "../planning/LearningLoopRepository.js";
import { LearnerWorkspaceKey } from "../planning/LearnerWorkspaceKey.js";
import { LearningLoopSelector } from "./LearningLoopSelector.js";
import { NextActionProjector } from "./NextActionProjector.js";
import type { AgentRuntime } from "../runtime/AgentRuntime.js";
import { FixtureAgentRuntime } from "../runtime/FixtureAgentRuntime.js";
import { appendSucceededRuntimeTrace } from "../runtime/RuntimeTraceLedger.js";
import { upsertRuntimeConversationBinding } from "../runtime/RuntimeConversationBinding.js";
import type { MasterDataInterpretationCandidate } from "../masterData/MasterDataInterpretation.js";
import {
  deriveCanonicalLoopStructure,
  deriveQuestionBankFromLoopBatch,
  projectLoopBatchFromCanonical
} from "../questions/QuestionBankLoopAdapter.js";

export class InitialLoopBatchController
  implements Controller<CreateInitialLoopBatchCommand, InitialLoopBatchResponse>
{
  private readonly sourceSelector: MasterDataSourceSelector;
  private readonly loopSelector = new LearningLoopSelector();
  private readonly nextActionProjector = new NextActionProjector();

  constructor(
    private readonly repository: LearningLoopRepository,
    private readonly runtime: AgentRuntime = new FixtureAgentRuntime()
  ) {
    this.sourceSelector = new MasterDataSourceSelector(repository);
  }

  async execute(command: CreateInitialLoopBatchCommand): Promise<Result<InitialLoopBatchResponse>> {
    const sourceSelection = this.sourceSelector.select(command.topic, 1);
    if (!sourceSelection.ok) {
      return sourceSelection;
    }

    const interpretation = sourceSelection.value.source.acceptedInterpretation;
    if (!interpretation) {
      return err({
        code: "VALIDATION_ERROR",
        message: `No accepted material interpretation was found for topic ${command.topic}.`
      });
    }

    const key = LearnerWorkspaceKey.fromLearner(command.learnerName, command.yearGroup);
    const record = this.repository.findRecord(key);
    const workspace =
      record?.workspace ??
      Workspace.create({
        title: `${command.learnerName} Study Workspace`,
        learner: {
          name: command.learnerName,
          yearGroup: command.yearGroup,
          availableMinutesByDay: {}
        },
        activeObjective: command.objective
      });
    const events = createDomainEventRecorder(workspace.id);
    let effectiveRecord = record;
    let learningLoop = this.loopSelector.findByTopic(record, command.topic);

    if (record) {
      const reconciledLoops = this.loopSelector.reconcileTopicLoops(
        record,
        command.topic,
        learningLoop?.id,
        events
      );
      effectiveRecord = createLearningLoopRecord({
        ...record,
        learningLoops: reconciledLoops
      });
    }

    if (!learningLoop) {
      learningLoop = LearningLoop.create(
        {
          workspaceId: workspace.id,
          objective: command.objective,
          topic: command.topic,
          sourceIds: [sourceSelection.value.source.id]
        },
        events
      );
    }
    const activeLoop = learningLoop;

    const plannedGaps = buildPlannedFocusGaps({
      desiredLoopCount: command.desiredLoopCount,
      interpretation,
      learningLoopId: activeLoop.id
    });

    const loopBatchCandidate = await this.runtime.generateLearningLoopBatch({
      desiredLoopCount: command.desiredLoopCount,
      learningLoopId: activeLoop.id,
      materialInterpretation: interpretation,
      targetLoopDurationMinutes: 5,
      diagnosedGaps: plannedGaps.map((gap) => gap.toSnapshot()),
      evaluation: {
        itemResults: [],
        score: 0
      },
      learnerYearGroup: command.yearGroup,
      runtimeConversationBinding: effectiveRecord?.runtimeConversationBindings.find(
        (binding) => binding.learningLoopId === activeLoop.id
      )
    });
    if (!loopBatchCandidate.ok) {
      return loopBatchCandidate;
    }

    const loopBatch = LearningLoopBatch.create({
      learningLoopId: activeLoop.id,
      overview: loopBatchCandidate.value.overview,
      targetDurationMinutes: loopBatchCandidate.value.targetDurationMinutes,
      units: loopBatchCandidate.value.units
    });

    const currentTargetGapIds =
      loopBatch.firstActionableUnit()?.targetKnowledgeGapIds ?? plannedGaps.slice(0, 1).map((gap) => gap.id);
    learningLoop = activeLoop.identifyKnowledgeGaps(currentTargetGapIds, events);
    const derivedQuestionBank = deriveQuestionBankFromLoopBatch({
      learningLoopId: activeLoop.id,
      topic: interpretation.mainTopic,
      loopBatch: loopBatch.toSnapshot()
    });
    const canonicalLoopStructure = deriveCanonicalLoopStructure({
      learningLoopId: activeLoop.id,
      loopBatch: loopBatch.toSnapshot(),
      questionVariants: derivedQuestionBank.questionVariants
    });

    const newEvents = events.all();
    const nextWorkspace = workspace.appendEventLedger(newEvents.map((event) => event.id));
    const updatedRecord = appendSucceededRuntimeTrace(
      createLearningLoopRecord({
        workspace: nextWorkspace,
        tasks: [...(effectiveRecord?.tasks ?? [])],
        workPlans: [...(effectiveRecord?.workPlans ?? [])],
        artifacts: [...(effectiveRecord?.artifacts ?? [])],
        events: [...(effectiveRecord?.events ?? []), ...newEvents],
        learningLoops: [
          ...(effectiveRecord?.learningLoops.filter((candidate) => candidate.id !== learningLoop.id) ?? []),
          learningLoop
        ],
        assessments: [...(effectiveRecord?.assessments ?? [])],
        attempts: [...(effectiveRecord?.attempts ?? [])],
        evaluations: [...(effectiveRecord?.evaluations ?? [])],
        knowledgeGaps: [
          ...(effectiveRecord?.knowledgeGaps.filter(
            (candidate) => candidate.toSnapshot().learningLoopId !== learningLoop.id
          ) ?? []),
          ...plannedGaps
        ],
        learnerEvidence: [...(effectiveRecord?.learnerEvidence ?? [])],
        masteryStates: [...(effectiveRecord?.masteryStates ?? [])],
        masteryProfiles: [...(effectiveRecord?.masteryProfiles ?? [])],
        practiceActivities: [...(effectiveRecord?.practiceActivities ?? [])],
        activeReviewSessions: [...(effectiveRecord?.activeReviewSessions ?? [])],
        loopBatches: [
          ...(effectiveRecord?.loopBatches.filter(
            (candidate) => candidate.learningLoopId !== learningLoop.id
          ) ?? []),
          loopBatch
        ],
        loopUnits: [
          ...(effectiveRecord?.loopUnits?.filter(
            (candidate) => candidate.learningLoopId !== learningLoop.id
          ) ?? []),
          ...canonicalLoopStructure.loopUnits
        ],
        loopUnitQuestionAssignments: [
          ...(effectiveRecord?.loopUnitQuestionAssignments?.filter(
            (candidate) => candidate.learningLoopId !== learningLoop.id
          ) ?? []),
          ...canonicalLoopStructure.loopUnitQuestionAssignments
        ],
        questionSeeds: [
          ...(effectiveRecord?.questionSeeds?.filter(
            (candidate) => candidate.learningLoopId !== learningLoop.id
          ) ?? []),
          ...derivedQuestionBank.questionSeeds
        ],
        questionVariants: [
          ...(effectiveRecord?.questionVariants?.filter(
            (candidate) => candidate.learningLoopId !== learningLoop.id
          ) ?? []),
          ...derivedQuestionBank.questionVariants
        ],
        runtimeConversationBindings: upsertRuntimeConversationBinding(
          effectiveRecord?.runtimeConversationBindings ?? [],
          loopBatchCandidate.value.runtimeConversationBinding
        ),
        runtimeTraces: [...(effectiveRecord?.runtimeTraces ?? [])]
      }),
      {
        seed: loopBatchCandidate.value.runtimeTrace,
        producedDomainIds: [loopBatch.id, ...plannedGaps.map((gap) => gap.id), ...loopBatch.toSnapshot().units.map((unit) => unit.id)]
      }
    );

    const projectedLoopBatch =
      projectLoopBatchFromCanonical({
        loopBatch: loopBatch.toSnapshot(),
        learningLoopId: learningLoop.id,
        loopUnits: canonicalLoopStructure.loopUnits,
        loopUnitQuestionAssignments: canonicalLoopStructure.loopUnitQuestionAssignments,
        questionVariants: derivedQuestionBank.questionVariants
      }) ?? loopBatch.toSnapshot();

    this.repository.saveRecord(key, updatedRecord);

    return ok({
      learningLoopId: learningLoop.id,
      phase: learningLoop.phase,
      nextAction: this.nextActionProjector.project({
        learningLoop,
        loopBatch,
        loopUnits: canonicalLoopStructure.loopUnits
      }),
      workspace: nextWorkspace.toSnapshot(),
      learningLoop: learningLoop.toSnapshot(),
      knowledgeGaps: plannedGaps.map((gap) => gap.toSnapshot()),
      loopBatch: projectedLoopBatch,
      events: newEvents
    });
  }
}

function buildPlannedFocusGaps(input: {
  desiredLoopCount: number;
  interpretation: MasterDataInterpretationCandidate;
  learningLoopId: string;
}): readonly KnowledgeGap[] {
  const objectives = input.interpretation.learningObjectives
    .slice(0, input.desiredLoopCount)
    .map((objective: { objective: string; sourceRefs: readonly string[] }) => ({
      description: objective.objective,
      evidence: objective.sourceRefs.join(", ")
    }));

  const fallbackSubtopics = input.interpretation.subtopics
    .filter((subtopic: string) => subtopic.trim().length > 0)
    .slice(0, Math.max(input.desiredLoopCount - objectives.length, 0))
    .map((subtopic: string) => ({
      description: `Build secure understanding in ${subtopic}.`,
      evidence: subtopic
    }));

  const seeds = [...objectives, ...fallbackSubtopics];
  const finalSeeds =
    seeds.length > 0
      ? seeds
      : [
          {
            description: `Build secure understanding in ${input.interpretation.mainTopic}.`,
            evidence: input.interpretation.mainTopic
          }
        ];

  return finalSeeds.map((seed) =>
    KnowledgeGap.create({
      learningLoopId: input.learningLoopId as never,
      topic: input.interpretation.mainTopic,
      description: seed.description,
      evidence: seed.evidence,
      severity: "medium"
    })
  );
}
