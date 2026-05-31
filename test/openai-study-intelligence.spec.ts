import { describe, expect, it } from "vitest";
import { InitialAssessmentContext } from "../src/domain/primitives/Context.js";
import { SqliteLearningLoopRepository } from "../src/modules/planning/SqliteLearningLoopRepository.js";
import { OpenAIStudyIntelligence } from "../src/modules/runtime/OpenAIStudyIntelligence.js";

describe("OpenAIStudyIntelligence", () => {
  it("normalizes a compatibility-shaped master-data interpretation response before validation", async () => {
    const runtime = new OpenAIStudyIntelligence({
      apiKey: "test-key",
      fetcher: (async () =>
        new Response(
          JSON.stringify({
            id: "chatcmpl_test",
            model: "gpt-test",
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    sourceName: "Year 7 Geography: Coasts",
                    learnerYearGroup: "Year 7",
                    topic: "Coasts",
                    summary:
                      "Coasts are shaped by erosion, transportation, longshore drift, and deposition.",
                    subtopics: [
                      { title: "Erosion" },
                      { title: "Longshore Drift" },
                      { title: "Deposition" }
                    ],
                    learningObjectives: [
                      "Explain how erosion changes the coastline.",
                      "Describe how longshore drift moves sediment."
                    ],
                    vocabulary: ["erosion", "longshore drift", "deposition"],
                    keyConcepts: ["Erosion", "Transportation", "Deposition"],
                    sourceMap: {
                      "Coasts > Erosion > source-1":
                        "Erosion wears away the coastline through hydraulic action and abrasion.",
                      "Coasts > Transportation > source-2":
                        "Longshore drift moves sediment along the coast in a zigzag pattern.",
                      "Coasts > Deposition > source-3":
                        "Deposition happens when the sea loses energy and drops material."
                    },
                    items: [
                      {
                        content:
                          "Erosion wears away the coastline through hydraulic action and abrasion.",
                        sourceRef: "Coasts > Erosion > source-1"
                      },
                      {
                        content: "Longshore drift moves sediment along the coast in a zigzag pattern.",
                        sourceRef: "Coasts > Transportation > source-2"
                      },
                      {
                        content: "Deposition happens when the sea loses energy and drops material.",
                        sourceRef: "Coasts > Deposition > source-3"
                      }
                    ]
                  })
                }
              }
            ]
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        )) as typeof fetch
    });

    const result = await runtime.interpretMasterData({
      sourceId: "upload:coasts",
      sourceName: "Year 7 Geography: Coasts",
      rawSourceContent: `
Y7 GEOGRAPHY
COASTS

Erosion
- Erosion wears away the coastline through hydraulic action and abrasion.

Longshore Drift
- Longshore drift moves sediment along the coast in a zigzag pattern.

Deposition
- Deposition happens when the sea loses energy and drops material.
      `,
      contentType: "text/markdown",
      learnerYearGroup: "Year 7",
      userHints: {
        subject: "Geography",
        topic: "Coasts"
      },
      expectedOutputSchema: "MasterDataInterpretationCandidate.v1"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.interpretation.schema).toBe("MasterDataInterpretationCandidate.v1");
    expect(result.value.interpretation.detectedSubject).toBe("Geography");
    expect(result.value.interpretation.detectedYearGroup).toBe("Year 7");
    expect(result.value.interpretation.mainTopic).toBe("Coasts");
    expect(result.value.interpretation.subtopics).toEqual(
      expect.arrayContaining(["Erosion", "Longshore Drift", "Deposition"])
    );
    expect(result.value.interpretation.keyTerms).toEqual(
      expect.arrayContaining(["erosion", "longshore drift", "deposition"])
    );
    expect(result.value.interpretation.sourceMap.length).toBeGreaterThan(0);
    expect(result.value.interpretation.items.length).toBeGreaterThan(0);
  });

  it("accepts a model-selected assessment count below the requested maximum", async () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    repository.registerMasterData({
      sourceName: "Year 7 Geography: Coasts",
      rawSourceContent: "Coasts pack",
      contentType: "text/plain",
      items: Array.from({ length: 8 }, (_, index) => ({
        topic: "Coasts",
        prompt: `Explain coastal idea ${index + 1}.`,
        canonicalAnswer: `Coastal fact ${index + 1}.`,
        visibleMaterial: `Visible coastal material ${index + 1}.`,
        structured: {
          subject: "Geography",
          yearGroup: "Year 7",
          topic: "Coasts",
          subtopic: `Subtopic ${index + 1}`,
          itemType: "fact",
          content: `Coastal fact ${index + 1}.`,
          sourceRef: `coasts > fact-${index + 1}`
        }
      }))
    });

    const selected = repository.findMasterDataByTopic("Coasts")[0];
    expect(selected).toBeDefined();
    if (!selected) {
      return;
    }

    const runtime = new OpenAIStudyIntelligence({
      apiKey: "test-key",
      fetcher: (async () =>
        new Response(
          JSON.stringify({
            id: "chatcmpl_test",
            model: "gpt-test",
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    artifactContent: {
                      topic: "Coasts",
                      questionCount: 5,
                      instructions: "Short check-up",
                      items: Array.from({ length: 5 }, (_, index) => ({
                        id: `assessment_item_${index + 1}`,
                        prompt: `Prompt ${index + 1}`,
                        difficulty: "easy"
                      }))
                    },
                    items: Array.from({ length: 5 }, (_, index) => ({
                      id: `assessment_item_${index + 1}`,
                      topic: "Coasts",
                      prompt: `Prompt ${index + 1}`,
                      canonicalAnswer: `Answer ${index + 1}`,
                      visibleMaterial: `Visible ${index + 1}`,
                      difficulty: "easy",
                      sourceMasterDataItemId: selected.items[index]?.id
                    }))
                  })
                }
              }
            ]
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        )) as typeof fetch
    });

    const result = await runtime.generateInitialAssessment({
      learningLoopId: "loop_test",
      context: InitialAssessmentContext.create({
        command: {
          learnerName: "Year 7 learner",
          yearGroup: "Year 7",
          topic: "Coasts",
          questionCount: 8
        },
        sourceName: selected.source.name
      }),
      source: selected.source,
      sourceItems: selected.items
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.items).toHaveLength(5);
    expect(result.value.artifactContent.items).toHaveLength(5);
    expect(result.value.artifactContent.questionCount).toBe(5);
    expect(result.value.blueprint?.questionCount).toBe(5);
    expect(result.value.blueprint?.maxQuestionCount).toBe(8);
  });

  it("falls back when the model exceeds the requested assessment limit", async () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    repository.registerMasterData({
      sourceName: "Year 7 Geography: Coasts",
      rawSourceContent: "Coasts pack",
      contentType: "text/plain",
      items: Array.from({ length: 8 }, (_, index) => ({
        topic: "Coasts",
        prompt: `Explain coastal idea ${index + 1}.`,
        canonicalAnswer: `Coastal fact ${index + 1}.`,
        visibleMaterial: `Visible coastal material ${index + 1}.`,
        structured: {
          subject: "Geography",
          yearGroup: "Year 7",
          topic: "Coasts",
          subtopic: `Subtopic ${index + 1}`,
          itemType: "fact",
          content: `Coastal fact ${index + 1}.`,
          sourceRef: `coasts > fact-${index + 1}`
        }
      }))
    });

    const selected = repository.findMasterDataByTopic("Coasts")[0];
    expect(selected).toBeDefined();
    if (!selected) {
      return;
    }

    const runtime = new OpenAIStudyIntelligence({
      apiKey: "test-key",
      fetcher: (async () =>
        new Response(
          JSON.stringify({
            id: "chatcmpl_test",
            model: "gpt-test",
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    assessmentBlueprint: {
                      questionCount: 10,
                      maxQuestionCount: 8,
                      targetDurationMinutes: 8,
                      questionTypeMix: ["free_form"],
                      coveredSubtopics: ["Coasts"],
                      objectiveRefs: [],
                      sourceRefs: [],
                      difficultyProfile: { easy: 0.4, medium: 0.4, stretch: 0.2 },
                      rationale: "Too many questions."
                    },
                    items: Array.from({ length: 10 }, (_, index) => ({
                      id: `assessment_item_${index + 1}`,
                      topic: "Coasts",
                      prompt: `Prompt ${index + 1}`,
                      canonicalAnswer: `Answer ${index + 1}`,
                      visibleMaterial: `Visible ${index + 1}`,
                      difficulty: "easy",
                      sourceMasterDataItemId: selected.items[index % selected.items.length]?.id
                    }))
                  })
                }
              }
            ]
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        )) as typeof fetch
    });

    const result = await runtime.generateInitialAssessment({
      learningLoopId: "loop_test",
      context: InitialAssessmentContext.create({
        command: {
          learnerName: "Year 7 learner",
          yearGroup: "Year 7",
          topic: "Coasts",
          questionCount: 8
        },
        sourceName: selected.source.name
      }),
      source: selected.source,
      sourceItems: selected.items
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.items).toHaveLength(8);
    expect(result.value.artifactContent.questionCount).toBe(8);
  });
});
