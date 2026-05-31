import { describe, expect, it } from "vitest";
import { createServer } from "../src/app/api/createServer.js";
import { deriveGoldenPathStep } from "../src/app/ui/deriveGoldenPathStep.js";

describe("Learning loop resume", () => {
  it("resumes the correct learner step after refresh at each major phase", async () => {
    const server = await createServer();

    try {
      await server.inject({
        method: "POST",
        url: "/v1/master-data",
        payload: {
          sourceName: "Year 7 Golden Path Seed",
          items: [
            {
              topic: "fractions",
              prompt: "Simplify 6/8.",
              canonicalAnswer: "three quarters",
              visibleMaterial:
                "Fractions can be simplified by dividing numerator and denominator by the same number."
            },
            {
              topic: "fractions",
              prompt: "Which is larger: 2/3 or 3/5?",
              canonicalAnswer: "two thirds",
              visibleMaterial:
                "Compare fractions by finding common denominators or decimal equivalents."
            }
          ]
        }
      });

      const assessmentResponse = await server.inject({
        method: "POST",
        url: "/v1/assessments/initial",
        payload: {
          learnerName: "Adam Skoudros",
          yearGroup: "Year 7",
          topic: "fractions",
          questionCount: 2
        }
      });
      const assessment = assessmentResponse.json();

      const afterAssessment = await server.inject({
        method: "GET",
        url: `/v1/learning-loops/${assessment.learningLoop.id}`
      });
      expect(afterAssessment.statusCode).toBe(200);
      expect(deriveGoldenPathStep(afterAssessment.json())).toBe("take-assessment");
      expect(afterAssessment.json()).toMatchObject({
        learningLoopId: assessment.learningLoop.id,
        phase: "diagnosis",
        currentAssessment: expect.objectContaining({
          id: assessment.assessment.id
        }),
        assessmentArtifact: expect.any(Object)
      });

      await server.inject({
        method: "POST",
        url: "/v1/assessments/attempts",
        payload: {
          assessmentId: assessment.assessment.id,
          responses: assessment.assessment.items.map((item: { id: string }) => ({
            itemId: item.id,
            answer: "incorrect response"
          }))
        }
      });
      const afterAttempt = await server.inject({
        method: "GET",
        url: `/v1/learning-loops/${assessment.learningLoop.id}`
      });
      expect(afterAttempt.statusCode).toBe(200);
      expect(deriveGoldenPathStep(afterAttempt.json())).toBe("start-loop");
      expect(afterAttempt.json().knowledgeGaps.length).toBeGreaterThan(0);
      expect(afterAttempt.json().loopBatch).toEqual(
        expect.objectContaining({
          units: expect.any(Array)
        })
      );

      await server.inject({
        method: "POST",
        url: "/v1/study-plans",
        payload: {
          learnerName: "Adam Skoudros",
          yearGroup: "Year 7",
          objective: "Build a steady weekly plan for fractions, forces, and French vocabulary.",
          focusTopics: ["fractions"],
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
      const afterPlan = await server.inject({
        method: "GET",
        url: `/v1/learning-loops/${assessment.learningLoop.id}`
      });
      expect(afterPlan.statusCode).toBe(200);
      expect(deriveGoldenPathStep(afterPlan.json())).toBe("generate-practice");
      expect(afterPlan.json().studyPlan).toEqual(
        expect.objectContaining({
          artifact: expect.any(Object),
          workPlan: expect.any(Object)
        })
      );

      const practiceResponse = await server.inject({
        method: "POST",
        url: `/v1/learning-loops/${assessment.learningLoop.id}/practice-activities`,
        payload: {
          kind: "flashcard_set",
          cardCount: 2
        }
      });
      const practice = practiceResponse.json();

      const afterPractice = await server.inject({
        method: "GET",
        url: `/v1/learning-loops/${assessment.learningLoop.id}`
      });
      expect(afterPractice.statusCode).toBe(200);
      expect(deriveGoldenPathStep(afterPractice.json())).toBe("complete-review");
      expect(afterPractice.json().currentPracticeActivity).toMatchObject({
        id: practice.practiceActivity.id
      });

      await server.inject({
        method: "POST",
        url: `/v1/practice-activities/${practice.practiceActivity.id}/completions`,
        payload: {
          responses: practice.practiceActivity.flashcardSet.cards.map(
            (card: { id: string; back: string }) => ({
              practiceItemId: card.id,
              responseText: card.back,
              confidence: "high"
            })
          )
        }
      });
      const afterCompletion = await server.inject({
        method: "GET",
        url: `/v1/learning-loops/${assessment.learningLoop.id}`
      });
      expect(afterCompletion.statusCode).toBe(200);
      expect(deriveGoldenPathStep(afterCompletion.json())).toBe("start-loop");
      expect(afterCompletion.json()).toMatchObject({
        masteryProfile: expect.any(Object),
        latestActiveReviewSession: expect.objectContaining({
          nextReviewAt: expect.any(String)
        }),
        nextAction: expect.objectContaining({
          kind: "start-loop-unit"
        })
      });
    } finally {
      await server.close();
    }
  });
});
