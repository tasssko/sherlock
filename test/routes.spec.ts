import { describe, expect, it } from "vitest";
import { createServer } from "../src/app/api/createServer.js";
import type { InitialAssessmentController } from "../src/modules/assessment/InitialAssessmentController.js";
import type { MasterDataUploadController } from "../src/modules/assessment/MasterDataUploadController.js";
import type { StudyPlanController } from "../src/modules/planning/StudyPlanController.js";

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

  it("supports the shared learning-loop flow across upload, assessment, attempt, and study-plan routes", async () => {
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
      expect(studyPlanResponse.json().learningLoop.id).toBe(assessmentPayload.learningLoop.id);
      expect(studyPlanResponse.json().knowledgeGaps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            topic: "fractions"
          })
        ])
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
});
