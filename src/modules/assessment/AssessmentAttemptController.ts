import type { Controller } from "../../domain/primitives/Controller.js";
import { err, ok, type Result } from "../../domain/primitives/result.js";
import type {
  AssessmentAttemptResponse,
  SubmitAssessmentAttemptCommand
} from "../../domain/study/AssessmentGeneration.js";
import { createDomainEventRecorder } from "../../domain/primitives/Event.js";
import {
  createLearningLoopRecord,
  type LearningLoopRepository
} from "../planning/LearningLoopRepository.js";
import { AssessmentAttemptEvaluator } from "./AssessmentAttemptEvaluator.js";
import { LearningLoopBatch } from "../../domain/learning/LearningLoopBatch.js";
import type { MasterDataItem, MasterDataSource } from "../../domain/learning/MasterData.js";
import type { AgentRuntime } from "../runtime/AgentRuntime.js";
import { FixtureAgentRuntime } from "../runtime/FixtureAgentRuntime.js";
import { NextActionProjector } from "../learning/NextActionProjector.js";
import { appendSucceededRuntimeTrace } from "../runtime/RuntimeTraceLedger.js";
import { upsertRuntimeConversationBinding } from "../runtime/RuntimeConversationBinding.js";
import {
  deriveCanonicalLoopStructure,
  deriveQuestionBankFromLoopBatch,
  projectLoopBatchFromCanonical
} from "../questions/QuestionBankLoopAdapter.js";

export class AssessmentAttemptController
  implements Controller<SubmitAssessmentAttemptCommand, AssessmentAttemptResponse>
{
  private readonly evaluator: AssessmentAttemptEvaluator;
  private readonly nextActionProjector = new NextActionProjector();
  private readonly runtime: AgentRuntime;

  constructor(
    private readonly repository: LearningLoopRepository,
    runtime: AgentRuntime = new FixtureAgentRuntime()
  ) {
    this.runtime = runtime;
    this.evaluator = new AssessmentAttemptEvaluator(runtime);
  }

  async execute(command: SubmitAssessmentAttemptCommand): Promise<Result<AssessmentAttemptResponse>> {
    const located = this.repository.findRecordByAssessmentId(command.assessmentId as never);
    if (!located) {
      return err({
        code: "NOT_FOUND",
        message: `Assessment ${command.assessmentId} was not found.`
      });
    }

    const assessment = located.record.assessments.find(
      (candidate) => candidate.id === (command.assessmentId as never)
    );
    if (!assessment) {
      return err({
        code: "NOT_FOUND",
        message: `Assessment ${command.assessmentId} was not found.`
      });
    }

    const learningLoop = located.record.learningLoops.find(
      (candidate) => candidate.id === assessment.learningLoopId
    );
    if (!learningLoop) {
      return err({
        code: "NOT_FOUND",
        message: `Learning loop for assessment ${command.assessmentId} was not found.`
      });
    }

    const events = createDomainEventRecorder(located.record.workspace.id);
    const loopSourceRecords = this.repository.findMasterDataBySourceIds(
      learningLoop.toSnapshot().sourceIds
    );
    const fallbackTopicSourceRecords = this.repository.findMasterDataByTopic(learningLoop.topic);
    const selectedSourceRecord =
      rankSourceRecords(loopSourceRecords).find((entry) => entry.source.acceptedInterpretation) ??
      rankSourceRecords(fallbackTopicSourceRecords).find(
        (entry) => entry.source.acceptedInterpretation
      );
    const materialInterpretation = selectedSourceRecord?.source.acceptedInterpretation;
    const sourceItems = selectedSourceRecord?.items ?? loopSourceRecords.flatMap((entry) => entry.items);
    if (!materialInterpretation) {
      return err({
        code: "VALIDATION_ERROR",
        message: `No accepted material interpretation was found for topic ${learningLoop.topic}.`
      });
    }
    const evaluation = await this.evaluator.evaluate({
      assessment,
      command,
      events,
      learningLoop,
      materialInterpretation,
      sourceItems,
      runtimeConversationBinding: located.record.runtimeConversationBindings.find(
        (binding) => binding.learningLoopId === learningLoop.id
      )
    });
    if (!evaluation.ok) {
      return evaluation;
    }

    if (evaluation.value.knowledgeGaps.length === 0) {
      const securedLearningLoop = evaluation.value.learningLoop.recordAssessmentSecured(events);
      const newEvents = events.all();
      const workspace = located.record.workspace.appendEventLedger(newEvents.map((event) => event.id));
      const updatedRecord = appendSucceededRuntimeTrace(
        createLearningLoopRecord({
          workspace,
          tasks: [...located.record.tasks],
          workPlans: [...located.record.workPlans],
          artifacts: [...located.record.artifacts],
          events: [...located.record.events, ...newEvents],
          learningLoops: [
            ...located.record.learningLoops.filter((candidate) => candidate.id !== learningLoop.id),
            securedLearningLoop
          ],
          assessments: [...located.record.assessments],
          attempts: [...located.record.attempts, evaluation.value.attempt],
          evaluations: [...located.record.evaluations, evaluation.value.evaluation],
          knowledgeGaps: [...located.record.knowledgeGaps],
          learnerEvidence: [...(located.record.learnerEvidence ?? [])],
          masteryStates: [...(located.record.masteryStates ?? [])],
          masteryProfiles: [...located.record.masteryProfiles],
          practiceActivities: [...located.record.practiceActivities],
          activeReviewSessions: [...located.record.activeReviewSessions],
          loopBatches: located.record.loopBatches.filter(
            (candidate) => candidate.learningLoopId !== securedLearningLoop.id
          ),
          loopUnits: (located.record.loopUnits ?? []).filter(
            (candidate) => candidate.learningLoopId !== securedLearningLoop.id
          ),
          loopUnitQuestionAssignments: (located.record.loopUnitQuestionAssignments ?? []).filter(
            (candidate) => candidate.learningLoopId !== securedLearningLoop.id
          ),
          questionSeeds: [...(located.record.questionSeeds ?? [])],
          questionVariants: [...(located.record.questionVariants ?? [])],
          runtimeConversationBindings: upsertRuntimeConversationBinding(
            located.record.runtimeConversationBindings,
            evaluation.value.runtimeConversationBinding
          ),
          runtimeTraces: [...located.record.runtimeTraces]
        }),
        {
          seed: evaluation.value.runtimeTrace,
          producedDomainIds: [evaluation.value.attempt.id, evaluation.value.evaluation.id]
        }
      );

      this.repository.saveRecord(located.key, updatedRecord);

      return ok({
        learningLoopId: securedLearningLoop.id,
        phase: securedLearningLoop.phase,
        nextAction: this.nextActionProjector.project({
          learningLoop: securedLearningLoop
        }),
        workspace: workspace.toSnapshot(),
        learningLoop: securedLearningLoop.toSnapshot(),
        attempt: evaluation.value.attempt.toSnapshot(),
        evaluation: evaluation.value.evaluation.toSnapshot(),
        knowledgeGaps: [],
        events: newEvents
      });
    }

    const loopBatchCandidate = await this.runtime.generateLearningLoopBatch({
      learningLoopId: evaluation.value.learningLoop.id,
      materialInterpretation,
      diagnosedGaps: evaluation.value.knowledgeGaps.map((gap) => gap.toSnapshot()),
      evaluation: {
        itemResults: evaluation.value.evaluation.toSnapshot().itemResults,
        score: evaluation.value.evaluation.toSnapshot().score
      },
      learnerYearGroup: located.record.workspace.learner.yearGroup,
      targetLoopDurationMinutes: 5,
      desiredLoopCount: 3,
      runtimeConversationBinding:
        evaluation.value.runtimeConversationBinding ??
        located.record.runtimeConversationBindings.find(
          (binding) => binding.learningLoopId === learningLoop.id
        )
    });
    if (!loopBatchCandidate.ok) {
      return loopBatchCandidate;
    }

    const loopBatch = LearningLoopBatch.create({
      learningLoopId: evaluation.value.learningLoop.id,
      overview: loopBatchCandidate.value.overview,
      targetDurationMinutes: loopBatchCandidate.value.targetDurationMinutes,
      units: loopBatchCandidate.value.units
    });
    const derivedQuestionBank = deriveQuestionBankFromLoopBatch({
      learningLoopId: evaluation.value.learningLoop.id,
      topic: materialInterpretation.mainTopic,
      loopBatch: loopBatch.toSnapshot()
    });
    const canonicalLoopStructure = deriveCanonicalLoopStructure({
      learningLoopId: evaluation.value.learningLoop.id,
      loopBatch: loopBatch.toSnapshot(),
      questionVariants: derivedQuestionBank.questionVariants
    });

    const newEvents = events.all();
    const workspace = located.record.workspace.appendEventLedger(newEvents.map((event) => event.id));
    const updatedRecord = appendSucceededRuntimeTrace(
      appendSucceededRuntimeTrace(
        createLearningLoopRecord({
      workspace,
      tasks: [...located.record.tasks],
      workPlans: [...located.record.workPlans],
      artifacts: [...located.record.artifacts],
      events: [...located.record.events, ...newEvents],
      learningLoops: [
        ...located.record.learningLoops.filter((candidate) => candidate.id !== learningLoop.id),
        evaluation.value.learningLoop
      ],
      assessments: [...located.record.assessments],
      attempts: [...located.record.attempts, evaluation.value.attempt],
      evaluations: [...located.record.evaluations, evaluation.value.evaluation],
      knowledgeGaps: [...located.record.knowledgeGaps, ...evaluation.value.knowledgeGaps],
      learnerEvidence: [...(located.record.learnerEvidence ?? [])],
      masteryStates: [...(located.record.masteryStates ?? [])],
      masteryProfiles: [...located.record.masteryProfiles],
      practiceActivities: [...located.record.practiceActivities],
      activeReviewSessions: [...located.record.activeReviewSessions],
      loopBatches: [
        ...located.record.loopBatches.filter(
          (candidate) => candidate.learningLoopId !== evaluation.value.learningLoop.id
        ),
        loopBatch
      ],
      loopUnits: [
        ...(located.record.loopUnits?.filter(
          (candidate) => candidate.learningLoopId !== evaluation.value.learningLoop.id
        ) ?? []),
        ...canonicalLoopStructure.loopUnits
      ],
      loopUnitQuestionAssignments: [
        ...(located.record.loopUnitQuestionAssignments?.filter(
          (candidate) => candidate.learningLoopId !== evaluation.value.learningLoop.id
        ) ?? []),
        ...canonicalLoopStructure.loopUnitQuestionAssignments
      ],
      questionSeeds: [
        ...(located.record.questionSeeds?.filter(
          (candidate) => candidate.learningLoopId !== evaluation.value.learningLoop.id
        ) ?? []),
        ...derivedQuestionBank.questionSeeds
      ],
      questionVariants: [
        ...(located.record.questionVariants?.filter(
          (candidate) => candidate.learningLoopId !== evaluation.value.learningLoop.id
        ) ?? []),
        ...derivedQuestionBank.questionVariants
      ],
      runtimeConversationBindings: upsertRuntimeConversationBinding(
        located.record.runtimeConversationBindings,
        loopBatchCandidate.value.runtimeConversationBinding ??
          evaluation.value.runtimeConversationBinding
      ),
      runtimeTraces: [...located.record.runtimeTraces]
    }),
      {
        seed: evaluation.value.runtimeTrace,
        producedDomainIds: [
          evaluation.value.attempt.id,
          evaluation.value.evaluation.id,
          ...evaluation.value.knowledgeGaps.map((gap) => gap.id)
        ]
      }
      ),
      {
        seed: loopBatchCandidate.value.runtimeTrace,
        producedDomainIds: [loopBatch.id, ...loopBatch.toSnapshot().units.map((unit) => unit.id)]
      }
    );

    const projectedLoopBatch =
      projectLoopBatchFromCanonical({
        loopBatch: loopBatch.toSnapshot(),
        learningLoopId: evaluation.value.learningLoop.id,
        loopUnits: canonicalLoopStructure.loopUnits,
        loopUnitQuestionAssignments: canonicalLoopStructure.loopUnitQuestionAssignments,
        questionVariants: derivedQuestionBank.questionVariants
      }) ?? loopBatch.toSnapshot();

    this.repository.saveRecord(located.key, updatedRecord);

    return ok({
      learningLoopId: evaluation.value.learningLoop.id,
      phase: evaluation.value.learningLoop.phase,
      nextAction: this.nextActionProjector.project({
        learningLoop: evaluation.value.learningLoop,
        loopBatch,
        loopUnits: canonicalLoopStructure.loopUnits
      }),
      workspace: workspace.toSnapshot(),
      learningLoop: evaluation.value.learningLoop.toSnapshot(),
      attempt: evaluation.value.attempt.toSnapshot(),
      evaluation: evaluation.value.evaluation.toSnapshot(),
      knowledgeGaps: evaluation.value.knowledgeGaps.map((gap) => gap.toSnapshot()),
      loopBatch: projectedLoopBatch,
      events: newEvents
    });
  }
}

function rankSourceRecords(
  entries: readonly {
    source: MasterDataSource;
    items: readonly MasterDataItem[];
  }[]
): typeof entries {
  return [...entries].sort((left, right) => {
    const leftAccepted = Number(Boolean(left.source.acceptedInterpretation));
    const rightAccepted = Number(Boolean(right.source.acceptedInterpretation));
    if (leftAccepted !== rightAccepted) {
      return rightAccepted - leftAccepted;
    }

    return (
      Date.parse(right.source.toSnapshot().uploadedAt) -
      Date.parse(left.source.toSnapshot().uploadedAt)
    );
  });
}
