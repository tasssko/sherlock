import { describe, expect, it } from "vitest";
import { AssessmentAttemptController } from "../src/modules/assessment/AssessmentAttemptController.js";
import { InitialAssessmentController } from "../src/modules/assessment/InitialAssessmentController.js";
import { MasterDataUploadController } from "../src/modules/assessment/MasterDataUploadController.js";
import { SqliteLearningLoopRepository } from "../src/modules/planning/SqliteLearningLoopRepository.js";
import { PracticeActivityController } from "../src/modules/practice/PracticeActivityController.js";

describe("PracticeActivityController", () => {
  it("cannot generate practice before the learning loop is diagnosed", () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const uploadController = new MasterDataUploadController(repository);
    const assessmentController = new InitialAssessmentController(repository);
    const practiceController = new PracticeActivityController(repository);

    uploadController.execute({
      sourceName: "Year 7 Fractions Bank",
      items: [
        {
          topic: "fractions",
          prompt: "Simplify 6/8.",
          canonicalAnswer: "three quarters",
          visibleMaterial: "Fractions can describe equal parts of a whole."
        }
      ]
    });

    const assessment = assessmentController.execute({
      learnerName: "Year 7 learner",
      yearGroup: "Year 7",
      topic: "fractions",
      questionCount: 1
    });
    expect(assessment.ok).toBe(true);
    if (!assessment.ok) {
      return;
    }

    const result = practiceController.generate({
      learningLoopId: assessment.value.learningLoop.id,
      kind: "flashcard_set",
      cardCount: 1
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("VALIDATION_ERROR");
    expect(result.error.message).toContain("must be diagnosed");
  });

  it("records active review sessions, remaining gaps, and mastery only from review evidence", () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const uploadController = new MasterDataUploadController(repository);
    const assessmentController = new InitialAssessmentController(repository);
    const attemptController = new AssessmentAttemptController(repository);
    const practiceController = new PracticeActivityController(repository);

    uploadController.execute({
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
    });

    const assessment = assessmentController.execute({
      learnerName: "Year 7 learner",
      yearGroup: "Year 7",
      topic: "fractions",
      questionCount: 2
    });
    expect(assessment.ok).toBe(true);
    if (!assessment.ok) {
      return;
    }

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
    expect(attempt.value.masteryProfile).toBeUndefined();

    const generated = practiceController.generate({
      learningLoopId: assessment.value.learningLoop.id,
      kind: "flashcard_set",
      cardCount: 2
    });
    expect(generated.ok).toBe(true);
    if (!generated.ok) {
      return;
    }

    const completion = practiceController.complete({
      practiceActivityId: generated.value.practiceActivity.id,
      responses: generated.value.practiceActivity.flashcardSet.cards.map((card, index) => ({
        practiceItemId: card.id,
        responseText: index === 0 ? card.back : "wrong answer",
        confidence: index === 0 ? "high" : "low"
      }))
    });

    expect(completion.ok).toBe(true);
    if (!completion.ok) {
      return;
    }

    expect(completion.value.activeReviewSession.itemResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceMasterDataItemId: expect.any(String),
          knowledgeGapId: expect.any(String),
          responseText: expect.any(String),
          practiceItemId: expect.any(String)
        })
      ])
    );
    expect(completion.value.practiceActivity.reviewSessionIds).toHaveLength(1);
    expect(completion.value.learningLoop.knowledgeGapIds).toHaveLength(1);
    expect(completion.value.masteryProfile.topics).toEqual([
      expect.objectContaining({
        topic: "fractions",
        status: "developing"
      })
    ]);
    expect(completion.value.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "practice-activity.completed",
        "learning-loop.mastery-profile-updated"
      ])
    );
  });

  it("changes the next review interval based on review performance", () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const uploadController = new MasterDataUploadController(repository);
    const assessmentController = new InitialAssessmentController(repository);
    const attemptController = new AssessmentAttemptController(repository);
    const practiceController = new PracticeActivityController(repository);

    uploadController.execute({
      sourceName: "Year 7 Fractions Bank",
      items: [
        {
          topic: "fractions",
          prompt: "Simplify 6/8.",
          canonicalAnswer: "three quarters",
          visibleMaterial: "Fractions can describe equal parts of a whole."
        }
      ]
    });

    const assessment = assessmentController.execute({
      learnerName: "Year 7 learner",
      yearGroup: "Year 7",
      topic: "fractions",
      questionCount: 1
    });
    expect(assessment.ok).toBe(true);
    if (!assessment.ok) {
      return;
    }

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

    const generated = practiceController.generate({
      learningLoopId: assessment.value.learningLoop.id,
      kind: "flashcard_set",
      cardCount: 1
    });
    expect(generated.ok).toBe(true);
    if (!generated.ok) {
      return;
    }

    const firstCompletion = practiceController.complete({
      practiceActivityId: generated.value.practiceActivity.id,
      responses: generated.value.practiceActivity.flashcardSet.cards.map((card) => ({
        practiceItemId: card.id,
        responseText: "wrong answer",
        confidence: "low" as const
      }))
    });
    expect(firstCompletion.ok).toBe(true);
    if (!firstCompletion.ok) {
      return;
    }

    expect(firstCompletion.value.activeReviewSession.reviewIntervalHours).toBe(12);
    expect(firstCompletion.value.practiceActivity.reviewIntervalHours).toBe(12);

    const secondCompletion = practiceController.complete({
      practiceActivityId: generated.value.practiceActivity.id,
      responses: generated.value.practiceActivity.flashcardSet.cards.map((card) => ({
        practiceItemId: card.id,
        responseText: card.back,
        confidence: "high" as const
      }))
    });
    expect(secondCompletion.ok).toBe(true);
    if (!secondCompletion.ok) {
      return;
    }

    expect(secondCompletion.value.activeReviewSession.reviewIntervalHours).toBe(96);
    expect(secondCompletion.value.practiceActivity.reviewSessionIds).toHaveLength(2);
    expect(secondCompletion.value.practiceActivity.nextReviewAt).toBe(
      secondCompletion.value.activeReviewSession.nextReviewAt
    );
  });

  it("rejects completion without item-level evidence for every practice item", () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const uploadController = new MasterDataUploadController(repository);
    const assessmentController = new InitialAssessmentController(repository);
    const attemptController = new AssessmentAttemptController(repository);
    const practiceController = new PracticeActivityController(repository);

    uploadController.execute({
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
    });

    const assessment = assessmentController.execute({
      learnerName: "Year 7 learner",
      yearGroup: "Year 7",
      topic: "fractions",
      questionCount: 2
    });
    expect(assessment.ok).toBe(true);
    if (!assessment.ok) {
      return;
    }

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

    const generated = practiceController.generate({
      learningLoopId: assessment.value.learningLoop.id,
      kind: "flashcard_set",
      cardCount: 2
    });
    expect(generated.ok).toBe(true);
    if (!generated.ok) {
      return;
    }

    const completion = practiceController.complete({
      practiceActivityId: generated.value.practiceActivity.id,
      responses: [
        {
          practiceItemId: generated.value.practiceActivity.flashcardSet.cards[0]?.id ?? "",
          responseText: "three quarters",
          confidence: "high"
        }
      ]
    });

    expect(completion.ok).toBe(false);
    if (completion.ok) {
      return;
    }

    expect(completion.error.code).toBe("VALIDATION_ERROR");
    expect(completion.error.message).toContain("every practice item");

    const stored = repository.findRecordByPracticeActivityId(generated.value.practiceActivity.id as never);
    expect(stored?.record.activeReviewSessions).toHaveLength(0);
    expect(stored?.record.masteryProfiles).toHaveLength(0);
  });
});
