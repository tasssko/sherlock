import { describe, expect, it } from "vitest";
import { createMasterDataItemId } from "../src/domain/primitives/ids.js";
import { AssessmentQualityValidator } from "../src/modules/assessment/AssessmentQualityValidator.js";

describe("AssessmentQualityValidator", () => {
  it("rejects repeated questions", () => {
    const validator = new AssessmentQualityValidator();

    const result = validator.validate([
      {
        id: "q1",
        topic: "Coasts",
        prompt: "What is erosion?",
        canonicalAnswer: "The wearing away of the coast by the sea.",
        visibleMaterial: "Coastal processes overview.",
        difficulty: "easy",
        sourceMasterDataItemId: createMasterDataItemId()
      },
      {
        id: "q2",
        topic: "Coasts",
        prompt: "What is erosion?",
        canonicalAnswer: "The wearing away of the coast by the sea over time.",
        visibleMaterial: "Cliffs are worn down by the sea.",
        difficulty: "medium",
        sourceMasterDataItemId: createMasterDataItemId()
      }
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.message).toContain("repeat the same question");
  });

  it("rejects a question that leaks another answer in its prompt", () => {
    const validator = new AssessmentQualityValidator();

    const result = validator.validate([
      {
        id: "q1",
        topic: "Coasts",
        prompt: "Which process moves material along the coast?",
        canonicalAnswer: "Longshore drift",
        visibleMaterial: "Material can move along the coastline.",
        difficulty: "easy",
        sourceMasterDataItemId: createMasterDataItemId()
      },
      {
        id: "q2",
        topic: "Coasts",
        prompt: "How does longshore drift move material along the coast?",
        canonicalAnswer: "Waves approach at an angle and move sediment in a zigzag pattern.",
        visibleMaterial: "Waves approach at an angle.",
        difficulty: "medium",
        sourceMasterDataItemId: createMasterDataItemId()
      }
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.message).toContain("leaks the answer");
  });
});
