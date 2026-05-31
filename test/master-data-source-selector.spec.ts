import { describe, expect, it } from "vitest";
import { SqliteLearningLoopRepository } from "../src/modules/planning/SqliteLearningLoopRepository.js";
import { MasterDataSourceSelector } from "../src/modules/assessment/MasterDataSourceSelector.js";

describe("MasterDataSourceSelector", () => {
  it("spreads assessment items across subtopics instead of taking the first block only", () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const selector = new MasterDataSourceSelector(repository);

    repository.registerMasterData({
      sourceName: "Year 7 Geography: Coasts",
      acceptedInterpretation: {
        schema: "MasterDataInterpretationCandidate.v1",
        detectedSubject: "Geography",
        detectedYearGroup: "Year 7",
        mainTopic: "Coasts",
        subtopics: ["Erosion", "Longshore drift", "Deposition"],
        keyPeople: [],
        keyTerms: ["erosion", "longshore drift", "deposition"],
        importantDates: [],
        processes: ["erosion", "transport", "deposition"],
        learnerFacingMaterialSummary:
          "Coasts are shaped by erosion, longshore drift, and deposition.",
        learningObjectives: [
          {
            id: "objective_1",
            objective: "Explain how erosion shapes the coastline.",
            sourceRefs: ["erosion_ref_1"]
          }
        ],
        sourceMap: [
          {
            sourceRef: "erosion_ref_1",
            excerpt: "Erosion wears away cliffs and headlands."
          }
        ],
        items: [
          {
            subject: "Geography",
            yearGroup: "Year 7",
            topic: "Coasts",
            subtopic: "Erosion",
            itemType: "fact",
            content: "Erosion wears away cliffs and headlands.",
            sourceRef: "erosion_ref_1"
          }
        ]
      },
      items: [
        {
          topic: "Coasts",
          prompt: "What should you remember about erosion in Erosion?",
          canonicalAnswer: "Erosion wears away cliffs and headlands.",
          visibleMaterial: "Erosion wears away cliffs and headlands.",
          structured: {
            subject: "Geography",
            yearGroup: "Year 7",
            topic: "Coasts",
            subtopic: "Erosion",
            itemType: "fact",
            content: "Erosion wears away cliffs and headlands.",
            sourceRef: "erosion_ref_1"
          }
        },
        {
          topic: "Coasts",
          prompt: "What should you remember about hydraulic action in Erosion?",
          canonicalAnswer: "Hydraulic action forces water into cracks.",
          visibleMaterial: "Hydraulic action forces water into cracks.",
          structured: {
            subject: "Geography",
            yearGroup: "Year 7",
            topic: "Coasts",
            subtopic: "Erosion",
            itemType: "fact",
            content: "Hydraulic action forces water into cracks.",
            sourceRef: "erosion_ref_2"
          }
        },
        {
          topic: "Coasts",
          prompt: "What should you remember about abrasion in Erosion?",
          canonicalAnswer: "Abrasion scrapes rock with sand and pebbles.",
          visibleMaterial: "Abrasion scrapes rock with sand and pebbles.",
          structured: {
            subject: "Geography",
            yearGroup: "Year 7",
            topic: "Coasts",
            subtopic: "Erosion",
            itemType: "fact",
            content: "Abrasion scrapes rock with sand and pebbles.",
            sourceRef: "erosion_ref_3"
          }
        },
        {
          topic: "Coasts",
          prompt: "What should you remember about attrition in Erosion?",
          canonicalAnswer: "Attrition breaks rocks into smaller, rounder pieces.",
          visibleMaterial: "Attrition breaks rocks into smaller, rounder pieces.",
          structured: {
            subject: "Geography",
            yearGroup: "Year 7",
            topic: "Coasts",
            subtopic: "Erosion",
            itemType: "fact",
            content: "Attrition breaks rocks into smaller, rounder pieces.",
            sourceRef: "erosion_ref_4"
          }
        },
        {
          topic: "Coasts",
          prompt: "How does longshore drift move material along the coast?",
          canonicalAnswer: "Waves approach at an angle and move sediment in a zigzag pattern.",
          visibleMaterial: "Waves approach at an angle and move sediment in a zigzag pattern.",
          structured: {
            subject: "Geography",
            yearGroup: "Year 7",
            topic: "Coasts",
            subtopic: "Longshore drift",
            itemType: "fact",
            content: "Waves approach at an angle and move sediment in a zigzag pattern.",
            sourceRef: "transport_ref_1"
          }
        },
        {
          topic: "Coasts",
          prompt: "When does deposition happen at the coast?",
          canonicalAnswer: "Deposition happens when the sea loses energy and drops material.",
          visibleMaterial: "Deposition happens when the sea loses energy and drops material.",
          structured: {
            subject: "Geography",
            yearGroup: "Year 7",
            topic: "Coasts",
            subtopic: "Deposition",
            itemType: "fact",
            content: "Deposition happens when the sea loses energy and drops material.",
            sourceRef: "deposition_ref_1"
          }
        }
      ]
    });

    const selection = selector.select("Coasts", 4);
    expect(selection.ok).toBe(true);
    if (!selection.ok) {
      return;
    }

    const subtopics = selection.value.items.map((item) => item.subtopic ?? item.topic);
    expect(new Set(subtopics).size).toBeGreaterThan(1);
    expect(subtopics).toContain("Longshore drift");
  });
});
