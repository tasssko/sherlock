import type { AssessmentItem } from "../../domain/learning/Assessment.js";
import { err, ok, type Result } from "../../domain/primitives/result.js";

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function meaningfulLeakCandidate(value: string): boolean {
  const normalized = normalize(value);
  if (!normalized) {
    return false;
  }

  const tokenCount = normalized.split(" ").filter(Boolean).length;
  return tokenCount >= 2 || normalized.length >= 12;
}

export class AssessmentQualityValidator {
  validate(items: readonly AssessmentItem[] | null | undefined): Result<readonly AssessmentItem[]> {
    if (!Array.isArray(items)) {
      return err({
        code: "VALIDATION_ERROR",
        message: "Assessment generation did not return a valid items array."
      });
    }

    const seenPrompts = new Map<string, string>();

    for (const item of items) {
      const normalizedPrompt = normalize(item.prompt);
      const normalizedAnswer = normalize(item.canonicalAnswer);
      const normalizedVisibleMaterial = normalize(item.visibleMaterial);

      if (!normalizedAnswer) {
        return err({
          code: "VALIDATION_ERROR",
          message: `Assessment item ${item.id} is missing a canonical answer.`
        });
      }

      if (normalizedAnswer === normalizedPrompt) {
        return err({
          code: "VALIDATION_ERROR",
          message: `Assessment item ${item.id} leaks the answer by repeating the question.`
        });
      }

      if (normalizedVisibleMaterial.includes(normalizedAnswer)) {
        return err({
          code: "VALIDATION_ERROR",
          message: `Assessment item ${item.id} leaks the answer verbatim from visible study material.`
        });
      }

      const existingPromptId = seenPrompts.get(normalizedPrompt);
      if (existingPromptId) {
        return err({
          code: "VALIDATION_ERROR",
          message: `Assessment items ${existingPromptId} and ${item.id} repeat the same question.`
        });
      }

      seenPrompts.set(normalizedPrompt, item.id);
    }

    for (const item of items) {
      const normalizedPrompt = normalize(item.prompt);

      for (const otherItem of items) {
        if (otherItem.id === item.id) {
          continue;
        }

        const normalizedOtherAnswer = normalize(otherItem.canonicalAnswer);
        if (!meaningfulLeakCandidate(normalizedOtherAnswer)) {
          continue;
        }

        if (normalizedPrompt.includes(normalizedOtherAnswer)) {
          return err({
            code: "VALIDATION_ERROR",
            message: `Assessment item ${item.id} leaks the answer to ${otherItem.id} in its prompt.`
          });
        }
      }
    }

    return ok(items);
  }
}
