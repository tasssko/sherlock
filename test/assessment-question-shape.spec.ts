import { describe, expect, it } from "vitest";
import { InitialAssessmentContext } from "../src/domain/primitives/Context.js";
import { FixtureAgentRuntime } from "../src/modules/runtime/FixtureAgentRuntime.js";
import { SqliteLearningLoopRepository } from "../src/modules/planning/SqliteLearningLoopRepository.js";

describe("Assessment question shaping", () => {
  it("builds hints and richer question types for the initial assessment", async () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const runtime = new FixtureAgentRuntime();

    const upload = repository.registerMasterData({
      sourceName: "Year 7 Geography: Coasts",
      rawSourceContent:
        "Erosion, transport, and deposition shape coasts. Longshore drift moves material along the coast. A spit forms when deposition builds out from the shore.",
      contentType: "text/plain",
      items: [
        {
          topic: "Coasts",
          prompt: "What does longshore drift mean?",
          canonicalAnswer: "Longshore drift",
          visibleMaterial: "Longshore drift moves material along the coast.",
          structured: {
            subject: "Geography",
            yearGroup: "Year 7",
            topic: "Coasts",
            subtopic: "Transport",
            itemType: "key_term",
            content: "Longshore drift moves material along the coast.",
            sourceRef: "coasts > transport > key-term-1",
            term: "Longshore drift",
            definition: "The movement of material along the coast by waves approaching at an angle."
          }
        },
        {
          topic: "Coasts",
          prompt: "Name the main coastal processes.",
          canonicalAnswer: "erosion, transport, deposition",
          visibleMaterial: "Erosion, transport, and deposition shape coasts.",
          structured: {
            subject: "Geography",
            yearGroup: "Year 7",
            topic: "Coasts",
            subtopic: "Coastal processes",
            itemType: "fact",
            content: "Erosion, transport, and deposition shape coasts.",
            sourceRef: "coasts > processes > fact-1"
          }
        },
        {
          topic: "Coasts",
          prompt: "How does a spit form?",
          canonicalAnswer: "A spit forms when deposition builds out from the shore.",
          visibleMaterial: "A spit forms when deposition builds out from the shore.",
          structured: {
            subject: "Geography",
            yearGroup: "Year 7",
            topic: "Coasts",
            subtopic: "Deposition landforms",
            itemType: "fact",
            content: "A spit forms when deposition builds out from the shore.",
            sourceRef: "coasts > landforms > fact-1"
          }
        },
        {
          topic: "Coasts",
          prompt: "What is erosion?",
          canonicalAnswer: "The wearing away of the coast by the sea.",
          visibleMaterial: "Erosion wears away the coast.",
          structured: {
            subject: "Geography",
            yearGroup: "Year 7",
            topic: "Coasts",
            subtopic: "Erosion",
            itemType: "fact",
            content: "Erosion wears away the coast.",
            sourceRef: "coasts > erosion > fact-1"
          }
        }
      ]
    });

    const sourceSelection = repository.findMasterDataByTopic("Coasts")[0];
    expect(sourceSelection).toBeDefined();
    if (!sourceSelection) {
      return;
    }

    const result = await runtime.generateInitialAssessment({
      learningLoopId: "loop_test",
      context: InitialAssessmentContext.create({
        command: {
          learnerName: "Year 7 learner",
          yearGroup: "Year 7",
          topic: "Coasts",
          questionCount: 4
        },
        sourceName: upload.source.name
      }),
      source: sourceSelection.source,
      sourceItems: sourceSelection.items
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.items.every((item) => Boolean(item.hint && item.sourceFact))).toBe(true);
    expect(result.value.items.some((item) => item.questionType === "multiple_choice")).toBe(true);
    expect(result.value.items.some((item) => item.questionType === "multiple_select")).toBe(true);
    expect(
      result.value.items
        .filter((item) => item.questionType !== "free_form")
        .every((item) => Array.isArray(item.options) && item.options.length > 1)
    ).toBe(true);
  });
});
