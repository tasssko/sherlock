import { describe, expect, it } from "vitest";
import { InitialAssessmentController } from "../src/modules/assessment/InitialAssessmentController.js";
import { AssessmentAttemptController } from "../src/modules/assessment/AssessmentAttemptController.js";
import { MasterDataUploadController } from "../src/modules/assessment/MasterDataUploadController.js";
import { StudyPlanController } from "../src/modules/planning/StudyPlanController.js";
import { SqliteLearningLoopRepository } from "../src/modules/planning/SqliteLearningLoopRepository.js";
import { PracticeActivityController } from "../src/modules/practice/PracticeActivityController.js";
import { studyDays } from "../src/domain/study/StudySchedule.js";

describe("Learning loop flow", () => {
  it("uses active review evidence to refresh gaps, update mastery, and adapt the next study plan", () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const uploadController = new MasterDataUploadController(repository);
    const assessmentController = new InitialAssessmentController(repository);
    const attemptController = new AssessmentAttemptController(repository);
    const practiceController = new PracticeActivityController(repository);
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
        "initial-assessment.generated",
        "artifact.generated"
      ])
    );
    const initialAssessmentGenerated = assessment.value.events.find(
      (event) => event.type === "initial-assessment.generated"
    );
    expect(initialAssessmentGenerated?.payload).toMatchObject({
      learningLoopId: assessment.value.learningLoop.id,
      assessmentId: assessment.value.assessment.id,
      artifactId: assessment.value.artifact.id
    });
    const initialAssessmentEventTypes = assessment.value.events.map((event) => event.type);
    expect(initialAssessmentEventTypes.indexOf("learning-loop.created")).toBeLessThan(
      initialAssessmentEventTypes.indexOf("initial-assessment.generated")
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
    expect(attempt.value.masteryProfile).toBeUndefined();
    expect(attempt.value.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "attempt.created",
        "evaluation.created",
        "assessment-attempt.submitted",
        "assessment.evaluated",
        "knowledge-gaps.identified"
      ])
    );
    const attemptSubmitted = attempt.value.events.find(
      (event) => event.type === "assessment-attempt.submitted"
    );
    const assessmentEvaluated = attempt.value.events.find(
      (event) => event.type === "assessment.evaluated"
    );
    const knowledgeGapsIdentified = attempt.value.events.find(
      (event) => event.type === "knowledge-gaps.identified"
    );
    expect(attemptSubmitted?.payload).toMatchObject({
      learningLoopId: assessment.value.learningLoop.id,
      assessmentId: assessment.value.assessment.id,
      attemptId: attempt.value.attempt.id
    });
    expect(assessmentEvaluated?.payload).toMatchObject({
      learningLoopId: assessment.value.learningLoop.id,
      assessmentId: assessment.value.assessment.id,
      evaluationId: attempt.value.evaluation.id
    });
    expect(knowledgeGapsIdentified?.payload).toMatchObject({
      learningLoopId: assessment.value.learningLoop.id
    });
    const attemptEventTypes = attempt.value.events.map((event) => event.type);
    expect(attemptEventTypes.indexOf("assessment-attempt.submitted")).toBeLessThan(
      attemptEventTypes.indexOf("assessment.evaluated")
    );
    expect(attemptEventTypes.indexOf("assessment.evaluated")).toBeLessThan(
      attemptEventTypes.indexOf("knowledge-gaps.identified")
    );

    const practice = practiceController.generate({
      learningLoopId: assessment.value.learningLoop.id,
      kind: "flashcard_set",
      cardCount: 3
    });

    expect(practice.ok).toBe(true);
    if (!practice.ok) {
      return;
    }

    expect(practice.value.practiceActivity.targetKnowledgeGapIds).toEqual(
      expect.arrayContaining(attempt.value.knowledgeGaps.map((gap) => gap.id))
    );
    expect(practice.value.practiceActivity.flashcardSet.cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceMasterDataItemId: expect.any(String),
          knowledgeGapId: expect.any(String),
          sourceVisibleSentence: expect.any(String)
        })
      ])
    );
    const practiceGenerated = practice.value.events.find(
      (event) => event.type === "practice-activity.generated"
    );
    expect(practiceGenerated?.payload).toMatchObject({
      learningLoopId: assessment.value.learningLoop.id,
      practiceActivityId: practice.value.practiceActivity.id
    });
    const practiceEventTypes = practice.value.events.map((event) => event.type);
    expect(practiceEventTypes.indexOf("agent.invoked")).toBeLessThan(
      practiceEventTypes.indexOf("practice-activity.generated")
    );

    const completion = practiceController.complete({
      practiceActivityId: practice.value.practiceActivity.id,
      responses: practice.value.practiceActivity.flashcardSet.cards.map((card, index) => ({
        practiceItemId: card.id,
        responseText: index === 0 ? card.back : "wrong answer",
        confidence: index === 0 ? "high" as const : "low" as const
      }))
    });

    expect(completion.ok).toBe(true);
    if (!completion.ok) {
      return;
    }

    expect(completion.value.activeReviewSession.itemResults).toHaveLength(3);
    expect(completion.value.practiceActivity.reviewSessionIds).toHaveLength(1);
    expect(completion.value.learningLoop.activeReviewSessionIds).toHaveLength(1);
    expect(completion.value.learningLoop.knowledgeGapIds).toHaveLength(2);
    expect(completion.value.masteryProfile.topics).toEqual([
      expect.objectContaining({
        topic: "fractions",
        status: "developing"
      })
    ]);
    const practiceCompleted = completion.value.events.find(
      (event) => event.type === "practice-activity.completed"
    );
    expect(practiceCompleted?.payload).toMatchObject({
      learningLoopId: assessment.value.learningLoop.id,
      practiceActivityId: practice.value.practiceActivity.id,
      activeReviewSessionId: completion.value.activeReviewSession.id
    });
    const completionEventTypes = completion.value.events.map((event) => event.type);
    expect(completionEventTypes.indexOf("practice-activity.completed")).toBeLessThan(
      completionEventTypes.indexOf("learning-loop.mastery-profile-updated")
    );
    expect(completion.value.activeReviewSession.reviewIntervalHours).toBe(12);

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
    expect(studyPlan.value.knowledgeGaps).toHaveLength(2);
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
    const studyPlanAdapted = studyPlan.value.events.find((event) => event.type === "study-plan.adapted");
    expect(studyPlanAdapted?.payload).toMatchObject({
      learningLoopId: assessment.value.learningLoop.id,
      workPlanId: studyPlan.value.workPlan.id,
      artifactId: studyPlan.value.artifact.id,
      diagnosedGapCount: 2
    });
  });

  it("rejects assessment items that leak answers from visible study material", () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
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
