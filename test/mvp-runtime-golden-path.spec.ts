import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../src/app/api/createServer.js";

const originalIntelligence = process.env.LOOP_STUDY_INTELLIGENCE;
const originalRelayUrl = process.env.LOOP_STUDY_RELAY_API_URL;

afterEach(() => {
  if (originalIntelligence === undefined) {
    delete process.env.LOOP_STUDY_INTELLIGENCE;
  } else {
    process.env.LOOP_STUDY_INTELLIGENCE = originalIntelligence;
  }

  if (originalRelayUrl === undefined) {
    delete process.env.LOOP_STUDY_RELAY_API_URL;
  } else {
    process.env.LOOP_STUDY_RELAY_API_URL = originalRelayUrl;
  }
});

describe("MVP runtime golden path", () => {
  it("runs material intake, initial loop batching, and practice without Relay config", async () => {
    delete process.env.LOOP_STUDY_INTELLIGENCE;
    delete process.env.LOOP_STUDY_RELAY_API_URL;
    const server = await createServer();

    try {
      const uploadResponse = await server.inject({
        method: "POST",
        url: "/v1/master-data",
        payload: {
          sourceName: "Year 7 Fractions Bank",
          items: [
            {
              topic: "fractions",
              prompt: "Simplify 6/8.",
              canonicalAnswer: "three quarters",
              visibleMaterial: "Fractions can be simplified by dividing numerator and denominator by the same number."
            },
            {
              topic: "fractions",
              prompt: "Which is larger: 2/3 or 3/5?",
              canonicalAnswer: "two thirds",
              visibleMaterial: "Compare fractions by finding common denominators or decimal equivalents."
            }
          ]
        }
      });

      expect(uploadResponse.statusCode).toBe(201);

      const startResponse = await server.inject({
        method: "POST",
        url: "/v1/learning-loops/start",
        payload: {
          learnerName: "Year 7 learner",
          yearGroup: "Year 7",
          topic: "fractions",
          objective: "Build secure understanding in fractions.",
          desiredLoopCount: 2
        }
      });

      expect(startResponse.statusCode).toBe(201);
      const startPayload = startResponse.json();
      expect(startPayload).toMatchObject({
        phase: "loop-batching",
        nextAction: expect.objectContaining({
          kind: "start-loop-unit"
        }),
        loopBatch: expect.objectContaining({
          units: expect.arrayContaining([
            expect.objectContaining({
              focus: expect.any(String),
              learnerTask: expect.any(String),
              sourceRefs: expect.any(Array)
            })
          ])
        })
      });

      const practiceResponse = await server.inject({
        method: "POST",
        url: `/v1/learning-loops/${startPayload.learningLoop.id}/practice-activities`,
        payload: {
          kind: "flashcard_set",
          cardCount: 2
        }
      });

      expect(practiceResponse.statusCode).toBe(201);
      expect(practiceResponse.json()).toMatchObject({
        learningLoop: expect.objectContaining({
          phase: "practice"
        }),
        nextAction: expect.objectContaining({
          kind: "complete-practice-activity"
        }),
        practiceActivity: expect.objectContaining({
          flashcardSet: expect.objectContaining({
            cards: expect.any(Array)
          })
        })
      });
    } finally {
      await server.close();
    }
  });
});
