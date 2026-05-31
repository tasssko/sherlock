import { describe, expect, it } from "vitest";
import { InitialAssessmentController } from "../src/modules/assessment/InitialAssessmentController.js";
import { AssessmentAttemptController } from "../src/modules/assessment/AssessmentAttemptController.js";
import { MasterDataUploadController } from "../src/modules/assessment/MasterDataUploadController.js";
import { StudyPlanController } from "../src/modules/planning/StudyPlanController.js";
import { SqliteLearningLoopRepository } from "../src/modules/planning/SqliteLearningLoopRepository.js";
import { PracticeActivityController } from "../src/modules/practice/PracticeActivityController.js";
import { studyDays } from "../src/domain/study/StudySchedule.js";
import { LearningLoopController } from "../src/modules/learning/LearningLoopController.js";
import { LearningLoopProjector } from "../src/modules/learning/LearningLoopProjector.js";
import { LearningLoop, MasteryProfile } from "../src/domain/learning/LearningLoop.js";
import { LearningLoopBatch } from "../src/domain/learning/LearningLoopBatch.js";
import { LoopUnit } from "../src/domain/learning/LoopUnit.js";
import { MasteryState } from "../src/domain/learning/MasteryState.js";
import { PracticeActivity } from "../src/domain/learning/PracticeActivity.js";
import { QuestionSeed, QuestionVariant } from "../src/domain/learning/QuestionBank.js";
import { createDomainEventRecorder } from "../src/domain/primitives/Event.js";
import { Workspace } from "../src/domain/primitives/Workspace.js";
import { LearnerWorkspaceKey } from "../src/modules/planning/LearnerWorkspaceKey.js";
import { createLearningLoopRecord } from "../src/modules/planning/LearningLoopRepository.js";
import { LearnerEvidence } from "../src/domain/learning/LearnerEvidence.js";
import {
  deriveCanonicalLoopStructure
} from "../src/modules/questions/QuestionBankLoopAdapter.js";

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
    const canonicalLoopStructure = deriveCanonicalLoopStructure({
      learningLoopId: learningLoop.id,
      loopBatch: loopBatch.toSnapshot(),
      questionVariants: [quickCheckVariant, reviewVariant]
    });
    const expectedProjection = new LearningLoopProjector().project({
      workspace,
      learningLoop,
      currentAssessment: undefined,
      assessmentArtifact: undefined,
      latestAttempt: undefined,
      latestEvaluation: undefined,
      knowledgeGaps: [],
      masteryProfile: undefined,
      studyPlan: undefined,
      loopBatch,
      loopUnits: canonicalLoopStructure.loopUnits,
      loopUnitQuestionAssignments: canonicalLoopStructure.loopUnitQuestionAssignments,
      questionVariants: [quickCheckVariant, reviewVariant],
      practiceActivities: [],
      currentPracticeActivity: undefined,
      latestActiveReviewSession: undefined,
      events: []
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
        loopUnits: canonicalLoopStructure.loopUnits,
        loopUnitQuestionAssignments: canonicalLoopStructure.loopUnitQuestionAssignments,
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

    expect(result.value).toEqual(expectedProjection);
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

  it("keeps projected loop output stable when compatibility batch prompts are stale but canonical state is valid", () => {
    const buildFixture = (learnerName: string, stalePrompt: string, staleReview: string, staleAnswer: string) => {
      const workspace = Workspace.create({
        title: `${learnerName} workspace`,
        learner: {
          name: learnerName,
          yearGroup: "Year 7",
          availableMinutesByDay: {}
        },
        activeObjective: "Project the same canonical loop."
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
        overview: "Compatibility wrapper stays the same.",
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
            quickCheckQuestions: [{ prompt: stalePrompt }],
            reviewItems: [{ prompt: staleReview, answer: staleAnswer }]
          }
        ]
      });
      const unit = loopBatch.toSnapshot().units[0]!;
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
      const canonicalLoopStructure = deriveCanonicalLoopStructure({
        learningLoopId: learningLoop.id,
        loopBatch: loopBatch.toSnapshot(),
        questionVariants: [quickCheckVariant, reviewVariant]
      });

      return {
        learnerKey: LearnerWorkspaceKey.fromLearner(learnerName, "Year 7"),
        workspace,
        learningLoop,
        loopBatch,
        seed,
        quickCheckVariant,
        reviewVariant,
        canonicalLoopStructure
      };
    };

    const freshRepository = new SqliteLearningLoopRepository(":memory:");
    const staleRepository = new SqliteLearningLoopRepository(":memory:");
    const freshFixture = buildFixture(
      "Fresh learner",
      "Fresh stale prompt",
      "Fresh stale review",
      "Fresh stale answer"
    );
    const staleFixture = buildFixture(
      "Stale learner",
      "Very stale prompt",
      "Very stale review",
      "Very stale answer"
    );

    for (const [repository, fixture] of [
      [freshRepository, freshFixture] as const,
      [staleRepository, staleFixture] as const
    ]) {
      repository.saveRecord(
        fixture.learnerKey,
        createLearningLoopRecord({
          workspace: fixture.workspace,
          tasks: [],
          workPlans: [],
          artifacts: [],
          events: [],
          learningLoops: [fixture.learningLoop],
          assessments: [],
          attempts: [],
          evaluations: [],
          knowledgeGaps: [],
          masteryProfiles: [],
          practiceActivities: [],
          activeReviewSessions: [],
          learnerEvidence: [],
          masteryStates: [],
          loopBatches: [fixture.loopBatch],
          loopUnits: fixture.canonicalLoopStructure.loopUnits,
          loopUnitQuestionAssignments: fixture.canonicalLoopStructure.loopUnitQuestionAssignments,
          questionSeeds: [fixture.seed],
          questionVariants: [fixture.quickCheckVariant, fixture.reviewVariant],
          runtimeConversationBindings: [],
          runtimeTraces: []
        })
      );
    }

    const fresh = new LearningLoopController(freshRepository).get(freshFixture.learningLoop.id);
    const stale = new LearningLoopController(staleRepository).get(staleFixture.learningLoop.id);

    expect(fresh.ok).toBe(true);
    expect(stale.ok).toBe(true);
    if (!fresh.ok || !stale.ok) {
      return;
    }

    expect(stale.value.loopBatch).toMatchObject({
      overview: fresh.value.loopBatch?.overview,
      targetDurationMinutes: fresh.value.loopBatch?.targetDurationMinutes,
      units: fresh.value.loopBatch?.units.map((unit) => ({
        focus: unit.focus,
        reason: unit.reason,
        objectiveRefs: unit.objectiveRefs,
        sourceRefs: unit.sourceRefs,
        shortExplanation: unit.shortExplanation,
        learnerTask: unit.learnerTask,
        targetKnowledgeGapIds: unit.targetKnowledgeGapIds,
        state: unit.state,
        quickCheckQuestions: unit.quickCheckQuestions.map((question) => ({
          prompt: question.prompt,
          questionType: question.questionType,
          options: question.options,
          correctOptionIds: question.correctOptionIds,
          hint: question.hint,
          sourceFact: question.sourceFact
        })),
        reviewItems: unit.reviewItems.map((item) => ({
          prompt: item.prompt,
          answer: item.answer
        }))
      }))
    });
    expect(stale.value.loopBatch?.units[0].quickCheckQuestions[0].prompt).toBe(
      "Which statement best describes coastal erosion?"
    );
    expect(stale.value.loopBatch?.units[0].reviewItems[0]).toMatchObject({
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

  it("reflects canonical loop and mastery state when compatibility loopBatch, practice activity, and mastery profile are stale", () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const workspace = Workspace.create({
      title: "Canonical projection workspace",
      learner: {
        name: "Year 7 learner",
        yearGroup: "Year 7",
        availableMinutesByDay: {}
      },
      activeObjective: "Resume the canonical loop state."
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
    const staleLoopBatch = LearningLoopBatch.create({
      learningLoopId: learningLoop.id,
      overview: "Stale compatibility batch.",
      targetDurationMinutes: 10,
      units: [
        {
          focus: "Erosion",
          reason: "Stale batch says start here.",
          objectiveRefs: ["objective_1"],
          sourceRefs: ["coasts_ref_1"],
          shortExplanation: "Stale explanation.",
          learnerTask: "Stale learner task.",
          targetKnowledgeGapIds: ["gap_coasts"],
          quickCheckQuestions: [{ prompt: "Stale prompt 1" }],
          reviewItems: [{ prompt: "Stale review 1", answer: "Stale answer 1" }],
          state: "ready"
        },
        {
          focus: "Longshore drift",
          reason: "Canonical state says this is current.",
          objectiveRefs: ["objective_2"],
          sourceRefs: ["coasts_ref_2"],
          shortExplanation: "Canonical explanation.",
          learnerTask: "Explain longshore drift.",
          targetKnowledgeGapIds: ["gap_coasts"],
          quickCheckQuestions: [{ prompt: "Stale prompt 2" }],
          reviewItems: [{ prompt: "Stale review 2", answer: "Stale answer 2" }],
          state: "locked"
        }
      ]
    });
    const batchUnits = staleLoopBatch.toSnapshot().units;
    const canonicalLoopUnits = [
      LoopUnit.rehydrate({
        id: batchUnits[0]!.id,
        learningLoopId: learningLoop.id,
        focus: batchUnits[0]!.focus,
        reason: batchUnits[0]!.reason,
        objectiveRefs: batchUnits[0]!.objectiveRefs,
        sourceRefs: batchUnits[0]!.sourceRefs,
        shortExplanation: batchUnits[0]!.shortExplanation,
        learnerTask: batchUnits[0]!.learnerTask,
        targetKnowledgeGapIds: batchUnits[0]!.targetKnowledgeGapIds,
        state: "completed",
        sequence: 0,
        createdAt: staleLoopBatch.toSnapshot().createdAt
      }),
      LoopUnit.rehydrate({
        id: batchUnits[1]!.id,
        learningLoopId: learningLoop.id,
        focus: batchUnits[1]!.focus,
        reason: batchUnits[1]!.reason,
        objectiveRefs: batchUnits[1]!.objectiveRefs,
        sourceRefs: batchUnits[1]!.sourceRefs,
        shortExplanation: batchUnits[1]!.shortExplanation,
        learnerTask: batchUnits[1]!.learnerTask,
        targetKnowledgeGapIds: batchUnits[1]!.targetKnowledgeGapIds,
        state: "in_progress",
        sequence: 1,
        createdAt: staleLoopBatch.toSnapshot().createdAt
      })
    ];
    const seed = QuestionSeed.create({
      learningLoopId: learningLoop.id,
      topic: "Coasts",
      focus: "Longshore drift",
      objectiveRefs: ["objective_2"],
      sourceRefs: ["coasts_ref_2"],
      answerModel: "Longshore drift moves sediment along the coast.",
      explanation: "Waves approach at an angle and move sediment alongshore.",
      tags: ["Longshore drift"]
    });
    const quickCheckVariant = QuestionVariant.create({
      seedId: seed.id,
      learningLoopId: learningLoop.id,
      ownerId: batchUnits[1]!.id,
      ownerKind: "loop_quick_check",
      position: 0,
      mode: "multiple_choice",
      prompt: "What does longshore drift do?",
      options: [
        { id: "a", text: "Moves sediment along the coast." },
        { id: "b", text: "Melts cliffs into the sea." }
      ],
      correctOptionIds: ["a"],
      hint: "Think about sediment moving sideways.",
      sourceFact: "Waves move sediment along the shoreline."
    });
    const reviewVariant = QuestionVariant.create({
      seedId: seed.id,
      learningLoopId: learningLoop.id,
      ownerId: batchUnits[1]!.id,
      ownerKind: "loop_review_item",
      position: 0,
      mode: "review",
      prompt: "Explain longshore drift in one sentence.",
      expectedAnswer: "Longshore drift moves sediment along the coast."
    });
    const canonicalLoopStructure = deriveCanonicalLoopStructure({
      learningLoopId: learningLoop.id,
      loopBatch: staleLoopBatch.toSnapshot(),
      questionVariants: [quickCheckVariant, reviewVariant]
    });
    const canonicalMasteryState = MasteryState.create({
      learningLoopId: learningLoop.id,
      topic: "Coasts",
      status: "secure",
      score: 0.91,
      lastReviewedAt: "2026-05-30T12:00:00.000Z",
      nextReviewAt: "2026-06-06T12:00:00.000Z"
    });
    const staleMasteryProfile = MasteryProfile.create(learningLoop.id).recordTopicScore(
      "Coasts",
      0.12
    );
    const loopWithStaleMasteryProfile = LearningLoop.rehydrate({
      ...learningLoop.toSnapshot(),
      masteryProfileId: staleMasteryProfile.id
    });
    const stalePracticeActivity = PracticeActivity.create({
      workspaceId: workspace.id,
      learningLoopId: learningLoop.id,
      title: "Stale practice activity",
      targetKnowledgeGapIds: ["gap_coasts" as never],
      learningObjectives: ["Stale practice objective"],
      sourceMasterDataItemIds: ["item_stale" as never],
      flashcardSet: {
        instructions: "Old practice instructions.",
        cards: [
          {
            id: "card_1",
            front: "Old stale practice front",
            back: "Old stale practice back",
            topic: "Coasts",
            knowledgeGapId: "gap_coasts" as never,
            learningObjective: "Stale practice objective",
            sourceMasterDataItemId: "item_stale" as never,
            sourceVisibleSentence: "Old stale visible sentence."
          }
        ]
      }
    });

    repository.saveRecord(
      LearnerWorkspaceKey.fromLearner("Year 7 learner", "Year 7"),
      createLearningLoopRecord({
        workspace,
        tasks: [],
        workPlans: [],
        artifacts: [],
        events: [],
        learningLoops: [loopWithStaleMasteryProfile],
        assessments: [],
        attempts: [],
        evaluations: [],
        knowledgeGaps: [],
        learnerEvidence: [],
        masteryStates: [canonicalMasteryState],
        masteryProfiles: [staleMasteryProfile],
        practiceActivities: [stalePracticeActivity],
        activeReviewSessions: [],
        loopBatches: [staleLoopBatch],
        loopUnits: canonicalLoopUnits,
        loopUnitQuestionAssignments: canonicalLoopStructure.loopUnitQuestionAssignments,
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

    expect(result.value.nextAction.kind).toBe("start-loop-unit");
    expect(result.value.nextAction.summary).toContain("Longshore drift");
    expect(result.value.loopBatch?.units[1]?.quickCheckQuestions[0]).toMatchObject({
      prompt: "What does longshore drift do?",
      questionType: "multiple_choice",
      hint: "Think about sediment moving sideways."
    });
    expect(result.value.loopBatch?.units[1]?.reviewItems[0]).toMatchObject({
      prompt: "Explain longshore drift in one sentence.",
      answer: "Longshore drift moves sediment along the coast."
    });
    expect(result.value.masteryProfile?.topics).toEqual([
      expect.objectContaining({
        topic: "Coasts",
        score: 0.91,
        status: "secure"
      })
    ]);
    expect(result.value.currentPracticeActivity?.title).toBe("Stale practice activity");
    expect(result.value.currentPracticeActivity?.flashcardSet.cards[0]).toMatchObject({
      front: "Explain longshore drift in one sentence.",
      back: "Longshore drift moves sediment along the coast."
    });
    expect(result.value.currentPracticeActivity?.flashcardSet.cards[0]?.front).not.toBe(
      "Old stale practice front"
    );
  });

  it("uses canonical loop-unit state for next action even when the batch snapshot is stale", () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const workspace = Workspace.create({
      title: "Canonical next-action workspace",
      learner: {
        name: "Year 7 learner",
        yearGroup: "Year 7",
        availableMinutesByDay: {}
      },
      activeObjective: "Resume the correct loop unit."
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
      overview: "Batch snapshot is stale.",
      targetDurationMinutes: 10,
      units: [
        {
          focus: "Erosion",
          reason: "Start here in the stale snapshot.",
          objectiveRefs: ["objective_1"],
          sourceRefs: ["coasts_ref_1"],
          shortExplanation: "Stale explanation.",
          learnerTask: "Stale task.",
          targetKnowledgeGapIds: ["gap_coasts"],
          quickCheckQuestions: [{ prompt: "Stale prompt 1" }],
          reviewItems: [{ prompt: "Stale review 1", answer: "Stale answer 1" }],
          state: "ready"
        },
        {
          focus: "Longshore drift",
          reason: "Canonical state says this is current.",
          objectiveRefs: ["objective_2"],
          sourceRefs: ["coasts_ref_2"],
          shortExplanation: "Canonical explanation.",
          learnerTask: "Explain longshore drift.",
          targetKnowledgeGapIds: ["gap_coasts"],
          quickCheckQuestions: [{ prompt: "Canonical prompt 2" }],
          reviewItems: [{ prompt: "Canonical review 2", answer: "Canonical answer 2" }],
          state: "locked"
        }
      ]
    });
    const unitSnapshots = loopBatch.toSnapshot().units;
    const canonicalLoopUnits = [
      LoopUnit.rehydrate({
        id: unitSnapshots[0]!.id,
        learningLoopId: learningLoop.id,
        focus: unitSnapshots[0]!.focus,
        reason: unitSnapshots[0]!.reason,
        objectiveRefs: unitSnapshots[0]!.objectiveRefs,
        sourceRefs: unitSnapshots[0]!.sourceRefs,
        shortExplanation: unitSnapshots[0]!.shortExplanation,
        learnerTask: unitSnapshots[0]!.learnerTask,
        targetKnowledgeGapIds: unitSnapshots[0]!.targetKnowledgeGapIds,
        state: "completed",
        sequence: 0,
        createdAt: loopBatch.toSnapshot().createdAt
      }),
      LoopUnit.rehydrate({
        id: unitSnapshots[1]!.id,
        learningLoopId: learningLoop.id,
        focus: unitSnapshots[1]!.focus,
        reason: unitSnapshots[1]!.reason,
        objectiveRefs: unitSnapshots[1]!.objectiveRefs,
        sourceRefs: unitSnapshots[1]!.sourceRefs,
        shortExplanation: unitSnapshots[1]!.shortExplanation,
        learnerTask: unitSnapshots[1]!.learnerTask,
        targetKnowledgeGapIds: unitSnapshots[1]!.targetKnowledgeGapIds,
        state: "in_progress",
        sequence: 1,
        createdAt: loopBatch.toSnapshot().createdAt
      })
    ];

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
        masteryStates: [],
        masteryProfiles: [],
        practiceActivities: [],
        activeReviewSessions: [],
        loopBatches: [loopBatch],
        loopUnits: canonicalLoopUnits,
        loopUnitQuestionAssignments: [],
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

    expect(result.value.nextAction.kind).toBe("start-loop-unit");
    expect(result.value.nextAction.relatedId).toBe(unitSnapshots[1]!.id);
    expect(result.value.nextAction.summary).toContain("Longshore drift");
  });

  it("preserves canonical loop units, assignments, evidence, and mastery across repository rewrites", () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const workspace = Workspace.create({
      title: "Canonical loop persistence workspace",
      learner: {
        name: "Year 7 learner",
        yearGroup: "Year 7",
        availableMinutesByDay: {}
      },
      activeObjective: "Keep canonical loop structure stable."
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
      overview: "Canonical loop batch.",
      targetDurationMinutes: 8,
      units: [
        {
          focus: "Longshore drift",
          reason: "Reinforce a key coastal process.",
          objectiveRefs: ["objective_longshore_drift"],
          sourceRefs: ["coasts_ref_2"],
          shortExplanation: "Longshore drift moves sediment along the coastline.",
          learnerTask: "Explain how longshore drift moves sediment.",
          targetKnowledgeGapIds: ["gap_coasts"],
          quickCheckQuestions: [{ prompt: "Legacy quick-check prompt" }],
          reviewItems: [
            {
              prompt: "Legacy review prompt",
              answer: "It moves sediment along the coast."
            }
          ]
        }
      ]
    });
    const unit = loopBatch.toSnapshot().units[0];
    const seed = QuestionSeed.create({
      learningLoopId: learningLoop.id,
      topic: "Coasts",
      focus: "Longshore drift",
      objectiveRefs: ["objective_longshore_drift"],
      sourceRefs: ["coasts_ref_2"],
      answerModel: "It moves sediment along the coast.",
      explanation: "Longshore drift moves sediment along the coastline.",
      tags: ["Longshore drift"]
    });
    const quickCheckVariant = QuestionVariant.create({
      seedId: seed.id,
      learningLoopId: learningLoop.id,
      ownerId: unit.id,
      ownerKind: "loop_quick_check",
      position: 0,
      mode: "multiple_select",
      prompt: "Which statements describe longshore drift?",
      options: [
        { id: "a", text: "It moves sediment along the coast." },
        { id: "b", text: "It freezes waves in place." },
        { id: "c", text: "It depends on waves approaching at an angle." }
      ],
      correctOptionIds: ["a", "c"],
      hint: "Think about angled waves and sediment movement.",
      sourceFact: "Waves approaching at an angle can move sediment along the coast."
    });
    const reviewVariant = QuestionVariant.create({
      seedId: seed.id,
      learningLoopId: learningLoop.id,
      ownerId: unit.id,
      ownerKind: "loop_review_item",
      position: 0,
      mode: "review",
      prompt: "Recall the effect of longshore drift.",
      expectedAnswer: "It moves sediment along the coast."
    });
    const canonicalLoopStructure = deriveCanonicalLoopStructure({
      learningLoopId: learningLoop.id,
      loopBatch: loopBatch.toSnapshot(),
      questionVariants: [quickCheckVariant, reviewVariant]
    });
    const learnerEvidence = LearnerEvidence.create({
      workspaceId: workspace.id,
      learningLoopId: learningLoop.id,
      loopUnitId: unit.id,
      seedId: seed.id,
      variantId: reviewVariant.id,
      responseText: "It moves sediment along the coast.",
      correctness: "correct",
      supportUsed: "independent"
    });
    const masteryState = MasteryState.create({
      learningLoopId: learningLoop.id,
      topic: "Coasts",
      status: "developing",
      score: 0.62,
      lastReviewedAt: "2026-05-31T09:00:00.000Z",
      nextReviewAt: "2026-06-02T09:00:00.000Z"
    });
    const key = LearnerWorkspaceKey.fromLearner("Year 7 learner", "Year 7");

    const record = createLearningLoopRecord({
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
      learnerEvidence: [learnerEvidence],
      masteryStates: [masteryState],
      masteryProfiles: [],
      practiceActivities: [],
      activeReviewSessions: [],
      loopBatches: [loopBatch],
      loopUnits: canonicalLoopStructure.loopUnits,
      loopUnitQuestionAssignments: canonicalLoopStructure.loopUnitQuestionAssignments,
      questionSeeds: [seed],
      questionVariants: [quickCheckVariant, reviewVariant],
      runtimeConversationBindings: [],
      runtimeTraces: []
    });

    repository.saveRecord(key, record);
    const loaded = repository.findRecord(key);
    expect(loaded?.loopUnits).toHaveLength(1);
    expect(loaded?.loopUnitQuestionAssignments).toHaveLength(2);
    expect(loaded?.learnerEvidence).toHaveLength(1);
    expect(loaded?.masteryStates).toHaveLength(1);

    repository.saveRecord(key, createLearningLoopRecord(loaded!));
    const reloaded = repository.findRecord(key);

    expect(reloaded?.loopUnits).toHaveLength(1);
    expect(reloaded?.loopUnitQuestionAssignments).toHaveLength(2);
    expect(reloaded?.learnerEvidence).toHaveLength(1);
    expect(reloaded?.masteryStates).toHaveLength(1);

    const result = new LearningLoopController(repository).get(learningLoop.id);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.loopBatch?.units[0].quickCheckQuestions[0]).toMatchObject({
      prompt: "Which statements describe longshore drift?",
      questionType: "multiple_select",
      hint: "Think about angled waves and sediment movement."
    });
    expect(result.value.loopBatch?.units[0].reviewItems[0]).toMatchObject({
      prompt: "Recall the effect of longshore drift.",
      answer: "It moves sediment along the coast."
    });
    expect(result.value.masteryProfile?.topics).toEqual([
      expect.objectContaining({
        topic: "Coasts",
        status: "developing",
        score: 0.62
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
    expect(studyPlan.value.knowledgeGaps).toHaveLength(1);
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
      diagnosedGapCount: 1
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
