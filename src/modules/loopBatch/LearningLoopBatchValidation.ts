import { z } from "zod";
import type { MasterDataInterpretationCandidate } from "../masterData/MasterDataInterpretation.js";

const quickCheckSchema = z.object({
  prompt: z.string().min(1),
  questionType: z.enum(["free_form", "multiple_choice", "multiple_select"]).optional(),
  options: z
    .array(
      z.object({
        id: z.string().min(1),
        text: z.string().min(1)
      })
    )
    .optional(),
  correctOptionIds: z.array(z.string().min(1)).optional(),
  hint: z.string().min(1).optional(),
  sourceFact: z.string().min(1).optional()
});

const reviewItemSchema = z.object({
  prompt: z.string().min(1),
  answer: z.string().min(1)
});

const loopUnitCandidateSchema = z.object({
  focus: z.string().min(1),
  reason: z.string().min(1),
  objectiveRefs: z.array(z.string().min(1)).min(1),
  sourceRefs: z.array(z.string().min(1)).min(1),
  targetKnowledgeGapIds: z.array(z.string().min(1)).min(1),
  shortExplanation: z.string().min(1),
  learnerTask: z.string().min(1),
  quickCheckQuestions: z.array(quickCheckSchema).min(1),
  reviewItems: z.array(reviewItemSchema).optional(),
  state: z.enum(["locked", "ready", "in_progress", "completed"]).optional()
});

const loopBatchCandidateSchema = z.object({
  schema: z.literal("LearningLoopBatchCandidate.v1"),
  overview: z.string().min(1),
  targetDurationMinutes: z.number().int().min(3).max(15),
  units: z.array(loopUnitCandidateSchema).min(1)
});

export type LearningLoopBatchCandidate = z.infer<typeof loopBatchCandidateSchema>;

export function validateLearningLoopBatchCandidate(input: {
  candidate: unknown;
  diagnosedGaps: readonly { id: string }[];
  interpretation: MasterDataInterpretationCandidate;
}): LearningLoopBatchCandidate {
  const parsed = loopBatchCandidateSchema.parse(input.candidate);
  const gapIds = new Set(input.diagnosedGaps.map((gap) => gap.id));
  const objectiveIds = new Set(input.interpretation.learningObjectives.map((objective) => objective.id));
  const sourceRefs = new Set([
    ...input.interpretation.sourceMap.map((entry) => entry.sourceRef),
    ...input.interpretation.items.map((item) => item.sourceRef)
  ]);

  parsed.units.forEach((unit, index) => {
    const unitLabel = `Loop unit ${index + 1}`;

    if (unit.targetKnowledgeGapIds.some((gapId) => !gapIds.has(gapId as never))) {
      throw new Error(`${unitLabel} must target one or more diagnosed gaps.`);
    }

    if (unit.objectiveRefs.some((objectiveId) => !objectiveIds.has(objectiveId))) {
      throw new Error(`${unitLabel} must reference accepted learning objectives.`);
    }

    if (unit.sourceRefs.some((sourceRef) => !sourceRefs.has(sourceRef))) {
      throw new Error(`${unitLabel} must use source refs from the accepted interpretation.`);
    }

    if (isVagueLearnerTask(unit.learnerTask, unit.focus)) {
      throw new Error(`${unitLabel} must contain one clear learner action.`);
    }

    if (unit.quickCheckQuestions.some((question) => leaksAnswer(question.prompt, unit.reviewItems ?? []))) {
      throw new Error(`${unitLabel} quick checks must not leak answers.`);
    }

    unit.quickCheckQuestions.forEach((question, questionIndex) => {
      const questionLabel = `${unitLabel} quick check ${questionIndex + 1}`;
      if (question.questionType === "multiple_choice") {
        if (!question.options || question.options.length < 2) {
          throw new Error(`${questionLabel} must include at least two options.`);
        }
        if (!question.correctOptionIds || question.correctOptionIds.length !== 1) {
          throw new Error(`${questionLabel} must include exactly one correct option.`);
        }
      }

      if (question.questionType === "multiple_select") {
        if (!question.options || question.options.length < 3) {
          throw new Error(`${questionLabel} must include at least three options.`);
        }
        if (!question.correctOptionIds || question.correctOptionIds.length < 2) {
          throw new Error(`${questionLabel} must include at least two correct options.`);
        }
      }
    });

    if ((unit.reviewItems ?? []).some((item) => normalize(item.prompt) === normalize(item.answer))) {
      throw new Error(`${unitLabel} review items must use active recall, not identical prompt/answer text.`);
    }
  });

  return parsed;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isVagueLearnerTask(task: string, focus: string): boolean {
  const normalizedTask = normalize(task);
  const normalizedFocus = normalize(focus);

  return (
    normalizedTask === normalize(`revise ${focus}`) ||
    normalizedTask === normalize(`study ${focus}`) ||
    normalizedTask === normalizedFocus
  );
}

function leaksAnswer(
  prompt: string,
  reviewItems: readonly { answer: string; prompt: string }[]
): boolean {
  const normalizedPrompt = normalize(prompt);

  return reviewItems.some((item) => {
    const normalizedAnswer = normalize(item.answer);
    return normalizedAnswer.length > 0 && normalizedPrompt.includes(normalizedAnswer);
  });
}
