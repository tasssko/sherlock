import type { AssessmentItem } from "../../domain/learning/Assessment.js";
import { err, ok, type Result } from "../../domain/primitives/result.js";

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export class AssessmentQualityValidator {
  validate(items: readonly AssessmentItem[] | null | undefined): Result<readonly AssessmentItem[]> {
    if (!Array.isArray(items)) {
      return err({
        code: "VALIDATION_ERROR",
        message: "Assessment generation did not return a valid items array."
      });
    }

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
    }

    return ok(items);
  }
}
