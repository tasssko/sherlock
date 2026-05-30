import { describe, expect, it } from "vitest";
import { InitialAssessmentController } from "../src/modules/assessment/InitialAssessmentController.js";
import { AssessmentAttemptController } from "../src/modules/assessment/AssessmentAttemptController.js";
import { MasterDataUploadController } from "../src/modules/assessment/MasterDataUploadController.js";
import { StudyPlanController } from "../src/modules/planning/StudyPlanController.js";
import { SqliteStudyPlanRepository } from "../src/modules/planning/StudyPlanRepository.js";
import { studyDays } from "../src/domain/study/StudySchedule.js";

describe("Learning loop flow", () => {
  it("starts with an initial assessment, records attempts, diagnoses gaps, and tailors the study plan", () => {
    const repository = new SqliteStudyPlanRepository(":memory:");
    const uploadController = new MasterDataUploadController(repository);
    const assessmentController = new InitialAssessmentController(repository);
    const attemptController = new AssessmentAttemptController(repository);
    const studyPlanController = new StudyPlanController(repository);

    const upload = uploadController.execute({
      sourceName: "Year 7 Fractions Bank",
      items: [
        {
          topic: "fractions",
          prompt: "Simplify 6/8.",
          canonicalAnswer: "three quarters",
          visibleMaterial: "Fractions can describe equal parts of a whole.",
          keywords: ["simplify", "equivalent fractions"]
        },
        {
          topic: "fractions",
          prompt: "Which is larger: 2/3 or 3/5?",
          canonicalAnswer: "two thirds",
          visibleMaterial: "Compare fractions by finding a common denominator or a decimal.",
          keywords: ["compare", "fractions"]
        },
        {
          topic: "fractions",
          prompt: "Explain what makes fractions equivalent.",
          canonicalAnswer: "same value",
          visibleMaterial: "Equivalent fractions can look different while still representing an equal quantity.",
          keywords: ["equivalent", "same value"]
        }
      ]
    });

    expect(upload.ok).toBe(true);
    if (!upload.ok) {
      return;
    }

    const assessment = assessmentController.execute({
      learnerName: "Year 7 learner",
      yearGroup: "Year 7",
      topic: "fractions",
      questionCount: 3
    });

    expect(assessment.ok).toBe(true);
    if (!assessment.ok) {
      return;
    }

    expect(assessment.value.learningLoop.phase).toBe("diagnosis");
    expect(assessment.value.learningLoop.assessmentIds).toEqual([assessment.value.assessment.id]);
    expect(assessment.value.artifact.type).toBe("assessment");
    expect(assessment.value.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "learning-loop.created",
        "assessment.created",
        "assessment.artifact-attached",
        "learning-loop.assessment-attached",
        "artifact.generated"
      ])
    );

    const attempt = attemptController.execute({
      assessmentId: assessment.value.assessment.id,
      responses: assessment.value.assessment.items.map((item) => ({
        itemId: item.id,
        answer: "incorrect response"
      }))
    });

    expect(attempt.ok).toBe(true);
    if (!attempt.ok) {
      return;
    }

    expect(attempt.value.learningLoop.evaluationIds).toHaveLength(1);
    expect(attempt.value.knowledgeGaps).toHaveLength(3);
    expect(attempt.value.masteryProfile.topics).toEqual([
      expect.objectContaining({
        topic: "fractions",
        status: "developing"
      })
    ]);
    expect(attempt.value.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "attempt.created",
        "evaluation.created",
        "learning-loop.attempt-recorded",
        "learning-loop.evaluation-recorded",
        "learning-loop.knowledge-gap-recorded",
        "learning-loop.mastery-profile-updated"
      ])
    );

    const studyPlan = studyPlanController.execute({
      learnerName: "Year 7 learner",
      yearGroup: "Year 7",
      objective: "Build a weekly plan for fractions, forces, and French vocabulary.",
      focusTopics: ["fractions", "forces", "French vocabulary"],
      availableMinutesByDay: Object.fromEntries(
        studyDays.map((day) => [day, day === "Saturday" ? 60 : day === "Sunday" ? 0 : 30])
      ) as Record<(typeof studyDays)[number], number>
    });

    expect(studyPlan.ok).toBe(true);
    if (!studyPlan.ok) {
      return;
    }

    expect(studyPlan.value.learningLoop.id).toBe(assessment.value.learningLoop.id);
    expect(studyPlan.value.knowledgeGaps).toHaveLength(3);
    expect(studyPlan.value.masteryProfile?.topics).toEqual([
      expect.objectContaining({
        topic: "fractions",
        status: "developing"
      })
    ]);
    expect(studyPlan.value.artifact.content.summary).toContain("closing gaps");
    expect(studyPlan.value.artifact.content.notes.join(" ")).toContain("diagnosed gap");
    expect(studyPlan.value.workPlan.artifactIds).toContain(studyPlan.value.artifact.id);
    expect(studyPlan.value.events.every((event) => event.workspaceId === studyPlan.value.workspace.id)).toBe(
      true
    );
  });

  it("rejects assessment items that leak answers from visible study material", () => {
    const repository = new SqliteStudyPlanRepository(":memory:");
    const uploadController = new MasterDataUploadController(repository);
    const assessmentController = new InitialAssessmentController(repository);

    uploadController.execute({
      sourceName: "Leaky Fractions Bank",
      items: [
        {
          topic: "fractions",
          prompt: "What is 1/2 as a word?",
          canonicalAnswer: "one half",
          visibleMaterial: "The phrase one half means one out of two equal parts."
        }
      ]
    });

    const result = assessmentController.execute({
      learnerName: "Year 7 learner",
      yearGroup: "Year 7",
      topic: "fractions",
      questionCount: 1
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("VALIDATION_ERROR");
    expect(result.error.message).toContain("leaks the answer verbatim");
  });
});
