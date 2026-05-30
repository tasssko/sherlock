import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createServer } from "../src/app/api/createServer.js";
import { demoMasterDataRegistry } from "../src/modules/masterData/demoMasterDataRegistry.js";
import { parseMasterDataInput } from "../src/modules/masterData/structuredRevision.js";

function parseDemoEntry(entry: (typeof demoMasterDataRegistry)[number]) {
  const lines = readFileSync(resolve(entry.filePath), "utf8");

  return parseMasterDataInput({
    sourceName: entry.label,
    lines,
    fallbackSubject: entry.subject,
    fallbackTopic: entry.topic,
    fallbackYearGroup: entry.yearGroup
  });
}

describe("Demo master-data registry", () => {
  it("covers every canonical demo file in docs/demo-master-data", () => {
    const actualFiles = readdirSync(resolve("docs/demo-master-data"))
      .filter((file) => file.endsWith(".md") || file.endsWith(".txt"))
      .sort()
      .map((file) => join("docs/demo-master-data", file));
    const registryFiles = demoMasterDataRegistry.map((entry) => entry.filePath).sort();

    expect(registryFiles).toEqual(actualFiles);
  });

  it("parses every demo document into useful master-data items with source refs", () => {
    for (const entry of demoMasterDataRegistry) {
      const parsed = parseDemoEntry(entry);

      expect(parsed.mode).toBe("structured");
      expect(parsed.items.length).toBeGreaterThanOrEqual(5);
      expect(parsed.structuredItems.length).toBe(parsed.items.length);
      expect(parsed.summary.subject).toBe(entry.subject);
      expect(parsed.summary.yearGroup).toBe(entry.yearGroup);
      expect(parsed.summary.mainTopic).toBe(entry.topic);
      expect(parsed.structuredItems.every((item) => item.sourceRef.length > 0)).toBe(true);
      expect(
        parsed.items.every((item) =>
          (item.keywords ?? []).some((keyword) => keyword.startsWith("__md_sourceRef="))
        )
      ).toBe(true);
    }
  });

  it("can run the golden path from a demo document without manual paste", async () => {
    const entry = demoMasterDataRegistry.find((candidate) => candidate.id === "history-mary-i-txt");
    expect(entry).toBeDefined();
    if (!entry) {
      return;
    }

    const parsed = parseDemoEntry(entry);
    const server = await createServer();

    try {
      const uploadResponse = await server.inject({
        method: "POST",
        url: "/v1/master-data",
        payload: {
          sourceName: entry.label,
          items: parsed.items.map((item) => ({
            ...item,
            topic: parsed.summary.mainTopic ?? entry.topic
          }))
        }
      });

      expect(uploadResponse.statusCode).toBe(201);

      const assessmentResponse = await server.inject({
        method: "POST",
        url: "/v1/assessments/initial",
        payload: {
          learnerName: "Adam Skoudros",
          yearGroup: entry.yearGroup,
          topic: entry.topic,
          questionCount: 3
        }
      });

      expect(assessmentResponse.statusCode).toBe(201);
      const assessmentPayload = assessmentResponse.json();

      const attemptResponse = await server.inject({
        method: "POST",
        url: "/v1/assessments/attempts",
        payload: {
          assessmentId: assessmentPayload.assessment.id,
          responses: assessmentPayload.assessment.items.map((item: { id: string }) => ({
            itemId: item.id,
            answer: "incorrect response"
          }))
        }
      });

      expect(attemptResponse.statusCode).toBe(201);

      const studyPlanResponse = await server.inject({
        method: "POST",
        url: "/v1/study-plans",
        payload: {
          learnerName: "Adam Skoudros",
          yearGroup: entry.yearGroup,
          objective: `Build more secure recall in ${entry.topic}.`,
          focusTopics: [entry.topic],
          availableMinutesByDay: {
            Monday: 30,
            Tuesday: 30,
            Wednesday: 30,
            Thursday: 30,
            Friday: 30,
            Saturday: 60,
            Sunday: 0
          }
        }
      });

      expect(studyPlanResponse.statusCode).toBe(201);

      const practiceResponse = await server.inject({
        method: "POST",
        url: `/v1/learning-loops/${assessmentPayload.learningLoop.id}/practice-activities`,
        payload: {
          kind: "flashcard_set",
          cardCount: 3
        }
      });

      expect(practiceResponse.statusCode).toBe(201);
    } finally {
      await server.close();
    }
  });
});
