import { ActiveReviewSession } from "../../domain/learning/ActiveReviewSession.js";
import { LearnerEvidence } from "../../domain/learning/LearnerEvidence.js";
import {
  KnowledgeGap,
  LearningLoop,
  MasteryProfile
} from "../../domain/learning/LearningLoop.js";
import type { QuestionVariant } from "../../domain/learning/QuestionBank.js";
import type { PracticeActivity } from "../../domain/learning/PracticeActivity.js";
import { PracticeActivityContext } from "../../domain/primitives/Context.js";
import { createDomainEventRecorder } from "../../domain/primitives/Event.js";
import type { KnowledgeGapId } from "../../domain/primitives/ids.js";
import type { QuestionVariantId } from "../../domain/primitives/ids.js";
import { err, ok, type Result } from "../../domain/primitives/result.js";
import type {
  CompletePracticeActivityCommand,
  CreatePracticeActivityCommand
} from "../../domain/study/PracticeActivities.js";
import type { LearningLoopRecord } from "../planning/LearningLoopRepository.js";
import { FlashcardSetAssembler } from "./FlashcardSetAssembler.js";
import type {
  PracticeActivityCompletionAggregate,
  PracticeActivityAggregate
} from "./PracticeActivityProjector.js";
import { PracticeActivityTaskAssembler } from "./PracticeActivityTaskAssembler.js";
import { PracticeReviewSchedulingPolicy } from "./PracticeReviewSchedulingPolicy.js";
import { PracticeSourceSelector } from "./PracticeSourceSelector.js";
import { WorkspacePracticeActivityAssembler } from "./WorkspacePracticeActivityAssembler.js";
import { MasteryStateService } from "../mastery/MasteryStateService.js";
import type { AgentRuntime } from "../runtime/AgentRuntime.js";
import { FixtureAgentRuntime } from "../runtime/FixtureAgentRuntime.js";
import { appendSucceededRuntimeTrace } from "../runtime/RuntimeTraceLedger.js";
import { upsertRuntimeConversationBinding } from "../runtime/RuntimeConversationBinding.js";

export interface PracticeActivityServiceResult {
  aggregate: PracticeActivityAggregate;
  record: LearningLoopRecord;
}

export interface PracticeActivityCompletionServiceResult {
  aggregate: PracticeActivityCompletionAggregate;
  record: LearningLoopRecord;
}

export class PracticeActivityService {
  constructor(
    private readonly sourceSelector: PracticeSourceSelector,
    private readonly taskAssembler = new PracticeActivityTaskAssembler(),
    private readonly flashcardSetAssembler = new FlashcardSetAssembler(new FixtureAgentRuntime()),
    private readonly workspaceAssembler = new WorkspacePracticeActivityAssembler(),
    private readonly reviewSchedulingPolicy = new PracticeReviewSchedulingPolicy(),
    private readonly masteryStateService = new MasteryStateService()
  ) {}

  async generate(
    command: CreatePracticeActivityCommand,
    record: LearningLoopRecord
  ): Promise<Result<PracticeActivityServiceResult>> {
    const learningLoop = record.learningLoops.find(
      (candidate) => candidate.id === (command.learningLoopId as never)
    );
    if (!learningLoop) {
      return err({
        code: "NOT_FOUND",
        message: `Learning loop ${command.learningLoopId} was not found.`
      });
    }

    const selection = this.sourceSelector.select(record, learningLoop, command.cardCount);
    if (!selection.ok) {
      return selection;
    }

    const events = createDomainEventRecorder(record.workspace.id);
    const context = PracticeActivityContext.create({
      command,
      diagnosedGaps: selection.value.knowledgeGaps.map((gap) => gap.toSnapshot().description),
      learnerName: record.workspace.learner.name,
      learningLoopId: learningLoop.id,
      sourceNames: selection.value.sourceNames,
      topic: learningLoop.topic,
      yearGroup: record.workspace.learner.yearGroup
    });
    const task = this.taskAssembler.create(context, record.workspace.id, events);
    const assembled = await this.flashcardSetAssembler.assemble({
      context,
      events,
      learningLoop,
      materialInterpretation: selection.value.selections[0]?.source.acceptedInterpretation,
      runtimeConversationBinding: record.runtimeConversationBindings.find(
        (binding) => binding.learningLoopId === learningLoop.id
      ),
      selections: selection.value.selections,
      task,
      workspace: record.workspace
    });
    if (!assembled.ok) {
      return assembled;
    }

    const completedTask = this.taskAssembler.complete(
      task,
      `${command.cardCount} flashcards generated for ${learningLoop.topic}.`,
      events
    );
    if (!completedTask.ok) {
      return completedTask;
    }

    const aggregate = this.workspaceAssembler.assemble({
      agent: assembled.value.agent,
      events,
      learningLoop,
      practiceActivity: assembled.value.practiceActivity,
      record,
      runtimeConversationBinding: assembled.value.runtimeConversationBinding,
      runtimeTrace: assembled.value.runtimeTrace,
      task: completedTask.value,
      workspace: record.workspace
    });
    if (!aggregate.ok) {
      return aggregate;
    }

    const updatedLoopBatch = record.loopBatches
      .find((candidate) => candidate.learningLoopId === learningLoop.id)
      ?.markFirstReadyInProgress();

    const aggregateRecord = {
      ...aggregate.value.record,
      loopBatches: updatedLoopBatch
        ? [
            ...aggregate.value.record.loopBatches.filter(
              (candidate) => candidate.learningLoopId !== learningLoop.id
            ),
            updatedLoopBatch
          ]
        : [...aggregate.value.record.loopBatches]
    } satisfies LearningLoopRecord;

    return ok({
      aggregate: aggregate.value.aggregate,
      record: appendSucceededRuntimeTrace(aggregateRecord, {
        seed: assembled.value.runtimeTrace,
        producedDomainIds: [assembled.value.practiceActivity.id, completedTask.value.id]
      })
    });
  }

  complete(
    command: CompletePracticeActivityCommand,
    record: LearningLoopRecord
  ): Result<PracticeActivityCompletionServiceResult> {
    const practiceActivity = record.practiceActivities.find(
      (candidate) => candidate.id === (command.practiceActivityId as never)
    );
    if (!practiceActivity) {
      return err({
        code: "NOT_FOUND",
        message: `Practice activity ${command.practiceActivityId} was not found.`
      });
    }

    const learningLoop = record.learningLoops.find(
      (candidate) => candidate.id === practiceActivity.learningLoopId
    );
    if (!learningLoop) {
      return err({
        code: "NOT_FOUND",
        message: `Learning loop for practice activity ${command.practiceActivityId} was not found.`
      });
    }

    const activeReviewSession = ActiveReviewSession.createFromPracticeResponses({
      allowedKnowledgeGapIds: learningLoop.knowledgeGapIds,
      allowedSourceMasterDataItemIds: practiceActivity.sourceMasterDataItemIds,
      existingSessionCount: practiceActivity.reviewSessionIds.length,
      kind: practiceActivity.kind,
      learningLoopId: learningLoop.id,
      practiceItems: practiceActivity.practiceItems,
      practiceActivityId: practiceActivity.id,
      responses: command.responses,
      reviewScheduler: this.reviewSchedulingPolicy,
      workspaceId: record.workspace.id
    });
    if (!activeReviewSession.ok) {
      return activeReviewSession;
    }

    const updatedPracticeActivity = practiceActivity.recordReviewSession({
      completedAt: activeReviewSession.value.completedAt,
      easeSignal: activeReviewSession.value.easeSignal,
      nextReviewAt: activeReviewSession.value.nextReviewAt,
      reviewIntervalHours: activeReviewSession.value.reviewIntervalHours,
      reviewSessionId: activeReviewSession.value.id
    });

    const refreshedKnowledgeGaps = this.refreshKnowledgeGapsFromPractice({
      activeReviewSession: activeReviewSession.value,
      learningLoop,
      record
    });
    const currentLoopUnitId = record.loopBatches
      .find((candidate) => candidate.learningLoopId === learningLoop.id)
      ?.firstActionableUnit()?.id;
    const learnerEvidence = this.buildLearnerEvidenceFromPractice({
      activeReviewSession: activeReviewSession.value,
      currentLoopUnitId,
      learningLoop,
      practiceActivity,
      record
    });
    const completedLoopBatch = record.loopBatches
      .find((candidate) => candidate.learningLoopId === learningLoop.id)
      ?.completeCurrentUnit();
    const nextUnitGapIds = completedLoopBatch?.firstActionableUnit()?.targetKnowledgeGapIds ?? [];
    const nextLearningLoopGapIds =
      nextUnitGapIds.length > 0
        ? nextUnitGapIds
        : refreshedKnowledgeGaps.remainingKnowledgeGapIds;

    const events = createDomainEventRecorder(record.workspace.id);
    let updatedLoop = learningLoop.recordPracticeActivityCompleted(
      {
        activeReviewSessionId: activeReviewSession.value.id,
        remainingKnowledgeGapIds: nextLearningLoopGapIds,
        practiceActivityId: practiceActivity.id,
        masteryScore: activeReviewSession.value.masteryScore
      },
      events
    );
    const masteryUpdate = this.masteryStateService.update({
      existingStates: record.masteryStates ?? [],
      learningLoop,
      newEvidence: learnerEvidence,
      questionSeeds: (record.questionSeeds ?? []).filter(
        (candidate) => candidate.learningLoopId === learningLoop.id
      ),
      existingProfile: record.masteryProfiles.find(
        (candidate) => candidate.id === learningLoop.masteryProfileId
      )
    });
    const masteryProfile = masteryUpdate.masteryProfile;
    if (masteryProfile) {
      updatedLoop = updatedLoop.attachMasteryProfile(masteryProfile.id, events);
    }

    const newEvents = events.all();
    const workspace = record.workspace.appendEventLedger(newEvents.map((event) => event.id));
    const updatedRecord = {
      workspace,
      tasks: [...record.tasks],
      workPlans: [...record.workPlans],
      artifacts: [...record.artifacts],
      events: [...record.events, ...newEvents],
      learningLoops: [
        ...record.learningLoops.filter((candidate) => candidate.id !== updatedLoop.id),
        updatedLoop
      ],
      assessments: [...record.assessments],
      attempts: [...record.attempts],
      evaluations: [...record.evaluations],
      knowledgeGaps: refreshedKnowledgeGaps.knowledgeGaps,
      masteryProfiles: masteryProfile
        ? [
            ...record.masteryProfiles.filter((candidate) => candidate.id !== masteryProfile.id),
            masteryProfile
          ]
        : [...record.masteryProfiles],
      masteryStates: [...masteryUpdate.masteryStates],
      practiceActivities: [
        ...record.practiceActivities.filter((candidate) => candidate.id !== practiceActivity.id),
        updatedPracticeActivity
      ],
      activeReviewSessions: [...record.activeReviewSessions, activeReviewSession.value],
      learnerEvidence: [...(record.learnerEvidence ?? []), ...learnerEvidence],
      loopBatches: completedLoopBatch
        ? [
            ...record.loopBatches.filter((candidate) => candidate.learningLoopId !== learningLoop.id),
            completedLoopBatch
          ]
        : [...record.loopBatches],
      runtimeConversationBindings: [...record.runtimeConversationBindings],
      runtimeTraces: [...record.runtimeTraces]
    } satisfies LearningLoopRecord;

    return ok({
      record: updatedRecord,
      aggregate: {
        workspace,
        activeReviewSession: activeReviewSession.value,
        learningLoop: updatedLoop,
        practiceActivity: updatedPracticeActivity,
        masteryProfile: masteryProfile ?? MasteryProfile.create(learningLoop.id),
        events: newEvents
      }
    });
  }

  private refreshKnowledgeGapsFromPractice(input: {
    activeReviewSession: ActiveReviewSession;
    learningLoop: LearningLoopRecord["learningLoops"][number];
    record: LearningLoopRecord;
  }): { knowledgeGaps: readonly KnowledgeGap[]; remainingKnowledgeGapIds: readonly KnowledgeGapId[] } {
    const retainedUntargetedGaps = input.record.knowledgeGaps.filter(
      (gap) =>
        !input.learningLoop.knowledgeGapIds.includes(gap.id)
    );

    const existingKnowledgeGapsById = new Map(
      input.record.knowledgeGaps.map((gap) => [gap.id, gap])
    );
    const refreshedTargetedGaps = [
      ...new Map(
        input.activeReviewSession.itemResults
          .filter((result) => !result.correct || result.confidence !== "high")
          .map((result) => {
            const existingGap = existingKnowledgeGapsById.get(result.knowledgeGapId);
            return [
              result.knowledgeGapId,
              existingGap ??
                KnowledgeGap.create({
                  learningLoopId: input.learningLoop.id,
                  topic: result.topic,
                  description: `Needs more active review after flashcard practice.`,
                  evidence: `Practice response to ${result.practiceItemId} was ${result.correct ? "correct but not yet confident" : result.overconfidence ? "incorrect with high confidence" : "incorrect"}.`,
                  severity: result.correct ? "medium" : "high"
                })
            ] as const;
          })
      ).values()
    ];

    return {
      knowledgeGaps: [...retainedUntargetedGaps, ...refreshedTargetedGaps],
      remainingKnowledgeGapIds: refreshedTargetedGaps.map((gap) => gap.id)
    };
  }

  private buildLearnerEvidenceFromPractice(input: {
    activeReviewSession: ActiveReviewSession;
    currentLoopUnitId?: string;
    learningLoop: LearningLoop;
    practiceActivity: PracticeActivity;
    record: LearningLoopRecord;
  }): readonly LearnerEvidence[] {
    const variantById = new Map(
      (input.record.questionVariants ?? [])
        .filter((candidate) => candidate.learningLoopId === input.learningLoop.id)
        .map((candidate) => [candidate.id, candidate])
    );
    const seedById = new Map(
      (input.record.questionSeeds ?? [])
        .filter((candidate) => candidate.learningLoopId === input.learningLoop.id)
        .map((candidate) => [candidate.id, candidate])
    );
    const fallbackReviewVariants = (input.record.questionVariants ?? []).filter(
      (candidate) =>
        candidate.learningLoopId === input.learningLoop.id &&
        candidate.ownerKind === "loop_review_item" &&
        candidate.ownerId === (input.currentLoopUnitId as never)
    );
    const sourceId = input.learningLoop.toSnapshot().sourceIds[0];

    return input.activeReviewSession.itemResults.flatMap((result) => {
      const variant = resolveQuestionVariant({
        expectedAnswer: result.expectedAnswer,
        fallbackReviewVariants,
        practiceItemId: result.practiceItemId,
        variantById
      });
      if (!variant) {
        return [];
      }

      const variantSnapshot = variant.toSnapshot();
      const seed = seedById.get(variantSnapshot.seedId);
      if (!seed) {
        return [];
      }

      return [
        LearnerEvidence.create({
          workspaceId: input.learningLoop.workspaceId,
          learningLoopId: input.learningLoop.id,
          loopUnitId: input.currentLoopUnitId as never,
          seedId: seed.id,
          variantId: variant.id,
          sourceId: sourceId as never,
          responseText: result.responseText,
          confidence: result.confidence,
          correctness: result.correct ? "correct" : "incorrect",
          supportUsed: "independent",
          feedbackSummary: result.expectedAnswer
        })
      ];
    });
  }
}

function extractQuestionVariantId(practiceItemId: string): QuestionVariantId | undefined {
  if (!practiceItemId) {
    return undefined;
  }

  const [variantId] = practiceItemId.split("::");
  return (variantId?.trim() || undefined) as QuestionVariantId | undefined;
}

function resolveQuestionVariant(input: {
  expectedAnswer: string;
  fallbackReviewVariants: readonly QuestionVariant[];
  practiceItemId: string;
  variantById: Map<QuestionVariantId, QuestionVariant>;
}) {
  const directVariantId = extractQuestionVariantId(input.practiceItemId);
  if (directVariantId) {
    const directVariant = input.variantById.get(directVariantId);
    if (directVariant) {
      return directVariant;
    }
  }

  const expectedAnswer = normalizeAnswerText(input.expectedAnswer);
  if (!expectedAnswer) {
    return input.fallbackReviewVariants[0];
  }

  return (
    input.fallbackReviewVariants.find(
      (candidate) => normalizeAnswerText(candidate.toSnapshot().expectedAnswer) === expectedAnswer
    ) ?? input.fallbackReviewVariants[0]
  );
}

function normalizeAnswerText(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}
