import { describe, expect, it } from "vitest";
import { createKnowledgeGapId, createMasterDataItemId } from "../src/domain/primitives/ids.js";
import { PracticeActivityQualityValidator } from "../src/modules/practice/PracticeActivityQualityValidator.js";

describe("PracticeActivityQualityValidator", () => {
  it("rejects materially equivalent flashcard fronts and backs", () => {
    const validator = new PracticeActivityQualityValidator();

    const result = validator.validate([
      {
        id: "flashcard_1",
        front: "Which fractions are equivalent?",
        back: "equivalent fractions",
        topic: "fractions",
        knowledgeGapId: createKnowledgeGapId(),
        learningObjective: "Recognise equivalent fractions.",
        sourceMasterDataItemId: createMasterDataItemId(),
        sourceVisibleSentence: "Equivalent fractions can look different while still representing an equal quantity."
      }
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("VALIDATION_ERROR");
    expect(result.error.message).toContain("materially equivalent");
  });

  it("rejects vague flashcard fronts", () => {
    const validator = new PracticeActivityQualityValidator();

    const result = validator.validate([
      {
        id: "flashcard_1",
        front: "What should you remember about coastal erosion?",
        back: "Erosion wears away the coast through hydraulic action, abrasion, attrition, and solution.",
        topic: "coasts",
        knowledgeGapId: createKnowledgeGapId(),
        learningObjective: "Explain how erosion shapes coasts.",
        sourceMasterDataItemId: createMasterDataItemId(),
        sourceVisibleSentence: "Erosion wears away the coast through hydraulic action, abrasion, attrition, and solution."
      }
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("VALIDATION_ERROR");
    expect(result.error.message).toContain("specific retrieval");
  });
});
