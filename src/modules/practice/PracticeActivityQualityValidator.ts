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

function isGenericRecallPrompt(value: string): boolean {
  const normalized = normalize(value);
  return (
    normalized.startsWith("what should you remember about ") ||
    normalized.startsWith("review ") ||
    normalized.startsWith("revise ") ||
    normalized === "what should you remember"
  );
}

export class PracticeActivityQualityValidator {
  validate(cards: readonly Flashcard[]): Result<readonly Flashcard[]> {
    for (const card of cards) {
      if (
        !card ||
        typeof card.id !== "string" ||
        typeof card.front !== "string" ||
        typeof card.back !== "string" ||
        typeof card.topic !== "string" ||
        typeof card.learningObjective !== "string" ||
        typeof card.sourceMasterDataItemId !== "string" ||
        typeof card.sourceVisibleSentence !== "string"
      ) {
        return err({
          code: "VALIDATION_ERROR",
          message: "Practice activity candidate included a malformed flashcard."
        });
      }

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

      if (isGenericRecallPrompt(card.front)) {
        return err({
          code: "VALIDATION_ERROR",
          message: `Flashcard ${card.id} uses a vague front and must ask for a specific retrieval.`
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
