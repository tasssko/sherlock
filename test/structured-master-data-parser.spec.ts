import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MasterDataItem, MasterDataSource } from "../src/domain/learning/MasterData.js";
import { PracticeActivityContext, InitialAssessmentContext } from "../src/domain/primitives/Context.js";
import { createKnowledgeGapId, createLearningLoopId } from "../src/domain/primitives/ids.js";
import { parseMasterDataInput } from "../src/modules/masterData/structuredRevision.js";
import { FixtureAgentRuntime } from "../src/modules/runtime/FixtureAgentRuntime.js";

const maryFixture = readFileSync(
  resolve("docs/demo-master-data/@Y7 HISTORY — MARY I MASTER REVISION DOCUMENT.txt"),
  "utf8"
);

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildParsedMaryItems() {
  return parseMasterDataInput({
    sourceName: "Mary I Pack",
    lines: maryFixture,
    fallbackTopic: "history",
    fallbackYearGroup: "Year 7"
  });
}

function buildRuntimeItems() {
  const parsed = buildParsedMaryItems();
  const source = MasterDataSource.create("Mary I Pack", []);
  const items = parsed.items.map((item) => MasterDataItem.create(source.id, item));

  return {
    parsed,
    source,
    items
  };
}

describe("Structured master-data ingestion", () => {
  it("detects Year 7 History, Mary I, people, terms, dates, and preserved cause-event-consequence sections", () => {
    const parsed = buildParsedMaryItems();

    expect(parsed.mode).toBe("structured");
    expect(parsed.summary.subject).toBe("History");
    expect(parsed.summary.yearGroup).toBe("Year 7");
    expect(parsed.summary.mainTopic).toBe("Mary I");
    expect(parsed.summary.keyPeople).toEqual(
      expect.arrayContaining(["Mary I", "Philip II Of Spain", "Lady Jane Grey"])
    );
    expect(parsed.summary.keyTerms).toEqual(
      expect.arrayContaining(["Catholic", "Protestant", "Succession"])
    );
    expect(parsed.summary.importantDates).toEqual(
      expect.arrayContaining(["1553", "10 July 1553", "1554", "1555–1558"])
    );

    const causeItems = parsed.structuredItems.filter((item) => item.itemType === "cause");
    const eventItems = parsed.structuredItems.filter((item) => item.itemType === "event");
    const consequenceItems = parsed.structuredItems.filter(
      (item) => item.itemType === "consequence"
    );

    expect(causeItems.some((item) => item.subtopic.includes("Wyatt’s Rebellion (1554) > Causes"))).toBe(true);
    expect(eventItems.some((item) => item.subtopic.includes("Wyatt’s Rebellion (1554) > Events"))).toBe(true);
    expect(
      consequenceItems.some((item) =>
        item.subtopic.includes("Wyatt’s Rebellion (1554) > Consequences")
      )
    ).toBe(true);
  });

  it("stores structured people, terms, and dates on master-data items", () => {
    const { items } = buildRuntimeItems();

    expect(items.some((item) => item.itemType === "person" && item.person === "Mary I")).toBe(true);
    expect(
      items.some((item) => item.itemType === "key_term" && item.term === "Catholic")
    ).toBe(true);
    expect(items.some((item) => item.itemType === "date" && item.date === "10 July 1553")).toBe(
      true
    );
  });

  it("generates check-up questions with cited source refs", () => {
    const { items, source } = buildRuntimeItems();
    const runtime = new FixtureAgentRuntime();
    const result = runtime.generateInitialAssessment({
      context: InitialAssessmentContext.create({
        command: {
          learnerName: "Adam Skoudros",
          yearGroup: "Year 7",
          topic: "Mary I",
          questionCount: 3
        },
        sourceName: source.name
      }),
      source,
      sourceItems: items.slice(0, 3)
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.items.every((item) => item.prompt.includes("[Source: "))).toBe(true);
    expect(result.value.items.some((item) => item.prompt.includes("Mary I >"))).toBe(true);
    expect(result.value.artifactContent.items.every((item) => item.prompt.includes("[Source: "))).toBe(
      true
    );
  });

  it("turns source bullets into active-recall flashcard prompts instead of copying them verbatim", () => {
    const { items } = buildRuntimeItems();
    const runtime = new FixtureAgentRuntime();
    const factItem = items.find((item) => item.itemType === "fact" && item.content);

    expect(factItem).toBeDefined();
    if (!factItem) {
      return;
    }

    const result = runtime.generatePracticeActivity({
      context: PracticeActivityContext.create({
        command: {
          learningLoopId: createLearningLoopId(),
          kind: "flashcard_set",
          cardCount: 1
        },
        diagnosedGaps: ["Recall key events from Mary I"],
        learnerName: "Adam Skoudros",
        learningLoopId: createLearningLoopId(),
        sourceNames: ["Mary I Pack"],
        topic: "Mary I",
        yearGroup: "Year 7"
      }),
      selections: [
        {
          gap: {
            id: createKnowledgeGapId(),
            description: "Recall key events from Mary I"
          },
          item: factItem
        }
      ]
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const card = result.value.flashcardSet.cards[0];
    expect(card).toBeDefined();
    if (!card) {
      return;
    }

    expect(normalize(card.front)).not.toBe(normalize(card.sourceVisibleSentence));
    expect(card.front.endsWith("?")).toBe(true);
    expect(card.back).toBe(factItem.content);
  });
});
