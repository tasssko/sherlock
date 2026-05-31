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
