import { LoopUnit } from "../../domain/learning/LoopUnit.js";
import { LoopUnitQuestionAssignment } from "../../domain/learning/LoopUnitQuestionAssignment.js";
import type { PracticeActivitySnapshot } from "../../domain/learning/PracticeActivity.js";
import type { QuestionSeed, QuestionVariant } from "../../domain/learning/QuestionBank.js";
import { QuestionSeed as QuestionSeedEntity, QuestionVariant as QuestionVariantEntity } from "../../domain/learning/QuestionBank.js";
import type { LearningLoopBatchSnapshot, LearningLoopUnitSnapshot } from "../../domain/study/LoopBatches.js";

export function deriveQuestionBankFromLoopBatch(input: {
  learningLoopId: string;
  topic: string;
  loopBatch: LearningLoopBatchSnapshot;
}): {
  questionSeeds: readonly QuestionSeed[];
  questionVariants: readonly QuestionVariant[];
} {
  const questionSeeds: QuestionSeed[] = [];
  const questionVariants: QuestionVariant[] = [];

  for (const unit of input.loopBatch.units) {
    const maxSlotCount = Math.max(unit.quickCheckQuestions.length, unit.reviewItems.length);

    for (let index = 0; index < maxSlotCount; index += 1) {
      const quickCheck = unit.quickCheckQuestions[index];
      const reviewItem = unit.reviewItems[index];

      if (!quickCheck && !reviewItem) {
        continue;
      }

      const seed = QuestionSeedEntity.create({
        learningLoopId: input.learningLoopId as never,
        topic: input.topic,
        focus: unit.focus,
        objectiveRefs: unit.objectiveRefs,
        sourceRefs: unit.sourceRefs,
        answerModel: reviewItem?.answer ?? quickCheck?.sourceFact ?? quickCheck?.hint ?? quickCheck?.prompt ?? unit.shortExplanation,
        explanation: unit.shortExplanation,
        tags: [unit.focus, ...unit.sourceRefs]
      });
      questionSeeds.push(seed);

      if (quickCheck) {
        questionVariants.push(
          QuestionVariantEntity.create({
            seedId: seed.id,
            learningLoopId: input.learningLoopId as never,
            ownerId: unit.id,
            ownerKind: "loop_quick_check",
            position: index,
            mode: quickCheck.questionType ?? "guided",
            prompt: quickCheck.prompt,
            options: quickCheck.options,
            correctOptionIds: quickCheck.correctOptionIds,
            hint: quickCheck.hint,
            sourceFact: quickCheck.sourceFact,
            expectedAnswer: reviewItem?.answer
          })
        );
      }

      if (reviewItem) {
        questionVariants.push(
          QuestionVariantEntity.create({
            seedId: seed.id,
            learningLoopId: input.learningLoopId as never,
            ownerId: unit.id,
            ownerKind: "loop_review_item",
            position: index,
            mode: "review",
            prompt: reviewItem.prompt,
            expectedAnswer: reviewItem.answer
          })
        );
      }
    }
  }

  return { questionSeeds, questionVariants };
}

export function applyQuestionVariantsToLoopBatch(
  loopBatch: LearningLoopBatchSnapshot,
  questionVariants: readonly QuestionVariant[]
): LearningLoopBatchSnapshot {
  if (questionVariants.length === 0) {
    return loopBatch;
  }

  const quickCheckVariants = groupVariants(questionVariants, "loop_quick_check");
  const reviewVariants = groupVariants(questionVariants, "loop_review_item");

  return {
    ...loopBatch,
    units: loopBatch.units.map((unit) => projectUnit(unit, quickCheckVariants.get(unit.id), reviewVariants.get(unit.id)))
  };
}

export function deriveCanonicalLoopStructure(input: {
  learningLoopId: string;
  loopBatch: LearningLoopBatchSnapshot;
  questionVariants: readonly QuestionVariant[];
}): {
  loopUnits: readonly LoopUnit[];
  loopUnitQuestionAssignments: readonly LoopUnitQuestionAssignment[];
} {
  const loopUnits = input.loopBatch.units.map((unit, index) =>
    LoopUnit.rehydrate({
      id: unit.id,
      learningLoopId: input.learningLoopId as never,
      focus: unit.focus,
      reason: unit.reason,
      objectiveRefs: [...unit.objectiveRefs],
      sourceRefs: [...unit.sourceRefs],
      shortExplanation: unit.shortExplanation,
      learnerTask: unit.learnerTask,
      targetKnowledgeGapIds: [...unit.targetKnowledgeGapIds],
      state: unit.state,
      sequence: index,
      createdAt: input.loopBatch.createdAt
    })
  );

  const loopUnitQuestionAssignments = input.questionVariants
    .filter((candidate) => candidate.learningLoopId === (input.learningLoopId as never))
    .map((candidate) => {
      const snapshot = candidate.toSnapshot();
      return LoopUnitQuestionAssignment.create({
        learningLoopId: snapshot.learningLoopId,
        loopUnitId: snapshot.ownerId as never,
        variantId: snapshot.id,
        purpose: snapshot.ownerKind === "loop_review_item" ? "review" : "quick_check",
        sequence: snapshot.position
      });
    });

  return {
    loopUnits,
    loopUnitQuestionAssignments
  };
}

export function projectLoopBatchFromCanonical(input: {
  loopBatch?: LearningLoopBatchSnapshot;
  learningLoopId: string;
  loopUnits: readonly LoopUnit[];
  loopUnitQuestionAssignments: readonly LoopUnitQuestionAssignment[];
  questionSeeds?: readonly QuestionSeed[];
  questionVariants: readonly QuestionVariant[];
}): LearningLoopBatchSnapshot | undefined {
  if (!input.loopBatch) {
    return undefined;
  }

  const canonicalUnits = input.loopUnits
    .filter((candidate) => candidate.learningLoopId === (input.learningLoopId as never))
    .sort((left, right) => left.sequence - right.sequence);
  if (canonicalUnits.length === 0) {
    // No canonical loop-unit structure is available yet, so compatibility
    // batch questions remain the explicit projection fallback.
    return applyQuestionVariantsToLoopBatch(input.loopBatch, input.questionVariants);
  }

  const assignmentSnapshots = input.loopUnitQuestionAssignments
    .filter((candidate) => candidate.learningLoopId === (input.learningLoopId as never))
    .map((candidate) => candidate.toSnapshot());
  const seedSnapshots = new Map(
    (input.questionSeeds ?? [])
      .filter((candidate) => candidate.learningLoopId === (input.learningLoopId as never))
      .map((candidate) => [candidate.id, candidate.toSnapshot()])
  );
  const variantSnapshots = new Map(
    input.questionVariants
      .filter((candidate) => candidate.learningLoopId === (input.learningLoopId as never))
      .map((candidate) => [candidate.id, candidate.toSnapshot()])
  );
  const batchUnitById = new Map(input.loopBatch.units.map((unit) => [unit.id, unit]));

  return {
    ...input.loopBatch,
    units: canonicalUnits.map((unit) =>
      projectCanonicalUnit({
        canonicalUnit: unit.toSnapshot(),
        batchUnit: batchUnitById.get(unit.id),
        assignments: assignmentSnapshots,
        seedSnapshots,
        variantSnapshots
      })
    )
  };
}

export function projectPracticeActivityFromCanonical(input: {
  practiceActivity?: PracticeActivitySnapshot;
  learningLoopId: string;
  activeLoopUnitId?: string;
  loopUnitQuestionAssignments: readonly LoopUnitQuestionAssignment[];
  questionSeeds: readonly QuestionSeed[];
  questionVariants: readonly QuestionVariant[];
}): PracticeActivitySnapshot | undefined {
  if (!input.practiceActivity) {
    return undefined;
  }

  const snapshot = input.practiceActivity;
  const unitId = input.activeLoopUnitId;
  if (!unitId) {
    // Without a canonical active unit, preserve the saved practice snapshot as
    // the compatibility projection rather than inventing a different surface.
    return clonePracticeActivitySnapshot(snapshot);
  }

  const reviewAssignments = input.loopUnitQuestionAssignments
    .filter((candidate) => candidate.learningLoopId === (input.learningLoopId as never))
    .map((candidate) => candidate.toSnapshot())
    .filter((candidate) => candidate.loopUnitId === (unitId as never) && candidate.purpose === "review")
    .sort((left, right) => left.sequence - right.sequence);

  if (reviewAssignments.length === 0) {
    // Canonical assignments are authoritative when present. If this unit does
    // not yet have canonical review assignments, keep the saved practice blob
    // as an explicit compatibility fallback.
    return clonePracticeActivitySnapshot(snapshot);
  }

  const seedSnapshots = new Map(
    input.questionSeeds
      .filter((candidate) => candidate.learningLoopId === (input.learningLoopId as never))
      .map((candidate) => [candidate.id, candidate.toSnapshot()])
  );
  const variantSnapshots = new Map(
    input.questionVariants
      .filter((candidate) => candidate.learningLoopId === (input.learningLoopId as never))
      .map((candidate) => [candidate.id, candidate.toSnapshot()])
  );

  return {
    ...snapshot,
    targetKnowledgeGapIds: [...snapshot.targetKnowledgeGapIds],
    learningObjectives: [...snapshot.learningObjectives],
    sourceMasterDataItemIds: [...snapshot.sourceMasterDataItemIds],
    reviewSessionIds: [...snapshot.reviewSessionIds],
    flashcardSet: {
      instructions: snapshot.flashcardSet.instructions,
      cards: reviewAssignments.map((assignment, index) => {
        const fallback = snapshot.flashcardSet.cards[index];
        const variant = variantSnapshots.get(assignment.variantId);
        const seed = variant ? seedSnapshots.get(variant.seedId) : undefined;

        return {
          id: fallback?.id ?? `${assignment.variantId}::${index + 1}`,
          front: variant?.prompt ?? fallback?.front ?? seed?.focus ?? "Review the current idea.",
          back: variant?.expectedAnswer ?? seed?.answerModel ?? fallback?.back ?? seed?.explanation ?? "",
          topic: fallback?.topic ?? seed?.topic ?? "study",
          knowledgeGapId:
            fallback?.knowledgeGapId ??
            snapshot.targetKnowledgeGapIds[index % snapshot.targetKnowledgeGapIds.length] ??
            snapshot.targetKnowledgeGapIds[0]!,
          learningObjective:
            seed?.objectiveRefs[0] ??
            fallback?.learningObjective ??
            snapshot.learningObjectives[index % snapshot.learningObjectives.length] ??
            snapshot.learningObjectives[0]!,
          sourceMasterDataItemId:
            fallback?.sourceMasterDataItemId ??
            snapshot.sourceMasterDataItemIds[index % snapshot.sourceMasterDataItemIds.length] ??
            snapshot.sourceMasterDataItemIds[0]!,
          sourceVisibleSentence:
            fallback?.sourceVisibleSentence ??
            seed?.explanation ??
            `Review ${seed?.focus ?? "the current focus"}.`
        };
      })
    }
  };
}

function groupVariants(
  questionVariants: readonly QuestionVariant[],
  ownerKind: "loop_quick_check" | "loop_review_item"
): Map<string, readonly ReturnType<QuestionVariant["toSnapshot"]>[]> {
  const grouped = new Map<string, ReturnType<QuestionVariant["toSnapshot"]>[]>();

  for (const variant of questionVariants) {
    const snapshot = variant.toSnapshot();
    if (snapshot.ownerKind !== ownerKind) {
      continue;
    }

    const existing = grouped.get(snapshot.ownerId);
    if (existing) {
      existing.push(snapshot);
    } else {
      grouped.set(snapshot.ownerId, [snapshot]);
    }
  }

  for (const [ownerId, variants] of grouped.entries()) {
    grouped.set(
      ownerId,
      [...variants].sort((left, right) => left.position - right.position)
    );
  }

  return grouped;
}

function projectUnit(
  unit: LearningLoopUnitSnapshot,
  quickCheckVariants: readonly ReturnType<QuestionVariant["toSnapshot"]>[] | undefined,
  reviewVariants: readonly ReturnType<QuestionVariant["toSnapshot"]>[] | undefined
): LearningLoopUnitSnapshot {
  return {
    ...unit,
    quickCheckQuestions: unit.quickCheckQuestions.map((question, index) => {
      const variant = quickCheckVariants?.[index];
      if (!variant) {
        return { ...question };
      }

      return {
        ...question,
        prompt: variant.prompt,
        questionType: variant.mode === "guided" || variant.mode === "review" || variant.mode === "flashcard"
          ? question.questionType
          : variant.mode,
        options: variant.options?.map((option) => ({ ...option })),
        correctOptionIds: variant.correctOptionIds ? [...variant.correctOptionIds] : undefined,
        hint: variant.hint,
        sourceFact: variant.sourceFact
      };
    }),
    reviewItems: unit.reviewItems.map((item, index) => {
      const variant = reviewVariants?.[index];
      if (!variant) {
        return { ...item };
      }

      return {
        ...item,
        prompt: variant.prompt,
        answer: variant.expectedAnswer ?? item.answer
      };
    })
  };
}

function projectCanonicalUnit(input: {
  canonicalUnit: ReturnType<LoopUnit["toSnapshot"]>;
  batchUnit: LearningLoopUnitSnapshot | undefined;
  assignments: readonly ReturnType<LoopUnitQuestionAssignment["toSnapshot"]>[];
  seedSnapshots: ReadonlyMap<string, ReturnType<QuestionSeed["toSnapshot"]>>;
  variantSnapshots: ReadonlyMap<string, ReturnType<QuestionVariant["toSnapshot"]>>;
}): LearningLoopUnitSnapshot {
  const quickCheckAssignments = input.assignments
    .filter(
      (candidate) =>
        candidate.loopUnitId === input.canonicalUnit.id && candidate.purpose === "quick_check"
    )
    .sort((left, right) => left.sequence - right.sequence);
  const reviewAssignments = input.assignments
    .filter(
      (candidate) => candidate.loopUnitId === input.canonicalUnit.id && candidate.purpose === "review"
    )
    .sort((left, right) => left.sequence - right.sequence);

  const fallbackQuickChecks = input.batchUnit?.quickCheckQuestions ?? [];
  const fallbackReviewItems = input.batchUnit?.reviewItems ?? [];

  return {
    id: input.canonicalUnit.id,
    focus: input.canonicalUnit.focus,
    reason: input.canonicalUnit.reason,
    objectiveRefs: [...input.canonicalUnit.objectiveRefs],
    sourceRefs: [...input.canonicalUnit.sourceRefs],
    shortExplanation: input.canonicalUnit.shortExplanation,
    learnerTask: input.canonicalUnit.learnerTask,
    targetKnowledgeGapIds: [...input.canonicalUnit.targetKnowledgeGapIds],
    state: input.canonicalUnit.state,
    quickCheckQuestions:
      quickCheckAssignments.length > 0
        ? quickCheckAssignments.map((assignment, index) => {
            const variant = input.variantSnapshots.get(assignment.variantId);
            const fallback = fallbackQuickChecks[index];
            return {
              id: fallback?.id ?? `${index + 1}`,
              prompt: variant?.prompt ?? fallback?.prompt ?? input.canonicalUnit.shortExplanation,
              questionType:
                variant?.mode === "guided" || variant?.mode === "review" || variant?.mode === "flashcard"
                  ? fallback?.questionType
                  : variant?.mode ?? fallback?.questionType,
              options: variant?.options?.map((option) => ({ ...option })) ?? fallback?.options?.map((option) => ({ ...option })),
              correctOptionIds: variant?.correctOptionIds
                ? [...variant.correctOptionIds]
                : fallback?.correctOptionIds
                  ? [...fallback.correctOptionIds]
                  : undefined,
              hint: variant?.hint ?? fallback?.hint,
              sourceFact: variant?.sourceFact ?? fallback?.sourceFact
            };
          })
        : fallbackQuickChecks.map((question) => ({ ...question })),
    reviewItems:
      reviewAssignments.length > 0
        ? reviewAssignments.map((assignment, index) => {
            const variant = input.variantSnapshots.get(assignment.variantId);
            const seed = variant ? input.seedSnapshots.get(variant.seedId) : undefined;
            const fallback = fallbackReviewItems[index];
            return {
              id: fallback?.id ?? `${index + 1}`,
              prompt: variant?.prompt ?? fallback?.prompt ?? input.canonicalUnit.learnerTask,
              answer:
                variant?.expectedAnswer ??
                seed?.answerModel ??
                fallback?.answer ??
                input.canonicalUnit.shortExplanation
            };
          })
        : fallbackReviewItems.map((item) => ({ ...item }))
  };
}

function clonePracticeActivitySnapshot(
  snapshot: PracticeActivitySnapshot
): PracticeActivitySnapshot {
  return {
    ...snapshot,
    targetKnowledgeGapIds: [...snapshot.targetKnowledgeGapIds],
    learningObjectives: [...snapshot.learningObjectives],
    sourceMasterDataItemIds: [...snapshot.sourceMasterDataItemIds],
    reviewSessionIds: [...snapshot.reviewSessionIds],
    flashcardSet: {
      instructions: snapshot.flashcardSet.instructions,
      cards: snapshot.flashcardSet.cards.map((card) => ({ ...card }))
    }
  };
}
