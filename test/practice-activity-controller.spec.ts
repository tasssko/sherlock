import { describe, expect, it } from "vitest";
import { AssessmentAttemptController } from "../src/modules/assessment/AssessmentAttemptController.js";
import { InitialAssessmentController } from "../src/modules/assessment/InitialAssessmentController.js";
import { MasterDataUploadController } from "../src/modules/assessment/MasterDataUploadController.js";
import { LearningLoop } from "../src/domain/learning/LearningLoop.js";
import { SqliteLearningLoopRepository } from "../src/modules/planning/SqliteLearningLoopRepository.js";
import { PracticeActivityController } from "../src/modules/practice/PracticeActivityController.js";
import { FixtureAgentRuntime } from "../src/modules/runtime/FixtureAgentRuntime.js";
import { LearnerWorkspaceKey } from "../src/modules/planning/LearnerWorkspaceKey.js";

describe("PracticeActivityController", () => {
  it("evaluates an assessment attempt using the loop source ids instead of a topic scan", async () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const uploadController = new MasterDataUploadController(repository);
    const assessmentController = new InitialAssessmentController(repository);
    const attemptController = new AssessmentAttemptController(repository);

    await uploadController.execute({
      sourceName: "Coasts Lesson Notes",
      items: [
        {
          topic: "Coasts",
          prompt: "What is erosion?",
          canonicalAnswer: "The wearing away of the coast by the sea.",
          visibleMaterial: "Erosion wears away cliffs and headlands."
        }
      ]
    });

    const assessment = await assessmentController.execute({
      learnerName: "Year 7 learner",
      yearGroup: "Year 7",
      topic: "Coasts",
      questionCount: 1
    });
    expect(assessment.ok).toBe(true);
    if (!assessment.ok) {
      return;
    }

    const alternateSource = repository.registerMasterData({
      sourceName: "Coastal Processes Pack",
      rawSourceContent: "Erosion, transport, and deposition shape coasts.",
      contentType: "text/plain",
      learnerYearGroup: "Year 7",
      userHints: {
        subject: "Geography",
        topic: "Coasts"
      },
      acceptedInterpretation: {
        schema: "MasterDataInterpretationCandidate.v1",
        detectedSubject: "Geography",
        detectedYearGroup: "Year 7",
        mainTopic: "Coasts",
        subtopics: ["Coastal processes"],
        keyPeople: [],
        keyTerms: ["erosion", "transport", "deposition"],
        importantDates: [],
        processes: ["erosion", "transport", "deposition"],
        learnerFacingMaterialSummary:
          "Coasts are shaped by erosion, transport, and deposition.",
        learningObjectives: [
          {
            id: "objective_coasts_processes",
            objective: "Explain how erosion, transport, and deposition shape coasts.",
            sourceRefs: ["coastal_processes_ref"]
          }
        ],
        sourceMap: [
          {
            sourceRef: "coastal_processes_ref",
            excerpt: "Erosion, transport, and deposition shape coasts."
          }
        ],
        items: [
          {
            subject: "Geography",
            yearGroup: "Year 7",
            topic: "Coasts",
            subtopic: "Coastal processes",
            itemType: "fact",
            content: "Erosion, transport, and deposition shape coasts.",
            sourceRef: "coastal_processes_ref"
          }
        ]
      },
      items: [
        {
          topic: "Coastal processes",
          prompt: "Name the three main coastal processes.",
          canonicalAnswer: "Erosion, transport, and deposition.",
          visibleMaterial: "Erosion, transport, and deposition shape coasts."
        }
      ]
    });

    const key = LearnerWorkspaceKey.fromLearner("Year 7 learner", "Year 7");
    const record = repository.findRecord(key);
    expect(record).toBeDefined();
    if (!record) {
      return;
    }

    const updatedLoop = LearningLoop.rehydrate({
      ...assessment.value.learningLoop,
      sourceIds: [alternateSource.source.id]
    });

    repository.saveRecord(key, {
      ...record,
      learningLoops: record.learningLoops.map((candidate) =>
        candidate.id === updatedLoop.id ? updatedLoop : candidate
      )
    });

    const attempt = await attemptController.execute({
      assessmentId: assessment.value.assessment.id,
      responses: assessment.value.assessment.items.map((item) => ({
        itemId: item.id,
        answer: "not sure"
      }))
    });

    expect(attempt.ok).toBe(true);
  });

  it("falls back to the latest accepted interpretation when the bound loop source is legacy", async () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const uploadController = new MasterDataUploadController(repository);
    const assessmentController = new InitialAssessmentController(repository);
    const attemptController = new AssessmentAttemptController(repository);

    const legacySource = repository.registerMasterData({
      sourceName: "Year 7 Geography: Coasts (Legacy)",
      rawSourceContent: "The coastline is where the land meets the sea.",
      contentType: "text/plain",
      items: [
        {
          topic: "Coasts",
          prompt: "What is the coastline?",
          canonicalAnswer: "Where the land meets the sea.",
          visibleMaterial: "The coastline is where the land meets the sea."
        }
      ]
    });

    await uploadController.execute({
      sourceName: "Year 7 Geography: Coasts",
      items: [
        {
          topic: "Coasts",
          prompt: "What is erosion?",
          canonicalAnswer: "The wearing away of the coast by the sea.",
          visibleMaterial: "Erosion wears away cliffs and headlands."
        }
      ]
    });

    const assessment = await assessmentController.execute({
      learnerName: "Year 7 learner",
      yearGroup: "Year 7",
      topic: "Coasts",
      questionCount: 1
    });
    expect(assessment.ok).toBe(true);
    if (!assessment.ok) {
      return;
    }

    const key = LearnerWorkspaceKey.fromLearner("Year 7 learner", "Year 7");
    const record = repository.findRecord(key);
    expect(record).toBeDefined();
    if (!record) {
      return;
    }

    const reboundLoop = LearningLoop.rehydrate({
      ...assessment.value.learningLoop,
      sourceIds: [legacySource.source.id]
    });

    repository.saveRecord(key, {
      ...record,
      learningLoops: record.learningLoops.map((candidate) =>
        candidate.id === reboundLoop.id ? reboundLoop : candidate
      )
    });

    const attempt = await attemptController.execute({
      assessmentId: assessment.value.assessment.id,
      responses: assessment.value.assessment.items.map((item) => ({
        itemId: item.id,
        answer: "not sure"
      }))
    });

    expect(attempt.ok).toBe(true);
  });

  it("accepts a practice candidate that returns top-level cards instead of flashcardSet", async () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const uploadController = new MasterDataUploadController(repository);
    const assessmentController = new InitialAssessmentController(repository);
    const attemptController = new AssessmentAttemptController(repository);
    const practiceController = new PracticeActivityController(
      repository,
      undefined,
      undefined,
      {
        ...new FixtureAgentRuntime(),
        async generatePracticeActivity() {
          return {
            ok: true as const,
            value: {
              instructions: "Recall before flipping each card.",
              cards: [
                {
                  id: "card_1",
                  front: "What is 6/8 simplified?",
                  back: "three quarters",
                  topic: "fractions",
                  knowledgeGapId: "gap_runtime",
                  learningObjective: "Simplify common fractions.",
                  sourceMasterDataItemId: "master_item_runtime",
                  sourceVisibleSentence: "Fractions can describe equal parts of a whole."
                }
              ]
            } as never
          };
        }
      }
    );

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

    const assessment = await assessmentController.execute({
      learnerName: "Year 7 learner",
      yearGroup: "Year 7",
      topic: "fractions",
      questionCount: 1
    });
    expect(assessment.ok).toBe(true);
    if (!assessment.ok) {
      return;
    }

    const attempt = await attemptController.execute({
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

    const generated = await practiceController.generate({
      learningLoopId: assessment.value.learningLoop.id,
      kind: "flashcard_set",
      cardCount: 1
    });

    expect(generated.ok).toBe(true);
    if (!generated.ok) {
      return;
    }

    expect(generated.value.practiceActivity.flashcardSet.instructions).toBe(
      "Recall before flipping each card."
    );
    expect(generated.value.practiceActivity.flashcardSet.cards).toHaveLength(1);
  });

  it("normalizes relay-style prompt and answer card fields", async () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const uploadController = new MasterDataUploadController(repository);
    const assessmentController = new InitialAssessmentController(repository);
    const attemptController = new AssessmentAttemptController(repository);
    const practiceController = new PracticeActivityController(
      repository,
      undefined,
      undefined,
      {
        ...new FixtureAgentRuntime(),
        async generatePracticeActivity() {
          return {
            ok: true as const,
            value: {
              cards: [
                {
                  id: "card_prompt_answer",
                  prompt: "What is 6/8 simplified?",
                  answer: "three quarters",
                  objective: "Simplify common fractions.",
                  sourceRef: "Coasts > nope",
                  sourceSentence: "Fractions can describe equal parts of a whole.",
                  topic: "fractions"
                }
              ]
            } as never
          };
        }
      }
    );

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

    const assessment = await assessmentController.execute({
      learnerName: "Year 7 learner",
      yearGroup: "Year 7",
      topic: "fractions",
      questionCount: 1
    });
    expect(assessment.ok).toBe(true);
    if (!assessment.ok) {
      return;
    }

    const attempt = await attemptController.execute({
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

    const generated = await practiceController.generate({
      learningLoopId: assessment.value.learningLoop.id,
      kind: "flashcard_set",
      cardCount: 1
    });

    expect(generated.ok).toBe(true);
    if (!generated.ok) {
      return;
    }

    const card = generated.value.practiceActivity.flashcardSet.cards[0];
    expect(card).toMatchObject({
      front: "What is 6/8 simplified?",
      back: "three quarters",
      learningObjective: "Simplify common fractions.",
      topic: "fractions"
    });
    expect(card?.sourceMasterDataItemId).toEqual(expect.any(String));
    expect(card?.knowledgeGapId).toEqual(expect.any(String));
  });

  it("rejects a malformed practice candidate instead of throwing", async () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const uploadController = new MasterDataUploadController(repository);
    const assessmentController = new InitialAssessmentController(repository);
    const attemptController = new AssessmentAttemptController(repository);
    const practiceController = new PracticeActivityController(
      repository,
      undefined,
      undefined,
      {
        ...new FixtureAgentRuntime(),
        async generatePracticeActivity() {
          return {
            ok: true as const,
            value: {
              instructions: "Broken payload without cards."
            } as never
          };
        }
      }
    );

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

    const assessment = await assessmentController.execute({
      learnerName: "Year 7 learner",
      yearGroup: "Year 7",
      topic: "fractions",
      questionCount: 1
    });
    expect(assessment.ok).toBe(true);
    if (!assessment.ok) {
      return;
    }

    const attempt = await attemptController.execute({
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

    const generated = await practiceController.generate({
      learningLoopId: assessment.value.learningLoop.id,
      kind: "flashcard_set",
      cardCount: 1
    });

    expect(generated.ok).toBe(false);
    if (generated.ok) {
      return;
    }

    expect(generated.error.code).toBe("VALIDATION_ERROR");
    expect(generated.error.message).toContain("flashcard set");
  });

  it("cannot generate practice before the learning loop is diagnosed", async () => {
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

    const assessment = await assessmentController.execute({
      learnerName: "Year 7 learner",
      yearGroup: "Year 7",
      topic: "fractions",
      questionCount: 1
    });
    expect(assessment.ok).toBe(true);
    if (!assessment.ok) {
      return;
    }

    const result = await practiceController.generate({
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

  it("treats a fully secure assessment as mastery tracking instead of loop batching", async () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const uploadController = new MasterDataUploadController(repository);
    const assessmentController = new InitialAssessmentController(repository);
    const attemptController = new AssessmentAttemptController(repository);
    const practiceController = new PracticeActivityController(repository);

    uploadController.execute({
      sourceName: "Year 7 Weather Notes",
      items: [
        {
          topic: "Weather",
          prompt: "What is air pressure?",
          canonicalAnswer: "The weight of air pressing down.",
          visibleMaterial: "Air pressure is the weight of the air pressing down."
        }
      ]
    });

    const assessment = await assessmentController.execute({
      learnerName: "Year 7 learner",
      yearGroup: "Year 7",
      topic: "Weather",
      questionCount: 1
    });
    expect(assessment.ok).toBe(true);
    if (!assessment.ok) {
      return;
    }

    const attempt = await attemptController.execute({
      assessmentId: assessment.value.assessment.id,
      responses: assessment.value.assessment.items.map((item) => ({
        itemId: item.id,
        answer: item.canonicalAnswer
      }))
    });
    expect(attempt.ok).toBe(true);
    if (!attempt.ok) {
      return;
    }

    expect(attempt.value.phase).toBe("mastery-tracking");
    expect(attempt.value.nextAction.kind).toBe("track-mastery");
    expect(attempt.value.loopBatch).toBeUndefined();
    expect(attempt.value.knowledgeGaps).toEqual([]);

    const result = await practiceController.generate({
      learningLoopId: assessment.value.learningLoop.id,
      kind: "flashcard_set",
      cardCount: 1
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("VALIDATION_ERROR");
    expect(result.error.message).toContain("already secure");
  });

  it("records active review sessions, remaining gaps, and mastery only from review evidence", async () => {
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

    const assessment = await assessmentController.execute({
      learnerName: "Year 7 learner",
      yearGroup: "Year 7",
      topic: "fractions",
      questionCount: 2
    });
    expect(assessment.ok).toBe(true);
    if (!assessment.ok) {
      return;
    }

    const attempt = await attemptController.execute({
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

    const generated = await practiceController.generate({
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

  it("changes the next review interval based on review performance", async () => {
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

    const assessment = await assessmentController.execute({
      learnerName: "Year 7 learner",
      yearGroup: "Year 7",
      topic: "fractions",
      questionCount: 1
    });
    expect(assessment.ok).toBe(true);
    if (!assessment.ok) {
      return;
    }

    const attempt = await attemptController.execute({
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

    const generated = await practiceController.generate({
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

  it("rejects completion without item-level evidence for every practice item", async () => {
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

    const assessment = await assessmentController.execute({
      learnerName: "Year 7 learner",
      yearGroup: "Year 7",
      topic: "fractions",
      questionCount: 2
    });
    expect(assessment.ok).toBe(true);
    if (!assessment.ok) {
      return;
    }

    const attempt = await attemptController.execute({
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

    const generated = await practiceController.generate({
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
