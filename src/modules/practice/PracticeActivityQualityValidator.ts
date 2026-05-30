import type { Flashcard } from "../../domain/learning/PracticeActivity.js";
import { err, ok, type Result } from "../../domain/primitives/result.js";

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSignature(value: string): string {
  const stopWords = new Set([
    "a",
    "an",
    "are",
    "does",
    "is",
    "of",
    "the",
    "what",
    "which"
  ]);

  return normalize(value)
    .split(" ")
    .filter((token) => token && !stopWords.has(token))
    .sort()
    .join(" ");
}

export class PracticeActivityQualityValidator {
  validate(cards: readonly Flashcard[]): Result<readonly Flashcard[]> {
    for (const card of cards) {
      const normalizedFront = normalize(card.front);
      const normalizedBack = normalize(card.back);
      const normalizedSourceSentence = normalize(card.sourceVisibleSentence);

      if (!normalizedFront || !normalizedBack) {
        return err({
          code: "VALIDATION_ERROR",
          message: `Flashcard ${card.id} is missing front or back content.`
        });
      }

      if (normalizedFront === normalizedBack) {
        return err({
          code: "VALIDATION_ERROR",
          message: `Flashcard ${card.id} repeats the same prompt and answer.`
        });
      }

      if (tokenSignature(card.front) === tokenSignature(card.back)) {
        return err({
          code: "VALIDATION_ERROR",
          message: `Flashcard ${card.id} uses materially equivalent prompt and answer text.`
        });
      }

      if (
        normalizedSourceSentence &&
        normalizedSourceSentence.includes(normalizedFront) &&
        normalizedSourceSentence.includes(normalizedBack)
      ) {
        return err({
          code: "VALIDATION_ERROR",
          message: `Flashcard ${card.id} copies both sides verbatim from one visible source sentence.`
        });
      }
    }

    return ok(cards);
  }
}
