import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { demoMasterDataRegistry } from "../src/modules/masterData/demoMasterDataRegistry.js";
import { validateMasterDataInterpretationCandidate } from "../src/modules/masterData/MasterDataInterpretation.js";
import { FixtureAgentRuntime } from "../src/modules/runtime/FixtureAgentRuntime.js";

async function interpretDemo(entry: (typeof demoMasterDataRegistry)[number]) {
  const runtime = new FixtureAgentRuntime();
  const rawSourceContent = readFileSync(resolve(entry.filePath), "utf8");
  const result = await runtime.interpretMasterData({
    sourceId: entry.id,
    sourceName: entry.label,
    rawSourceContent,
    contentType: entry.filePath.endsWith(".md") ? "text/markdown" : "text/plain",
    learnerYearGroup: entry.yearGroup,
    userHints: {
      subject: entry.subject,
      topic: entry.topic
    },
    expectedOutputSchema: "MasterDataInterpretationCandidate.v1"
  });

  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.value.interpretation;
}

describe("Master data interpretation quality", () => {
  it("accepts specific, source-grounded interpretations across the canonical demo corpus", async () => {
    for (const entry of demoMasterDataRegistry) {
      const interpretation = await interpretDemo(entry);

      expect(interpretation.detectedSubject).toBe(entry.subject);
      expect(interpretation.detectedYearGroup).toBe(entry.yearGroup);
      expect(interpretation.mainTopic).toBe(entry.topic);
      expect(interpretation.learnerFacingMaterialSummary).toContain(entry.topic);
      expect(interpretation.learnerFacingMaterialSummary.length).toBeGreaterThanOrEqual(48);
      expect(interpretation.subtopics.length).toBeGreaterThan(0);
      expect(interpretation.learningObjectives.length).toBeGreaterThan(0);
      expect(interpretation.sourceMap.length).toBeGreaterThan(0);
      expect(
        interpretation.learningObjectives.every(
          (objective) =>
            objective.objective.length >= 20 && objective.sourceRefs.length > 0
        )
      ).toBe(true);
      expect(
        interpretation.sourceMap.every(
          (entry) => entry.sourceRef.length > 0 && entry.excerpt.length > 0
        )
      ).toBe(true);

      if (interpretation.items.some((item) => item.itemType === "person")) {
        expect(interpretation.keyPeople.length).toBeGreaterThan(0);
      }
      if (interpretation.items.some((item) => item.itemType === "key_term")) {
        expect(interpretation.keyTerms.length).toBeGreaterThan(0);
      }
      if (interpretation.items.some((item) => item.itemType === "date")) {
        expect(interpretation.importantDates.length).toBeGreaterThan(0);
      }
      if (
        interpretation.items.some(
          (item) =>
            item.itemType === "cause" ||
            item.itemType === "event" ||
            item.itemType === "consequence" ||
            item.itemType === "legacy"
        )
      ) {
        expect(interpretation.processes.length).toBeGreaterThan(0);
      }
    }
  });

  it("rejects vague summaries, missing objectives, and missing source refs", async () => {
    const interpretation = await interpretDemo(
      demoMasterDataRegistry.find((entry) => entry.id === "history-mary-i-md") ??
        demoMasterDataRegistry[0]
    );

    expect(() =>
      validateMasterDataInterpretationCandidate({
        ...interpretation,
        learnerFacingMaterialSummary: "This is study material for Year 7."
      })
    ).toThrow(/summary/i);

    expect(() =>
      validateMasterDataInterpretationCandidate({
        ...interpretation,
        learningObjectives: []
      })
    ).toThrow();

    expect(() =>
      validateMasterDataInterpretationCandidate({
        ...interpretation,
        learningObjectives: interpretation.learningObjectives.map((objective, index) =>
          index === 0 ? { ...objective, sourceRefs: ["missing-ref"] } : objective
        )
      })
    ).toThrow(/unknown source ref/i);
  });
});
