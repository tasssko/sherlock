import { describe, expect, it } from "vitest";
import { createServer } from "../src/app/api/createServer.js";
import type { InitialAssessmentController } from "../src/modules/assessment/InitialAssessmentController.js";
import type { MasterDataUploadController } from "../src/modules/assessment/MasterDataUploadController.js";
import type { StudyPlanController } from "../src/modules/planning/StudyPlanController.js";
import type { PracticeActivityController } from "../src/modules/practice/PracticeActivityController.js";

const validStudyPlanBody = {
  learnerName: "Year 7 learner",
  yearGroup: "Year 7",
  objective: "Build a weekly plan.",
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
};

const validMasterDataBody = {
  sourceName: "Fractions Bank",
  items: [
    {
      topic: "fractions",
      prompt: "Simplify 6/8.",
      canonicalAnswer: "three quarters",
      visibleMaterial: "Fractions can describe equal parts of a whole."
    }
  ]
};

describe("Route boundaries", () => {
  it("answers browser preflight requests for the API routes", async () => {
    const server = await createServer();

    try {
      const response = await server.inject({
        method: "OPTIONS",
        url: "/v1/assessments/initial",
        headers: {
          origin: "http://127.0.0.1:4174",
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type"
        }
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:4174");
      expect(response.headers["access-control-allow-methods"]).toContain("POST");
      expect(response.headers["access-control-allow-headers"]).toContain("content-type");
    } finally {
      await server.close();
    }
  });

  it("maps study-plan validation errors to 400", async () => {
    const server = await createServer();

    try {
      const response = await server.inject({
        method: "POST",
        url: "/v1/study-plans",
        payload: {
          ...validStudyPlanBody,
          focusTopics: []
        }
      });

      expect(response.statusCode).toBe(400);
    } finally {
      await server.close();
    }
  });

  it("supports the MVP golden path across loop.study routes", async () => {
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
              visibleMaterial: "Fractions can describe equal parts of a whole."
            },
            {
              topic: "fractions",
              prompt: "Which is larger: 2/3 or 3/5?",
              canonicalAnswer: "two thirds",
              visibleMaterial: "Compare fractions by finding a common denominator or decimal."
            }
          ]
        }
      });

      expect(uploadResponse.statusCode).toBe(201);

      const assessmentResponse = await server.inject({
        method: "POST",
        url: "/v1/assessments/initial",
        payload: {
          learnerName: "Year 7 learner",
          yearGroup: "Year 7",
          topic: "fractions",
          questionCount: 2
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
      expect(attemptResponse.json().knowledgeGaps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            topic: "fractions"
          })
        ])
      );

      const studyPlanResponse = await server.inject({
        method: "POST",
        url: "/v1/study-plans",
        payload: validStudyPlanBody
      });

      expect(studyPlanResponse.statusCode).toBe(201);
      expect(studyPlanResponse.json()).toMatchObject({
        learningLoopId: assessmentPayload.learningLoop.id,
        phase: expect.any(String),
        nextAction: expect.objectContaining({
          kind: expect.any(String),
          summary: expect.any(String)
        })
      });
      expect(studyPlanResponse.json().learningLoop.id).toBe(assessmentPayload.learningLoop.id);
      expect(Array.isArray(studyPlanResponse.json().knowledgeGaps)).toBe(true);
      expect(studyPlanResponse.json().knowledgeGaps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            topic: "fractions"
          })
        ])
      );

      const practiceResponse = await server.inject({
        method: "POST",
        url: `/v1/learning-loops/${assessmentPayload.learningLoop.id}/practice-activities`,
        payload: {
          kind: "flashcard_set",
          cardCount: 2
        }
      });

      expect(practiceResponse.statusCode).toBe(201);
      expect(practiceResponse.json().practiceActivity.flashcardSet.cards).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sourceMasterDataItemId: expect.any(String),
            knowledgeGapId: expect.any(String)
          })
        ])
      );

      const practiceListResponse = await server.inject({
        method: "GET",
        url: `/v1/learning-loops/${assessmentPayload.learningLoop.id}/practice-activities`
      });

      expect(practiceListResponse.statusCode).toBe(200);
      expect(practiceListResponse.json().practiceActivities).toHaveLength(1);

      const practiceCompletionResponse = await server.inject({
        method: "POST",
        url: `/v1/practice-activities/${practiceResponse.json().practiceActivity.id}/completions`,
        payload: {
          responses: practiceResponse.json().practiceActivity.flashcardSet.cards.map(
            (card: { id: string; back: string }) => ({
              practiceItemId: card.id,
              responseText: card.back,
              confidence: "high"
            })
          )
        }
      });

      expect(practiceCompletionResponse.statusCode).toBe(201);
      expect(practiceCompletionResponse.json()).toMatchObject({
        learningLoopId: assessmentPayload.learningLoop.id,
        phase: expect.any(String),
        nextAction: expect.objectContaining({
          kind: expect.any(String),
          summary: expect.any(String)
        })
      });
      expect(practiceCompletionResponse.json().activeReviewSession.itemResults).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            confidence: "high",
            correct: expect.any(Boolean)
          })
        ])
      );
      expect(practiceCompletionResponse.json().masteryProfile.topics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            topic: "fractions"
          })
        ])
      );
      expect(practiceCompletionResponse.json().activeReviewSession).toEqual(
        expect.objectContaining({
          nextReviewAt: expect.any(String),
          reviewIntervalHours: expect.any(Number),
          remainingKnowledgeGapIds: expect.any(Array)
        })
      );
    } finally {
      await server.close();
    }
  });

  it("maps assessment validation errors to 400", async () => {
    const server = await createServer();

    try {
      const response = await server.inject({
        method: "POST",
        url: "/v1/assessments/initial",
        payload: {
          learnerName: "Year 7 learner",
          yearGroup: "Year 7",
          topic: "",
          questionCount: 0
        }
      });

      expect(response.statusCode).toBe(400);
    } finally {
      await server.close();
    }
  });

  it("maps practice-activity validation errors to 400", async () => {
    const server = await createServer();

    try {
      const response = await server.inject({
        method: "POST",
        url: "/v1/learning-loops/loop_missing/practice-activities",
        payload: {
          kind: "flashcard_set",
          cardCount: 0
        }
      });

      expect(response.statusCode).toBe(400);
    } finally {
      await server.close();
    }
  });

  it("maps master-data validation errors to 400", async () => {
    const server = await createServer();

    try {
      const response = await server.inject({
        method: "POST",
        url: "/v1/master-data",
        payload: {
          sourceName: "",
          items: []
        }
      });

      expect(response.statusCode).toBe(400);
    } finally {
      await server.close();
    }
  });

  it("maps domain errors in the API layer", async () => {
    const controller = {
      execute() {
        return {
          ok: false as const,
          error: {
            code: "POLICY_VIOLATION" as const,
            message: "Policy failed."
          }
        };
      }
    } as unknown as StudyPlanController;
    const server = await createServer({
      studyPlanController: controller
    });

    try {
      const response = await server.inject({
        method: "POST",
        url: "/v1/study-plans",
        payload: validStudyPlanBody
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        code: "POLICY_VIOLATION",
        error: "Policy failed."
      });
    } finally {
      await server.close();
    }
  });

  it("maps assessment domain errors in the API layer", async () => {
    const controller = {
      execute() {
        return {
          ok: false as const,
          error: {
            code: "NOT_FOUND" as const,
            message: "Master data not found."
          }
        };
      }
    } as unknown as InitialAssessmentController;
    const server = await createServer({
      initialAssessmentController: controller
    });

    try {
      const response = await server.inject({
        method: "POST",
        url: "/v1/assessments/initial",
        payload: {
          learnerName: "Year 7 learner",
          yearGroup: "Year 7",
          topic: "fractions",
          questionCount: 2
        }
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({
        code: "NOT_FOUND",
        error: "Master data not found."
      });
    } finally {
      await server.close();
    }
  });

  it("maps master-data controller errors in the API layer", async () => {
    const controller = {
      execute() {
        return {
          ok: false as const,
          error: {
            code: "VALIDATION_ERROR" as const,
            message: "Upload failed."
          }
        };
      }
    } as unknown as MasterDataUploadController;
    const server = await createServer({
      masterDataUploadController: controller
    });

    try {
      const response = await server.inject({
        method: "POST",
        url: "/v1/master-data",
        payload: validMasterDataBody
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        code: "VALIDATION_ERROR",
        error: "Upload failed."
      });
    } finally {
      await server.close();
    }
  });

  it("maps practice-activity domain errors in the API layer", async () => {
    const controller = {
      generate() {
        return {
          ok: false as const,
          error: {
            code: "NOT_FOUND" as const,
            message: "Learning loop missing."
          }
        };
      },
      complete() {
        return {
          ok: true as const,
          value: {}
        };
      },
      list() {
        return {
          ok: true as const,
          value: {}
        };
      }
    } as unknown as PracticeActivityController;
    const server = await createServer({
      practiceActivityController: controller
    });

    try {
      const response = await server.inject({
        method: "POST",
        url: "/v1/learning-loops/loop_missing/practice-activities",
        payload: {
          kind: "flashcard_set",
          cardCount: 2
        }
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({
        code: "NOT_FOUND",
        error: "Learning loop missing."
      });
    } finally {
      await server.close();
    }
  });
});
