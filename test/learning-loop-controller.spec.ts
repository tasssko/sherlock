import { describe, expect, it } from "vitest";
import { InitialAssessmentController } from "../src/modules/assessment/InitialAssessmentController.js";
import { AssessmentAttemptController } from "../src/modules/assessment/AssessmentAttemptController.js";
import { MasterDataUploadController } from "../src/modules/assessment/MasterDataUploadController.js";
import { StudyPlanController } from "../src/modules/planning/StudyPlanController.js";
import { SqliteLearningLoopRepository } from "../src/modules/planning/SqliteLearningLoopRepository.js";
import { PracticeActivityController } from "../src/modules/practice/PracticeActivityController.js";
import { studyDays } from "../src/domain/study/StudySchedule.js";
import { LearningLoopController } from "../src/modules/learning/LearningLoopController.js";
import { LearningLoop } from "../src/domain/learning/LearningLoop.js";
import { LearningLoopBatch } from "../src/domain/learning/LearningLoopBatch.js";
import { MasteryState } from "../src/domain/learning/MasteryState.js";
import { QuestionSeed, QuestionVariant } from "../src/domain/learning/QuestionBank.js";
import { createDomainEventRecorder } from "../src/domain/primitives/Event.js";
import { Workspace } from "../src/domain/primitives/Workspace.js";
import { LearnerWorkspaceKey } from "../src/modules/planning/LearnerWorkspaceKey.js";
import { createLearningLoopRecord } from "../src/modules/planning/LearningLoopRepository.js";

describe("Learning loop flow", () => {
  it("does not resume a superseded learning loop", () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const workspace = Workspace.create({
      title: "Superseded workspace",
      learner: {
        name: "Year 7 learner",
        yearGroup: "Year 7",
        availableMinutesByDay: {}
      },
      activeObjective: "Resume the right loop."
    });
    const events = createDomainEventRecorder(workspace.id);
    const supersededLoop = LearningLoop.rehydrate({
      ...LearningLoop.create(
        {
          workspaceId: workspace.id,
          objective: "Old Coasts loop.",
          topic: "Coasts"
        },
        events
      ).toSnapshot(),
      status: "superseded"
    });
    repository.saveRecord(
      LearnerWorkspaceKey.fromLearner("Year 7 learner", "Year 7"),
      createLearningLoopRecord({
        workspace,
        tasks: [],
        workPlans: [],
        artifacts: [],
        events: [],
        learningLoops: [supersededLoop],
        assessments: [],
        attempts: [],
        evaluations: [],
        knowledgeGaps: [],
        masteryProfiles: [],
        practiceActivities: [],
        activeReviewSessions: [],
        loopBatches: [],
        runtimeConversationBindings: [],
        runtimeTraces: []
      })
    );

    const result = new LearningLoopController(repository).get(supersededLoop.id);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("STATE_CONFLICT");
    expect(result.error.message).toContain("superseded");
  });

  it("normalizes a legacy loop-batching record with no diagnosed gaps into mastery tracking", () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const workspace = Workspace.create({
      title: "Resolved weather workspace",
      learner: {
        name: "Year 7 learner",
        yearGroup: "Year 7",
        availableMinutesByDay: {}
      },
      activeObjective: "Keep Weather secure."
    });
    const events = createDomainEventRecorder(workspace.id);
    const learningLoop = LearningLoop.rehydrate({
      ...LearningLoop.create(
        {
          workspaceId: workspace.id,
          objective: "Build secure understanding in Weather.",
          topic: "Weather"
        },
        events
      ).toSnapshot(),
      phase: "loop-batching",
      status: "active",
      evaluationIds: ["evaluation_weather" as never],
      knowledgeGapIds: []
    });
    const loopBatch = LearningLoopBatch.create({
      learningLoopId: learningLoop.id,
      overview: "Legacy batch that should no longer be shown.",
      targetDurationMinutes: 10,
      units: [
        {
          focus: "Air pressure",
          reason: "Legacy unit",
          objectiveRefs: ["objective_1"],
          sourceRefs: ["weather_ref"],
          shortExplanation: "Legacy explanation.",
          learnerTask: "Explain air pressure.",
          targetKnowledgeGapIds: ["gap_legacy"],
          quickCheckQuestions: [{ prompt: "What is air pressure?" }],
          reviewItems: [{ prompt: "Air pressure", answer: "Weight of air pressing down." }]
        }
      ]
    });
    repository.saveRecord(
      LearnerWorkspaceKey.fromLearner("Year 7 learner", "Year 7"),
      createLearningLoopRecord({
        workspace,
        tasks: [],
        workPlans: [],
        artifacts: [],
        events: [],
        learningLoops: [learningLoop],
        assessments: [],
        attempts: [],
        evaluations: [],
        knowledgeGaps: [],
        masteryProfiles: [],
        practiceActivities: [],
        activeReviewSessions: [],
        loopBatches: [loopBatch],
        runtimeConversationBindings: [],
        runtimeTraces: []
      })
    );

    const result = new LearningLoopController(repository).get(learningLoop.id);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.learningLoop.phase).toBe("mastery-tracking");
    expect(result.value.learningLoop.status).toBe("completed");
    expect(result.value.nextAction.kind).toBe("track-mastery");
    expect(result.value.loopBatch).toBeUndefined();
  });

  it("projects loop quick checks from persisted question variants", () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const workspace = Workspace.create({
      title: "Variant-backed loop workspace",
      learner: {
        name: "Year 7 learner",
        yearGroup: "Year 7",
        availableMinutesByDay: {}
      },
      activeObjective: "Work through a stronger Coasts loop."
    });
    const events = createDomainEventRecorder(workspace.id);
    const learningLoop = LearningLoop.rehydrate({
      ...LearningLoop.create(
        {
          workspaceId: workspace.id,
          objective: "Build secure understanding in Coasts.",
          topic: "Coasts"
        },
        events
      ).toSnapshot(),
      phase: "loop-batching",
      status: "active",
      knowledgeGapIds: ["gap_coasts" as never]
    });
    const loopBatch = LearningLoopBatch.create({
      learningLoopId: learningLoop.id,
      overview: "Persisted batch.",
      targetDurationMinutes: 8,
      units: [
        {
          focus: "Erosion",
          reason: "Focus on a key process.",
          objectiveRefs: ["objective_erosion"],
          sourceRefs: ["coasts_ref_1"],
          shortExplanation: "Waves can erode the coastline over time.",
          learnerTask: "Explain erosion in your own words.",
          targetKnowledgeGapIds: ["gap_coasts"],
          quickCheckQuestions: [{ prompt: "Stale quick-check prompt" }],
          reviewItems: [{ prompt: "Old review prompt", answer: "Erosion wears away rock." }]
        }
      ]
    });
    const unit = loopBatch.toSnapshot().units[0];
    const seed = QuestionSeed.create({
      learningLoopId: learningLoop.id,
      topic: "Coasts",
      focus: "Erosion",
      objectiveRefs: ["objective_erosion"],
      sourceRefs: ["coasts_ref_1"],
      answerModel: "Erosion wears away rock.",
      explanation: "Waves can erode the coastline over time.",
      tags: ["Erosion"]
    });
    const quickCheckVariant = QuestionVariant.create({
      seedId: seed.id,
      learningLoopId: learningLoop.id,
      ownerId: unit.id,
      ownerKind: "loop_quick_check",
      position: 0,
      mode: "multiple_choice",
      prompt: "Which statement best describes coastal erosion?",
      options: [
        { id: "a", text: "It wears away rock." },
        { id: "b", text: "It deposits sediment." }
      ],
      correctOptionIds: ["a"],
      hint: "Think about rock being worn away by waves.",
      sourceFact: "Waves gradually wear away the coastline."
    });
    const reviewVariant = QuestionVariant.create({
      seedId: seed.id,
      learningLoopId: learningLoop.id,
      ownerId: unit.id,
      ownerKind: "loop_review_item",
      position: 0,
      mode: "review",
      prompt: "Recall the precise effect erosion has on the coastline.",
      expectedAnswer: "Erosion wears away rock."
    });

    repository.saveRecord(
      LearnerWorkspaceKey.fromLearner("Year 7 learner", "Year 7"),
      createLearningLoopRecord({
        workspace,
        tasks: [],
        workPlans: [],
        artifacts: [],
        events: [],
        learningLoops: [learningLoop],
        assessments: [],
        attempts: [],
        evaluations: [],
        knowledgeGaps: [],
        masteryProfiles: [],
        practiceActivities: [],
        activeReviewSessions: [],
        loopBatches: [loopBatch],
        questionSeeds: [seed],
        questionVariants: [quickCheckVariant, reviewVariant],
        runtimeConversationBindings: [],
        runtimeTraces: []
      })
    );

    const result = new LearningLoopController(repository).get(learningLoop.id);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.loopBatch?.units[0].quickCheckQuestions[0]).toMatchObject({
      prompt: "Which statement best describes coastal erosion?",
      questionType: "multiple_choice",
      hint: "Think about rock being worn away by waves."
    });
    expect(result.value.loopBatch?.units[0].reviewItems[0]).toMatchObject({
      prompt: "Recall the precise effect erosion has on the coastline.",
      answer: "Erosion wears away rock."
    });
  });

  it("projects mastery from canonical mastery states when no stored mastery profile exists", () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const workspace = Workspace.create({
      title: "Mastery projection workspace",
      learner: {
        name: "Year 7 learner",
        yearGroup: "Year 7",
        availableMinutesByDay: {}
      },
      activeObjective: "Resume Coasts with canonical mastery."
    });
    const events = createDomainEventRecorder(workspace.id);
    const learningLoop = LearningLoop.rehydrate({
      ...LearningLoop.create(
        {
          workspaceId: workspace.id,
          objective: "Build secure understanding in Coasts.",
          topic: "Coasts"
        },
        events
      ).toSnapshot(),
      phase: "mastery-tracking",
      status: "active",
      masteryProfileId: undefined
    });
    const topicMasteryState = MasteryState.create({
      learningLoopId: learningLoop.id,
      topic: "Coasts",
      status: "secure",
      score: 0.91,
      lastReviewedAt: "2026-05-30T12:00:00.000Z",
      nextReviewAt: "2026-06-06T12:00:00.000Z"
    });

    repository.saveRecord(
      LearnerWorkspaceKey.fromLearner("Year 7 learner", "Year 7"),
      createLearningLoopRecord({
        workspace,
        tasks: [],
        workPlans: [],
        artifacts: [],
        events: [],
        learningLoops: [learningLoop],
        assessments: [],
        attempts: [],
        evaluations: [],
        knowledgeGaps: [],
        learnerEvidence: [],
        masteryStates: [topicMasteryState],
        masteryProfiles: [],
        practiceActivities: [],
        activeReviewSessions: [],
        loopBatches: [],
        questionSeeds: [],
        questionVariants: [],
        runtimeConversationBindings: [],
        runtimeTraces: []
      })
    );

    const result = new LearningLoopController(repository).get(learningLoop.id);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.masteryProfile?.topics).toEqual([
      expect.objectContaining({
        topic: "Coasts",
        status: "secure",
        score: 0.91
      })
    ]);
  });

  it("uses active review evidence to refresh gaps, update mastery, and adapt the next study plan", async () => {
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

    const assessment = await assessmentController.execute({
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

    const practice = await practiceController.generate({
      learningLoopId: assessment.value.learningLoop.id,
      kind: "flashcard_set",
      cardCount: 3
    });

    expect(practice.ok).toBe(true);
    if (!practice.ok) {
      return;
    }

    expect(practice.value.practiceActivity.targetKnowledgeGapIds.length).toBeGreaterThan(0);
    expect(
      practice.value.practiceActivity.targetKnowledgeGapIds.every((gapId) =>
        attempt.value.knowledgeGaps.some((gap) => gap.id === gapId)
      )
    ).toBe(true);
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
    expect(completion.value.learningLoop.knowledgeGapIds.length).toBeLessThanOrEqual(1);
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

    const studyPlan = await studyPlanController.execute({
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
    expect(studyPlan.value.knowledgeGaps).toHaveLength(0);
    expect(studyPlan.value.masteryProfile?.topics).toEqual([
      expect.objectContaining({
        topic: "fractions",
        status: "developing"
      })
    ]);
    expect(studyPlan.value.artifact.content.summary).toContain("fractions, forces, French vocabulary");
    expect(studyPlan.value.artifact.content.notes.length).toBeGreaterThan(0);
    expect(studyPlan.value.workPlan.artifactIds).toContain(studyPlan.value.artifact.id);
    expect(studyPlan.value.events.every((event) => event.workspaceId === studyPlan.value.workspace.id)).toBe(
      true
    );
    const studyPlanAdapted = studyPlan.value.events.find((event) => event.type === "study-plan.adapted");
    expect(studyPlanAdapted?.payload).toMatchObject({
      learningLoopId: assessment.value.learningLoop.id,
      workPlanId: studyPlan.value.workPlan.id,
      artifactId: studyPlan.value.artifact.id,
      diagnosedGapCount: 0
    });
  });

  it("rejects assessment items that leak answers from visible study material", async () => {
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

    const result = await assessmentController.execute({
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
