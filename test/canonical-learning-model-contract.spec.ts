import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { KnowledgeGap, LearningLoop, MasteryProfile } from "../src/domain/learning/LearningLoop.js";
import { LearningLoopBatch } from "../src/domain/learning/LearningLoopBatch.js";
import { LearnerEvidence } from "../src/domain/learning/LearnerEvidence.js";
import { LoopUnit } from "../src/domain/learning/LoopUnit.js";
import { LoopUnitQuestionAssignment } from "../src/domain/learning/LoopUnitQuestionAssignment.js";
import { MasteryState } from "../src/domain/learning/MasteryState.js";
import { PracticeActivity } from "../src/domain/learning/PracticeActivity.js";
import { QuestionSeed, QuestionVariant } from "../src/domain/learning/QuestionBank.js";
import { createDomainEventRecorder } from "../src/domain/primitives/Event.js";
import { ok } from "../src/domain/primitives/result.js";
import { Workspace } from "../src/domain/primitives/Workspace.js";
import { LearningLoopController } from "../src/modules/learning/LearningLoopController.js";
import { createUploadItemsFromInterpretation } from "../src/modules/masterData/MasterDataInterpretation.js";
import { MasteryStateService } from "../src/modules/mastery/MasteryStateService.js";
import {
  createLearningLoopRecord,
  type LearningLoopRecord
} from "../src/modules/planning/LearningLoopRepository.js";
import { LearnerWorkspaceKey } from "../src/modules/planning/LearnerWorkspaceKey.js";
import { SqliteLearningLoopRepository } from "../src/modules/planning/SqliteLearningLoopRepository.js";
import { StudyPlanController } from "../src/modules/planning/StudyPlanController.js";
import { PracticeActivityController } from "../src/modules/practice/PracticeActivityController.js";
import { PracticeSourceSelector } from "../src/modules/practice/PracticeSourceSelector.js";

function createInterpretation(topic: string) {
  return {
    schema: "MasterDataInterpretationCandidate.v1" as const,
    detectedSubject: "Geography",
    detectedYearGroup: "Year 7",
    mainTopic: topic,
    subtopics: ["Coastal processes"],
    keyPeople: [],
    keyTerms: ["erosion", "deposition"],
    importantDates: [],
    processes: ["erosion", "deposition"],
    learnerFacingMaterialSummary: `${topic} is shaped by coastal processes.`,
    learningObjectives: [
      {
        id: `objective_${topic.toLowerCase()}`,
        objective: `Explain how coastal processes shape ${topic}.`,
        sourceRefs: [`${topic.toLowerCase()}_source_ref`]
      }
    ],
    sourceMap: [
      {
        sourceRef: `${topic.toLowerCase()}_source_ref`,
        excerpt: `${topic} changes when waves erode and deposit material.`
      }
    ],
    items: [
      {
        subject: "Geography",
        yearGroup: "Year 7",
        topic,
        subtopic: "Coastal processes",
        itemType: "fact" as const,
        content: `${topic} changes when waves erode and deposit material.`,
        sourceRef: `${topic.toLowerCase()}_source_ref`
      }
    ]
  };
}

function createCanonicalFixture(
  repository: SqliteLearningLoopRepository,
  topic = "Coasts",
  learnerName = "Year 7 learner"
) {
  const interpretation = createInterpretation(topic);
  const upload = repository.registerMasterData({
    sourceName: `${topic} canonical source`,
    rawSourceContent: `${topic} changes when waves erode and deposit material.`,
    contentType: "text/plain",
    learnerYearGroup: "Year 7",
    userHints: {
      subject: "Geography",
      topic
    },
    acceptedInterpretation: interpretation,
    items: createUploadItemsFromInterpretation(interpretation)
  });

  const workspace = Workspace.create({
    title: `${topic} workspace`,
    learner: {
      name: learnerName,
      yearGroup: "Year 7",
      availableMinutesByDay: {}
    },
    activeObjective: `Build secure understanding in ${topic}.`
  });
  const events = createDomainEventRecorder(workspace.id);
  const baseLoop = LearningLoop.create(
    {
      workspaceId: workspace.id,
      objective: `Build secure understanding in ${topic}.`,
      topic,
      sourceIds: [upload.source.id as never]
    },
    events
  );
  const knowledgeGap = KnowledgeGap.create({
    learningLoopId: baseLoop.id,
    topic,
    description: `Strengthen understanding of erosion in ${topic}.`,
    evidence: "Learner needs more secure explanations of erosion.",
    severity: "medium"
  });
  const learningLoop = LearningLoop.rehydrate({
    ...baseLoop.toSnapshot(),
    phase: "loop-batching",
    status: "active",
    evaluationIds: ["evaluation_1" as never],
    knowledgeGapIds: [knowledgeGap.id]
  });
  const loopBatch = LearningLoopBatch.create({
    learningLoopId: learningLoop.id,
    overview: "Legacy compatibility batch snapshot.",
    targetDurationMinutes: 8,
    units: [
      {
        focus: "Erosion",
        reason: "This is a core coastal process.",
        objectiveRefs: [`objective_${topic.toLowerCase()}`],
        sourceRefs: [`${topic.toLowerCase()}_source_ref`],
        shortExplanation: "Waves wear away rock over time.",
        learnerTask: "Explain erosion using one coastline example.",
        targetKnowledgeGapIds: [knowledgeGap.id],
        quickCheckQuestions: [
          {
            prompt: "Stale quick-check prompt from the legacy snapshot",
            questionType: "guided"
          }
        ],
        reviewItems: [
          {
            prompt: "Stale review prompt from the legacy snapshot",
            answer: "Legacy review answer"
          }
        ]
      }
    ]
  });

  const unitSnapshot = loopBatch.toSnapshot().units[0]!;
  const loopUnit = LoopUnit.rehydrate({
    id: unitSnapshot.id,
    learningLoopId: learningLoop.id,
    focus: unitSnapshot.focus,
    reason: unitSnapshot.reason,
    objectiveRefs: [...unitSnapshot.objectiveRefs],
    sourceRefs: [...unitSnapshot.sourceRefs],
    shortExplanation: unitSnapshot.shortExplanation,
    learnerTask: unitSnapshot.learnerTask,
    targetKnowledgeGapIds: [...unitSnapshot.targetKnowledgeGapIds],
    state: "ready",
    sequence: 0,
    createdAt: loopBatch.toSnapshot().createdAt
  });
  const questionSeed = QuestionSeed.create({
    learningLoopId: learningLoop.id,
    topic,
    focus: "Erosion",
    objectiveRefs: [`objective_${topic.toLowerCase()}`],
    sourceRefs: [`${topic.toLowerCase()}_source_ref`],
    answerModel: "Erosion wears away rock and cliffs.",
    explanation: "Waves gradually wear away the coastline.",
    tags: ["erosion", topic]
  });
  const quickCheckVariant = QuestionVariant.create({
    seedId: questionSeed.id,
    learningLoopId: learningLoop.id,
    ownerId: loopUnit.id,
    ownerKind: "loop_quick_check",
    position: 0,
    mode: "multiple_choice",
    prompt: "Which statement best describes coastal erosion?",
    options: [
      { id: "a", text: "Waves wear away rock and cliffs." },
      { id: "b", text: "Waves always build new beaches." }
    ],
    correctOptionIds: ["a"],
    hint: "Think about rock being worn away.",
    sourceFact: "Waves gradually wear away the coastline."
  });
  const reviewVariant = QuestionVariant.create({
    seedId: questionSeed.id,
    learningLoopId: learningLoop.id,
    ownerId: loopUnit.id,
    ownerKind: "loop_review_item",
    position: 0,
    mode: "review",
    prompt: "Explain coastal erosion in your own words.",
    expectedAnswer: "Erosion wears away rock and cliffs."
  });
  const quickCheckAssignment = LoopUnitQuestionAssignment.create({
    learningLoopId: learningLoop.id,
    loopUnitId: loopUnit.id,
    variantId: quickCheckVariant.id,
    purpose: "quick_check",
    sequence: 0
  });
  const reviewAssignment = LoopUnitQuestionAssignment.create({
    learningLoopId: learningLoop.id,
    loopUnitId: loopUnit.id,
    variantId: reviewVariant.id,
    purpose: "review",
    sequence: 0
  });
  const key = LearnerWorkspaceKey.fromLearner(learnerName, "Year 7");

  const record = createLearningLoopRecord({
    workspace,
    tasks: [],
    workPlans: [],
    artifacts: [],
    events: [...events.all()],
    learningLoops: [learningLoop],
    assessments: [],
    attempts: [],
    evaluations: [],
    knowledgeGaps: [knowledgeGap],
    learnerEvidence: [],
    masteryStates: [],
    masteryProfiles: [],
    practiceActivities: [],
    activeReviewSessions: [],
    loopBatches: [loopBatch],
    loopUnits: [loopUnit],
    loopUnitQuestionAssignments: [quickCheckAssignment, reviewAssignment],
    questionSeeds: [questionSeed],
    questionVariants: [quickCheckVariant, reviewVariant],
    runtimeConversationBindings: [],
    runtimeTraces: []
  });

  return {
    key,
    record,
    upload,
    workspace,
    learningLoop,
    knowledgeGap,
    loopBatch,
    loopUnit,
    questionSeed,
    quickCheckVariant,
    reviewVariant,
    quickCheckAssignment,
    reviewAssignment
  };
}

function saveCanonicalFixture(repository: SqliteLearningLoopRepository, topic?: string) {
  const fixture = createCanonicalFixture(repository, topic);
  repository.saveRecord(fixture.key, fixture.record);
  return fixture;
}

function createFixtureEvidenceAndMastery(
  fixture: ReturnType<typeof createCanonicalFixture>,
  capturedAt: string
) {
  const evidence = LearnerEvidence.rehydrate({
    id: `evidence_${fixture.learningLoop.id}` as never,
    workspaceId: fixture.workspace.id,
    learningLoopId: fixture.learningLoop.id,
    loopUnitId: fixture.loopUnit.id,
    seedId: fixture.questionSeed.id,
    variantId: fixture.quickCheckVariant.id,
    sourceId: fixture.upload.source.id as never,
    responseText: fixture.questionSeed.toSnapshot().answerModel,
    confidence: "medium",
    correctness: "correct",
    supportUsed: "independent",
    capturedAt
  });
  const seedMastery = MasteryState.create({
    learningLoopId: fixture.learningLoop.id,
    topic: fixture.learningLoop.topic,
    seedId: fixture.questionSeed.id,
    status: "developing",
    score: 0.63,
    lastReviewedAt: capturedAt,
    nextReviewAt: "2026-06-02T11:00:00.000Z"
  });
  const topicMastery = MasteryState.create({
    learningLoopId: fixture.learningLoop.id,
    topic: fixture.learningLoop.topic,
    status: "developing",
    score: 0.58,
    lastReviewedAt: capturedAt,
    nextReviewAt: "2026-06-02T11:00:00.000Z"
  });

  return {
    evidence,
    masteryStates: [seedMastery, topicMastery]
  };
}

function canonicalRowsForLearner(database: DatabaseSync, learnerKey: string) {
  return {
    learningLoops: database
      .prepare(
        "select id, workspace_id, objective, topic, phase, status, mastery_profile_id from learning_loops where learner_key = ? order by id asc"
      )
      .all(learnerKey),
    loopUnits: database
      .prepare(
        "select id, learning_loop_id, focus, state, sequence from loop_units where learner_key = ? order by id asc"
      )
      .all(learnerKey),
    assignments: database
      .prepare(
        "select id, learning_loop_id, loop_unit_id, variant_id, purpose, sequence from loop_unit_question_assignments where learner_key = ? order by id asc"
      )
      .all(learnerKey),
    questionSeeds: database
      .prepare(
        "select id, learning_loop_id, topic, focus, answer_model from question_seeds where learner_key = ? order by id asc"
      )
      .all(learnerKey),
    questionVariants: database
      .prepare(
        "select id, learning_loop_id, seed_id, owner_id, owner_kind, mode, position, difficulty from question_variants where learner_key = ? order by id asc"
      )
      .all(learnerKey),
    learnerEvidence: database
      .prepare(
        "select id, workspace_id, learning_loop_id, loop_unit_id, seed_id, variant_id, source_id, correctness, support_used from learner_evidence where learner_key = ? order by id asc"
      )
      .all(learnerKey),
    masteryStates: database
      .prepare(
        "select id, learning_loop_id, topic, seed_id, status, score from mastery_states where learner_key = ? order by id asc"
      )
      .all(learnerKey)
  };
}

describe("Canonical learning model contract", () => {
  it("persists and rehydrates question seeds, variants, loop units, and assignments", () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const fixture = saveCanonicalFixture(repository);

    const reloaded = repository.findRecord(fixture.key);
    expect(reloaded).toBeDefined();
    if (!reloaded) {
      return;
    }

    expect(reloaded.questionSeeds?.map((candidate) => candidate.toSnapshot().id)).toEqual([
      fixture.questionSeed.id
    ]);
    expect(reloaded.questionVariants?.map((candidate) => candidate.toSnapshot().id)).toEqual([
      fixture.quickCheckVariant.id,
      fixture.reviewVariant.id
    ]);
    expect(reloaded.loopUnits?.map((candidate) => candidate.toSnapshot().id)).toEqual([
      fixture.loopUnit.id
    ]);
    expect(
      reloaded.loopUnitQuestionAssignments?.map((candidate) => ({
        loopUnitId: candidate.toSnapshot().loopUnitId,
        variantId: candidate.toSnapshot().variantId,
        purpose: candidate.toSnapshot().purpose
      }))
    ).toEqual([
      {
        loopUnitId: fixture.loopUnit.id,
        variantId: fixture.quickCheckVariant.id,
        purpose: "quick_check"
      },
      {
        loopUnitId: fixture.loopUnit.id,
        variantId: fixture.reviewVariant.id,
        purpose: "review"
      }
    ]);
  });

  it("falls back explicitly to canonical snapshot rehydration when relational canonical columns drift", () => {
    const pathname = join(
      tmpdir(),
      `sherlock-canonical-fallback-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`
    );
    const repository = new SqliteLearningLoopRepository(pathname);
    const fixture = saveCanonicalFixture(repository);
    const inspector = new DatabaseSync(pathname);

    inspector
      .prepare("update question_variants set owner_kind = ? where id = ?")
      .run("loop_review_item", fixture.quickCheckVariant.id);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const reloaded = repository.findRecord(fixture.key);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[loop.study] Canonical read fallback used for learner")
    );
    warnSpy.mockRestore();

    expect(reloaded).toBeDefined();
    if (!reloaded) {
      return;
    }

    const quickCheck = reloaded.questionVariants?.find(
      (candidate) => candidate.toSnapshot().id === fixture.quickCheckVariant.id
    );
    expect(quickCheck?.toSnapshot().ownerKind).toBe("loop_quick_check");
    expect(
      reloaded.loopUnitQuestionAssignments?.map((candidate) => candidate.toSnapshot().variantId)
    ).toContain(fixture.quickCheckVariant.id);
  });

  it("appends learner evidence and updates mastery state from evidence", () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const fixture = saveCanonicalFixture(repository);
    const masteryStateService = new MasteryStateService();

    const firstEvidence = LearnerEvidence.rehydrate({
      id: "evidence_1" as never,
      workspaceId: fixture.workspace.id,
      learningLoopId: fixture.learningLoop.id,
      loopUnitId: fixture.loopUnit.id,
      seedId: fixture.questionSeed.id,
      variantId: fixture.quickCheckVariant.id,
      sourceId: fixture.upload.source.id as never,
      responseText: "Not sure.",
      confidence: "low",
      correctness: "incorrect",
      supportUsed: "independent",
      capturedAt: "2026-05-31T10:00:00.000Z"
    });
    const firstUpdate = masteryStateService.update({
      existingStates: [],
      learningLoop: fixture.learningLoop,
      newEvidence: [firstEvidence],
      questionSeeds: [fixture.questionSeed]
    });
    const secondEvidence = LearnerEvidence.rehydrate({
      id: "evidence_2" as never,
      workspaceId: fixture.workspace.id,
      learningLoopId: fixture.learningLoop.id,
      loopUnitId: fixture.loopUnit.id,
      seedId: fixture.questionSeed.id,
      variantId: fixture.reviewVariant.id,
      sourceId: fixture.upload.source.id as never,
      responseText: "Erosion wears away rock and cliffs.",
      confidence: "high",
      correctness: "correct",
      supportUsed: "independent",
      capturedAt: "2026-05-31T12:00:00.000Z"
    });
    const secondUpdate = masteryStateService.update({
      existingStates: firstUpdate.masteryStates,
      learningLoop: fixture.learningLoop,
      newEvidence: [secondEvidence],
      questionSeeds: [fixture.questionSeed],
      existingProfile: firstUpdate.masteryProfile
    });

    repository.saveRecord(
      fixture.key,
      createLearningLoopRecord({
        ...fixture.record,
        learnerEvidence: [firstEvidence, secondEvidence],
        masteryStates: secondUpdate.masteryStates,
        masteryProfiles: secondUpdate.masteryProfile ? [secondUpdate.masteryProfile] : []
      })
    );

    const reloaded = repository.findRecord(fixture.key);
    expect(reloaded?.learnerEvidence).toHaveLength(2);
    const seedMastery = reloaded?.masteryStates?.find(
      (candidate) => candidate.toSnapshot().seedId === fixture.questionSeed.id
    );
    const topicMastery = reloaded?.masteryStates?.find(
      (candidate) => candidate.toSnapshot().seedId === undefined
    );

    expect(seedMastery).toBeDefined();
    expect(topicMastery).toBeDefined();
    expect(seedMastery?.toSnapshot().status).toBe("developing");
    expect(seedMastery?.toSnapshot().score).toBeGreaterThan(0.45);
    expect(seedMastery?.toSnapshot().lastReviewedAt).toBe("2026-05-31T12:00:00.000Z");
    expect(topicMastery?.toSnapshot().nextReviewAt).toBe("2026-06-02T12:00:00.000Z");
  });

  it("prefers canonical loop-unit state over stale loop-batch snapshots for resume and nextAction", () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const interpretation = createInterpretation("Coasts");
    const upload = repository.registerMasterData({
      sourceName: "Coasts canonical source",
      rawSourceContent: "Coasts change when waves erode and deposit material.",
      contentType: "text/plain",
      learnerYearGroup: "Year 7",
      userHints: {
        subject: "Geography",
        topic: "Coasts"
      },
      acceptedInterpretation: interpretation,
      items: createUploadItemsFromInterpretation(interpretation)
    });
    const workspace = Workspace.create({
      title: "Resume workspace",
      learner: {
        name: "Year 7 learner",
        yearGroup: "Year 7",
        availableMinutesByDay: {}
      },
      activeObjective: "Build secure understanding in Coasts."
    });
    const events = createDomainEventRecorder(workspace.id);
    const baseLoop = LearningLoop.create(
      {
        workspaceId: workspace.id,
        objective: "Build secure understanding in Coasts.",
        topic: "Coasts",
        sourceIds: [upload.source.id as never]
      },
      events
    );
    const gap = KnowledgeGap.create({
      learningLoopId: baseLoop.id,
      topic: "Coasts",
      description: "Strengthen understanding of erosion.",
      evidence: "Weak explanation of erosion.",
      severity: "medium"
    });
    const learningLoop = LearningLoop.rehydrate({
      ...baseLoop.toSnapshot(),
      phase: "loop-batching",
      status: "active",
      evaluationIds: ["evaluation_1" as never],
      knowledgeGapIds: [gap.id]
    });
    const loopBatch = LearningLoopBatch.create({
      learningLoopId: learningLoop.id,
      overview: "Stale batch ordering.",
      targetDurationMinutes: 10,
      units: [
        {
          focus: "Erosion",
          reason: "Canonical unit should still be next.",
          objectiveRefs: ["objective_coasts"],
          sourceRefs: ["coasts_source_ref"],
          shortExplanation: "Waves wear away cliffs over time.",
          learnerTask: "Explain erosion.",
          targetKnowledgeGapIds: [gap.id],
          state: "completed",
          quickCheckQuestions: [{ prompt: "Stale completed question" }],
          reviewItems: [{ prompt: "Stale completed review", answer: "Completed answer" }]
        },
        {
          focus: "Deposition",
          reason: "Legacy snapshot says this is next.",
          objectiveRefs: ["objective_coasts"],
          sourceRefs: ["coasts_source_ref"],
          shortExplanation: "Material is dropped when waves lose energy.",
          learnerTask: "Explain deposition.",
          targetKnowledgeGapIds: [gap.id],
          state: "ready",
          quickCheckQuestions: [{ prompt: "Legacy next prompt" }],
          reviewItems: [{ prompt: "Legacy next review", answer: "Legacy next answer" }]
        }
      ]
    });
    const batchUnits = loopBatch.toSnapshot().units;
    const canonicalLoopUnits = [
      LoopUnit.rehydrate({
        id: batchUnits[0]!.id,
        learningLoopId: learningLoop.id,
        focus: batchUnits[0]!.focus,
        reason: batchUnits[0]!.reason,
        objectiveRefs: [...batchUnits[0]!.objectiveRefs],
        sourceRefs: [...batchUnits[0]!.sourceRefs],
        shortExplanation: batchUnits[0]!.shortExplanation,
        learnerTask: batchUnits[0]!.learnerTask,
        targetKnowledgeGapIds: [...batchUnits[0]!.targetKnowledgeGapIds],
        state: "ready",
        sequence: 0,
        createdAt: loopBatch.toSnapshot().createdAt
      }),
      LoopUnit.rehydrate({
        id: batchUnits[1]!.id,
        learningLoopId: learningLoop.id,
        focus: batchUnits[1]!.focus,
        reason: batchUnits[1]!.reason,
        objectiveRefs: [...batchUnits[1]!.objectiveRefs],
        sourceRefs: [...batchUnits[1]!.sourceRefs],
        shortExplanation: batchUnits[1]!.shortExplanation,
        learnerTask: batchUnits[1]!.learnerTask,
        targetKnowledgeGapIds: [...batchUnits[1]!.targetKnowledgeGapIds],
        state: "locked",
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
        events: [...events.all()],
        learningLoops: [learningLoop],
        assessments: [],
        attempts: [],
        evaluations: [],
        knowledgeGaps: [gap],
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
    expect(result.value.nextAction.relatedId).toBe(batchUnits[0]!.id);
    expect(result.value.loopBatch?.units[0]?.state).toBe("ready");
    expect(result.value.loopBatch?.units[1]?.state).toBe("locked");
  });

  it("adapts study-plan context from learner evidence and mastery state without review-session snapshots", async () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const interpretation = createInterpretation("fractions");
    const upload = repository.registerMasterData({
      sourceName: "Fractions canonical source",
      rawSourceContent: "Equivalent fractions represent the same amount.",
      contentType: "text/plain",
      learnerYearGroup: "Year 7",
      userHints: {
        subject: "Mathematics",
        topic: "fractions"
      },
      acceptedInterpretation: {
        ...interpretation,
        detectedSubject: "Mathematics",
        mainTopic: "fractions",
        subtopics: ["Equivalent fractions"],
        keyTerms: ["equivalent fraction"],
        processes: ["simplifying fractions"],
        learnerFacingMaterialSummary:
          "Fractions can look different while keeping the same value.",
        learningObjectives: [
          {
            id: "objective_fractions",
            objective: "Explain why equivalent fractions represent the same value.",
            sourceRefs: ["fractions_source"]
          }
        ],
        sourceMap: [
          {
            sourceRef: "fractions_source",
            excerpt: "Equivalent fractions represent the same amount."
          }
        ],
        items: [
          {
            subject: "Mathematics",
            yearGroup: "Year 7",
            topic: "fractions",
            subtopic: "Equivalent fractions",
            itemType: "fact" as const,
            content: "Equivalent fractions represent the same amount.",
            sourceRef: "fractions_source"
          }
        ]
      },
      items: createUploadItemsFromInterpretation({
        ...interpretation,
        detectedSubject: "Mathematics",
        mainTopic: "fractions",
        subtopics: ["Equivalent fractions"],
        keyTerms: ["equivalent fraction"],
        processes: ["simplifying fractions"],
        learnerFacingMaterialSummary:
          "Fractions can look different while keeping the same value.",
        learningObjectives: [
          {
            id: "objective_fractions",
            objective: "Explain why equivalent fractions represent the same value.",
            sourceRefs: ["fractions_source"]
          }
        ],
        sourceMap: [
          {
            sourceRef: "fractions_source",
            excerpt: "Equivalent fractions represent the same amount."
          }
        ],
        items: [
          {
            subject: "Mathematics",
            yearGroup: "Year 7",
            topic: "fractions",
            subtopic: "Equivalent fractions",
            itemType: "fact" as const,
            content: "Equivalent fractions represent the same amount.",
            sourceRef: "fractions_source"
          }
        ]
      })
    });
    const workspace = Workspace.create({
      title: "Fractions workspace",
      learner: {
        name: "Year 7 learner",
        yearGroup: "Year 7",
        availableMinutesByDay: {}
      },
      activeObjective: "Build secure understanding in fractions."
    });
    const events = createDomainEventRecorder(workspace.id);
    const learningLoop = LearningLoop.rehydrate({
      ...LearningLoop.create(
        {
          workspaceId: workspace.id,
          objective: "Build secure understanding in fractions.",
          topic: "fractions",
          sourceIds: [upload.source.id]
        },
        events
      ).toSnapshot(),
      phase: "mastery-tracking",
      status: "active",
      evaluationIds: ["evaluation_fractions" as never],
      knowledgeGapIds: []
    });
    const learnerEvidence = LearnerEvidence.create({
      workspaceId: workspace.id,
      learningLoopId: learningLoop.id,
      seedId: "question_seed_fractions" as never,
      variantId: "question_variant_fractions" as never,
      sourceId: upload.source.id as never,
      responseText: "I am not sure.",
      confidence: "low",
      correctness: "incorrect",
      supportUsed: "independent"
    });
    const masteryState = MasteryState.create({
      learningLoopId: learningLoop.id,
      topic: "fractions",
      status: "developing",
      score: 0.42,
      lastReviewedAt: "2026-05-31T10:00:00.000Z",
      nextReviewAt: "2026-06-02T10:00:00.000Z"
    });

    repository.saveRecord(
      LearnerWorkspaceKey.fromLearner("Year 7 learner", "Year 7"),
      createLearningLoopRecord({
        workspace,
        tasks: [],
        workPlans: [],
        artifacts: [],
        events: [...events.all()],
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
        loopBatches: [],
        loopUnits: [],
        loopUnitQuestionAssignments: [],
        questionSeeds: [],
        questionVariants: [],
        runtimeConversationBindings: [],
        runtimeTraces: []
      })
    );

    let capturedInput:
      | Parameters<NonNullable<ConstructorParameters<typeof StudyPlanController>[3]>["generateStudyPlan"]>[0]
      | undefined;
    const controller = new StudyPlanController(
      repository,
      undefined,
      undefined,
      {
        evaluateActiveReviewSession: () => {
          throw new Error("not used");
        },
        evaluateAssessmentAttempt: () => {
          throw new Error("not used");
        },
        generateInitialAssessment: () => {
          throw new Error("not used");
        },
        generatePracticeActivity: () => {
          throw new Error("not used");
        },
        interpretMasterData: () => {
          throw new Error("not used");
        },
        generateStudyPlan: async (input) => {
          capturedInput = input;
          return ok({
            assumptions: [],
            childTaskSummaries: ["Review equivalent fractions with retrieval and explanation."],
            decisions: [],
            artifactContent: {
              summary: "A short fractions plan with retrieval and explanation.",
              sessions: [
                {
                  day: "Monday",
                  minutes: 30,
                  topic: "fractions",
                  activity: "Review equivalent fractions and explain why they are equal.",
                  outcome: "Explain one example clearly."
                }
              ],
              checkpoints: ["Explain one equivalent-fractions example without notes."],
              notes: ["Use the learner's recent uncertainty to guide the explanation."]
            }
          });
        }
      }
    );

    const result = await controller.execute({
      learnerName: "Year 7 learner",
      yearGroup: "Year 7",
      objective: "Build secure understanding in fractions.",
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
    });

    expect(result.ok).toBe(true);
    expect(capturedInput?.context.objective).toContain(
      "Prioritise recent practice evidence in fractions."
    );
    expect(capturedInput?.context.focusTopics).toContain("fractions");
  });

  it("projects review and practice from saved variants instead of legacy snapshot prompts", () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const fixture = saveCanonicalFixture(repository);
    const resume = new LearningLoopController(repository).get(fixture.learningLoop.id);

    expect(resume.ok).toBe(true);
    if (!resume.ok) {
      return;
    }

    expect(resume.value.loopBatch?.units[0]?.quickCheckQuestions[0]?.prompt).toBe(
      fixture.quickCheckVariant.toSnapshot().prompt
    );
    expect(resume.value.loopBatch?.units[0]?.reviewItems[0]?.prompt).toBe(
      fixture.reviewVariant.toSnapshot().prompt
    );

    const loadedRecord = repository.findRecord(fixture.key)!;
    const selection = new PracticeSourceSelector(repository).select(
      loadedRecord,
      fixture.learningLoop,
      1
    );

    expect(selection.ok).toBe(true);
    if (!selection.ok) {
      return;
    }

    expect(selection.value.selections[0]?.questionSeed?.id).toBe(fixture.questionSeed.id);
    expect(selection.value.selections[0]?.reviewVariant?.id).toBe(fixture.reviewVariant.id);
    expect(selection.value.selections[0]?.reviewVariant?.toSnapshot().prompt).toBe(
      fixture.reviewVariant.toSnapshot().prompt
    );
  });

  it("generates practice from canonical assignments, seeds, and variants when stored practice activity snapshots are stale", async () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const fixture = saveCanonicalFixture(repository);
    const stalePracticeActivity = PracticeActivity.create({
      workspaceId: fixture.workspace.id,
      learningLoopId: fixture.learningLoop.id,
      title: "Stale practice activity",
      targetKnowledgeGapIds: [fixture.knowledgeGap.id],
      learningObjectives: ["Stale objective from compatibility practice"],
      sourceMasterDataItemIds: [fixture.record.workspace.id as never],
      flashcardSet: {
        instructions: "Stale instructions from an older compatibility snapshot.",
        cards: [
          {
            id: "stale_card_1",
            front: "Stale compatibility front",
            back: "Stale compatibility back",
            topic: fixture.learningLoop.topic,
            knowledgeGapId: fixture.knowledgeGap.id,
            learningObjective: "Stale objective from compatibility practice",
            sourceMasterDataItemId: fixture.record.workspace.id as never,
            sourceVisibleSentence: "Stale compatibility sentence."
          }
        ]
      }
    });

    repository.saveRecord(
      fixture.key,
      createLearningLoopRecord({
        ...fixture.record,
        practiceActivities: [stalePracticeActivity]
      })
    );

    const generated = await new PracticeActivityController(repository).generate({
      learningLoopId: fixture.learningLoop.id,
      kind: "flashcard_set",
      cardCount: 1
    });

    expect(generated.ok).toBe(true);
    if (!generated.ok) {
      return;
    }

    expect(generated.value.practiceActivity.flashcardSet.instructions).toBe(
      "Answer each card from memory first, then flip to compare with the model answer and explanation."
    );
    expect(generated.value.practiceActivity.flashcardSet.cards).toHaveLength(1);
    expect(generated.value.practiceActivity.flashcardSet.cards[0]).toEqual(
      expect.objectContaining({
        id: `${fixture.reviewVariant.id}::1`,
        front: fixture.reviewVariant.toSnapshot().prompt,
        back:
          fixture.reviewVariant.toSnapshot().expectedAnswer ??
          fixture.questionSeed.toSnapshot().answerModel,
        learningObjective: fixture.questionSeed.toSnapshot().objectiveRefs[0]
      })
    );
    expect(generated.value.practiceActivity.flashcardSet.cards[0]?.front).not.toBe(
      "Stale compatibility front"
    );
  });

  it("keeps resume, practice, and study-plan projections aligned to canonical state when compatibility blobs are stale", async () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const fixture = createCanonicalFixture(repository);
    const stalePracticeActivity = PracticeActivity.create({
      workspaceId: fixture.workspace.id,
      learningLoopId: fixture.learningLoop.id,
      title: "Stale practice activity",
      targetKnowledgeGapIds: [fixture.knowledgeGap.id],
      learningObjectives: ["Stale objective from compatibility practice"],
      sourceMasterDataItemIds: [fixture.record.workspace.id as never],
      flashcardSet: {
        instructions: "Stale instructions from an older compatibility snapshot.",
        cards: [
          {
            id: "stale_card_1",
            front: "Stale compatibility front",
            back: "Stale compatibility back",
            topic: fixture.learningLoop.topic,
            knowledgeGapId: fixture.knowledgeGap.id,
            learningObjective: "Stale objective from compatibility practice",
            sourceMasterDataItemId: fixture.record.workspace.id as never,
            sourceVisibleSentence: "Stale compatibility sentence."
          }
        ]
      }
    });
    const staleMasteryProfile = MasteryProfile.create(fixture.learningLoop.id).recordTopicScore(
      fixture.learningLoop.topic,
      0.11
    );
    const loopWithStaleMasteryProfile = LearningLoop.rehydrate({
      ...fixture.learningLoop.toSnapshot(),
      masteryProfileId: staleMasteryProfile.id
    });
    const { evidence, masteryStates } = createFixtureEvidenceAndMastery(
      fixture,
      "2026-05-31T11:00:00.000Z"
    );

    repository.saveRecord(
      fixture.key,
      createLearningLoopRecord({
        ...fixture.record,
        learningLoops: [loopWithStaleMasteryProfile],
        learnerEvidence: [evidence],
        masteryStates,
        masteryProfiles: [staleMasteryProfile],
        practiceActivities: [stalePracticeActivity]
      })
    );

    const resume = new LearningLoopController(repository).get(fixture.learningLoop.id);
    expect(resume.ok).toBe(true);
    if (!resume.ok) {
      return;
    }

    expect(resume.value.loopBatch?.units[0]?.quickCheckQuestions[0]?.prompt).toBe(
      fixture.quickCheckVariant.toSnapshot().prompt
    );
    expect(resume.value.loopBatch?.units[0]?.reviewItems[0]?.prompt).toBe(
      fixture.reviewVariant.toSnapshot().prompt
    );
    expect(resume.value.masteryProfile?.topics).toEqual([
      expect.objectContaining({
        topic: fixture.learningLoop.topic,
        status: masteryStates[1]?.toSnapshot().status,
        score: masteryStates[1]?.toSnapshot().score
      })
    ]);

    const listedPractice = new PracticeActivityController(repository).list(fixture.learningLoop.id);
    expect(listedPractice.ok).toBe(true);
    if (!listedPractice.ok) {
      return;
    }

    expect(listedPractice.value.practiceActivities).toHaveLength(1);
    expect(listedPractice.value.practiceActivities[0]?.flashcardSet.cards[0]).toEqual(
      expect.objectContaining({
        front: fixture.reviewVariant.toSnapshot().prompt,
        back:
          fixture.reviewVariant.toSnapshot().expectedAnswer ??
          fixture.questionSeed.toSnapshot().answerModel
      })
    );
    expect(listedPractice.value.practiceActivities[0]?.flashcardSet.cards[0]?.front).not.toBe(
      "Stale compatibility front"
    );

    const studyPlan = await new StudyPlanController(
      repository,
      undefined,
      undefined,
      {
        evaluateActiveReviewSession: () => {
          throw new Error("not used");
        },
        evaluateAssessmentAttempt: () => {
          throw new Error("not used");
        },
        generateInitialAssessment: () => {
          throw new Error("not used");
        },
        generatePracticeActivity: () => {
          throw new Error("not used");
        },
        interpretMasterData: () => {
          throw new Error("not used");
        },
        generateStudyPlan: async () =>
          ok({
            assumptions: [],
            childTaskSummaries: ["Review coastal erosion with retrieval and explanation."],
            decisions: [],
            artifactContent: {
              summary: "A short coasts plan.",
              sessions: [
                {
                  day: "Monday",
                  minutes: 30,
                  topic: fixture.learningLoop.topic,
                  activity: "Explain one coastal erosion example.",
                  outcome: "Recall one example clearly."
                }
              ],
              checkpoints: ["Recall one erosion example without notes."],
              notes: []
            }
          })
      }
    ).execute({
      learnerName: fixture.workspace.learner.name,
      yearGroup: fixture.workspace.learner.yearGroup,
      objective: fixture.workspace.activeObjective,
      focusTopics: [fixture.learningLoop.topic],
      availableMinutesByDay: {
        Monday: 30,
        Tuesday: 30,
        Wednesday: 30,
        Thursday: 30,
        Friday: 30,
        Saturday: 60,
        Sunday: 0
      }
    });

    expect(studyPlan.ok).toBe(true);
    if (!studyPlan.ok) {
      return;
    }

    expect(studyPlan.value.masteryProfile?.topics).toEqual([
      expect.objectContaining({
        topic: fixture.learningLoop.topic,
        status: masteryStates[1]?.toSnapshot().status,
        score: masteryStates[1]?.toSnapshot().score
      })
    ]);
  });

  it("reloads canonical state from SQLite on a fresh repository instance and keeps projections canonical-first", async () => {
    const pathname = join(
      tmpdir(),
      `sherlock-canonical-reload-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`
    );
    const writerRepository = new SqliteLearningLoopRepository(pathname);
    const fixture = createCanonicalFixture(writerRepository);
    const stalePracticeActivity = PracticeActivity.create({
      workspaceId: fixture.workspace.id,
      learningLoopId: fixture.learningLoop.id,
      title: "Stale practice activity",
      targetKnowledgeGapIds: [fixture.knowledgeGap.id],
      learningObjectives: ["Stale objective from compatibility practice"],
      sourceMasterDataItemIds: [fixture.record.workspace.id as never],
      flashcardSet: {
        instructions: "Stale instructions from an older compatibility snapshot.",
        cards: [
          {
            id: "stale_card_1",
            front: "Stale compatibility front",
            back: "Stale compatibility back",
            topic: fixture.learningLoop.topic,
            knowledgeGapId: fixture.knowledgeGap.id,
            learningObjective: "Stale objective from compatibility practice",
            sourceMasterDataItemId: fixture.record.workspace.id as never,
            sourceVisibleSentence: "Stale compatibility sentence."
          }
        ]
      }
    });
    const staleMasteryProfile = MasteryProfile.create(fixture.learningLoop.id).recordTopicScore(
      fixture.learningLoop.topic,
      0.11
    );
    const loopWithStaleMasteryProfile = LearningLoop.rehydrate({
      ...fixture.learningLoop.toSnapshot(),
      masteryProfileId: staleMasteryProfile.id
    });
    const { evidence, masteryStates } = createFixtureEvidenceAndMastery(
      fixture,
      "2026-05-31T11:00:00.000Z"
    );

    writerRepository.saveRecord(
      fixture.key,
      createLearningLoopRecord({
        ...fixture.record,
        learningLoops: [loopWithStaleMasteryProfile],
        learnerEvidence: [evidence],
        masteryStates,
        masteryProfiles: [staleMasteryProfile],
        practiceActivities: [stalePracticeActivity]
      })
    );

    const readerRepository = new SqliteLearningLoopRepository(pathname);

    const resume = new LearningLoopController(readerRepository).get(fixture.learningLoop.id);
    expect(resume.ok).toBe(true);
    if (!resume.ok) {
      return;
    }

    expect(resume.value.loopBatch?.units[0]?.quickCheckQuestions[0]?.prompt).toBe(
      fixture.quickCheckVariant.toSnapshot().prompt
    );
    expect(resume.value.loopBatch?.units[0]?.reviewItems[0]?.prompt).toBe(
      fixture.reviewVariant.toSnapshot().prompt
    );
    expect(resume.value.masteryProfile?.topics).toEqual([
      expect.objectContaining({
        topic: fixture.learningLoop.topic,
        status: masteryStates[1]?.toSnapshot().status,
        score: masteryStates[1]?.toSnapshot().score
      })
    ]);

    const listedPractice = new PracticeActivityController(readerRepository).list(
      fixture.learningLoop.id
    );
    expect(listedPractice.ok).toBe(true);
    if (!listedPractice.ok) {
      return;
    }

    expect(listedPractice.value.practiceActivities[0]?.flashcardSet.cards[0]).toEqual(
      expect.objectContaining({
        front: fixture.reviewVariant.toSnapshot().prompt,
        back:
          fixture.reviewVariant.toSnapshot().expectedAnswer ??
          fixture.questionSeed.toSnapshot().answerModel
      })
    );
    expect(listedPractice.value.practiceActivities[0]?.flashcardSet.cards[0]?.front).not.toBe(
      "Stale compatibility front"
    );

    const studyPlan = await new StudyPlanController(
      readerRepository,
      undefined,
      undefined,
      {
        evaluateActiveReviewSession: () => {
          throw new Error("not used");
        },
        evaluateAssessmentAttempt: () => {
          throw new Error("not used");
        },
        generateInitialAssessment: () => {
          throw new Error("not used");
        },
        generatePracticeActivity: () => {
          throw new Error("not used");
        },
        interpretMasterData: () => {
          throw new Error("not used");
        },
        generateStudyPlan: async () =>
          ok({
            assumptions: [],
            childTaskSummaries: ["Review coastal erosion with retrieval and explanation."],
            decisions: [],
            artifactContent: {
              summary: "A short coasts plan.",
              sessions: [
                {
                  day: "Monday",
                  minutes: 30,
                  topic: fixture.learningLoop.topic,
                  activity: "Explain one coastal erosion example.",
                  outcome: "Recall one example clearly."
                }
              ],
              checkpoints: ["Recall one erosion example without notes."],
              notes: []
            }
          })
      }
    ).execute({
      learnerName: fixture.workspace.learner.name,
      yearGroup: fixture.workspace.learner.yearGroup,
      objective: fixture.workspace.activeObjective,
      focusTopics: [fixture.learningLoop.topic],
      availableMinutesByDay: {
        Monday: 30,
        Tuesday: 30,
        Wednesday: 30,
        Thursday: 30,
        Friday: 30,
        Saturday: 60,
        Sunday: 0
      }
    });

    expect(studyPlan.ok).toBe(true);
    if (!studyPlan.ok) {
      return;
    }

    expect(studyPlan.value.masteryProfile?.topics).toEqual([
      expect.objectContaining({
        topic: fixture.learningLoop.topic,
        status: masteryStates[1]?.toSnapshot().status,
        score: masteryStates[1]?.toSnapshot().score
      })
    ]);
  });

  it("preserves canonical entities across unrelated record rewrites", () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const fixture = saveCanonicalFixture(repository);
    const evidence = LearnerEvidence.rehydrate({
      id: "evidence_rewrite" as never,
      workspaceId: fixture.workspace.id,
      learningLoopId: fixture.learningLoop.id,
      loopUnitId: fixture.loopUnit.id,
      seedId: fixture.questionSeed.id,
      variantId: fixture.quickCheckVariant.id,
      sourceId: fixture.upload.source.id as never,
      responseText: "Waves wear away rock.",
      confidence: "medium",
      correctness: "correct",
      supportUsed: "independent",
      capturedAt: "2026-05-31T11:00:00.000Z"
    });
    const masteryState = MasteryState.create({
      learningLoopId: fixture.learningLoop.id,
      topic: fixture.learningLoop.topic,
      seedId: fixture.questionSeed.id,
      status: "developing",
      score: 0.61,
      lastReviewedAt: "2026-05-31T11:00:00.000Z",
      nextReviewAt: "2026-06-02T11:00:00.000Z"
    });

    repository.saveRecord(
      fixture.key,
      createLearningLoopRecord({
        ...fixture.record,
        learnerEvidence: [evidence],
        masteryStates: [masteryState]
      })
    );

    const beforeRewrite = repository.findRecord(fixture.key)!;
    const rewrittenWorkspace = Workspace.rehydrate({
      ...beforeRewrite.workspace.toSnapshot(),
      activeObjective: "A rewritten objective that should not affect canonical learning state."
    });
    repository.saveRecord(
      fixture.key,
      createLearningLoopRecord({
        ...beforeRewrite,
        workspace: rewrittenWorkspace
      } as LearningLoopRecord)
    );

    const afterRewrite = repository.findRecord(fixture.key)!;
    expect(afterRewrite.questionSeeds?.map((candidate) => candidate.id)).toEqual([
      fixture.questionSeed.id
    ]);
    expect(afterRewrite.questionVariants?.map((candidate) => candidate.id)).toEqual([
      fixture.quickCheckVariant.id,
      fixture.reviewVariant.id
    ]);
    expect(afterRewrite.loopUnits?.map((candidate) => candidate.id)).toEqual([fixture.loopUnit.id]);
    expect(afterRewrite.loopUnitQuestionAssignments?.map((candidate) => candidate.id)).toEqual([
      fixture.quickCheckAssignment.id,
      fixture.reviewAssignment.id
    ]);
    expect(afterRewrite.learnerEvidence?.map((candidate) => candidate.id)).toEqual([evidence.id]);
    expect(afterRewrite.masteryStates?.map((candidate) => candidate.id)).toEqual([
      masteryState.id
    ]);
  });

  it("replaces one loop without disturbing another learner's canonical rows", () => {
    const dbPath = join(
      tmpdir(),
      `sherlock-canonical-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`
    );
    const repository = new SqliteLearningLoopRepository(dbPath);
    const learnerAFixtureV1 = createCanonicalFixture(repository, "Coasts", "Learner A");
    const learnerAStateV1 = createFixtureEvidenceAndMastery(
      learnerAFixtureV1,
      "2026-05-31T11:00:00.000Z"
    );
    repository.saveRecord(
      learnerAFixtureV1.key,
      createLearningLoopRecord({
        ...learnerAFixtureV1.record,
        learnerEvidence: [learnerAStateV1.evidence],
        masteryStates: learnerAStateV1.masteryStates
      })
    );

    const learnerBFixture = createCanonicalFixture(repository, "Weather", "Learner B");
    const learnerBState = createFixtureEvidenceAndMastery(
      learnerBFixture,
      "2026-05-31T12:00:00.000Z"
    );
    repository.saveRecord(
      learnerBFixture.key,
      createLearningLoopRecord({
        ...learnerBFixture.record,
        learnerEvidence: [learnerBState.evidence],
        masteryStates: learnerBState.masteryStates
      })
    );

    const inspector = new DatabaseSync(dbPath);
    const learnerBRowsBefore = canonicalRowsForLearner(inspector, learnerBFixture.key.value);

    const learnerAFixtureV2 = createCanonicalFixture(repository, "Coasts", "Learner A");
    const learnerAStateV2 = createFixtureEvidenceAndMastery(
      learnerAFixtureV2,
      "2026-05-31T13:00:00.000Z"
    );
    const learnerAEvidenceSnapshot = learnerAStateV2.evidence.toSnapshot();
    const learnerASeedMasterySnapshot = learnerAStateV2.masteryStates[0]!.toSnapshot();
    const learnerATopicMasterySnapshot = learnerAStateV2.masteryStates[1]!.toSnapshot();
    const loopSnapshot = learnerAFixtureV2.learningLoop.toSnapshot();
    const loopUnitSnapshot = learnerAFixtureV2.loopUnit.toSnapshot();
    const questionSeedSnapshot = learnerAFixtureV2.questionSeed.toSnapshot();
    const quickCheckVariantSnapshot = learnerAFixtureV2.quickCheckVariant.toSnapshot();
    const reviewVariantSnapshot = learnerAFixtureV2.reviewVariant.toSnapshot();
    const quickCheckAssignmentSnapshot = learnerAFixtureV2.quickCheckAssignment.toSnapshot();
    const reviewAssignmentSnapshot = learnerAFixtureV2.reviewAssignment.toSnapshot();
    repository.saveRecord(
      learnerAFixtureV2.key,
      createLearningLoopRecord({
        ...learnerAFixtureV2.record,
        learnerEvidence: [learnerAStateV2.evidence],
        masteryStates: learnerAStateV2.masteryStates
      })
    );

    const learnerARowsAfter = canonicalRowsForLearner(inspector, learnerAFixtureV2.key.value);
    const learnerBRowsAfter = canonicalRowsForLearner(inspector, learnerBFixture.key.value);

    expect(learnerBRowsAfter).toEqual(learnerBRowsBefore);

    expect(
      inspector
        .prepare("select count(*) as count from loop_units where learning_loop_id = ?")
        .get(learnerAFixtureV1.learningLoop.id)
    ).toEqual({ count: 0 });
    expect(
      inspector
        .prepare(
          "select count(*) as count from loop_unit_question_assignments where loop_unit_id = ? or variant_id in (?, ?)"
        )
        .get(
          learnerAFixtureV1.loopUnit.id,
          learnerAFixtureV1.quickCheckVariant.id,
          learnerAFixtureV1.reviewVariant.id
        )
    ).toEqual({ count: 0 });
    expect(
      inspector
        .prepare(
          "select count(*) as count from question_variants where learning_loop_id = ? or seed_id = ?"
        )
        .get(learnerAFixtureV1.learningLoop.id, learnerAFixtureV1.questionSeed.id)
    ).toEqual({ count: 0 });
    expect(
      inspector
        .prepare(
          "select count(*) as count from question_seeds where id = ? or learning_loop_id = ?"
        )
        .get(learnerAFixtureV1.questionSeed.id, learnerAFixtureV1.learningLoop.id)
    ).toEqual({ count: 0 });
    expect(
      inspector
        .prepare(
          "select count(*) as count from learner_evidence where learning_loop_id = ? or loop_unit_id = ? or seed_id = ? or variant_id in (?, ?)"
        )
        .get(
          learnerAFixtureV1.learningLoop.id,
          learnerAFixtureV1.loopUnit.id,
          learnerAFixtureV1.questionSeed.id,
          learnerAFixtureV1.quickCheckVariant.id,
          learnerAFixtureV1.reviewVariant.id
        )
    ).toEqual({ count: 0 });
    expect(
      inspector
        .prepare(
          "select count(*) as count from mastery_states where learning_loop_id = ? or seed_id = ?"
        )
        .get(learnerAFixtureV1.learningLoop.id, learnerAFixtureV1.questionSeed.id)
    ).toEqual({ count: 0 });

    expect(learnerARowsAfter.learningLoops).toEqual([
      {
        id: loopSnapshot.id,
        workspace_id: learnerAFixtureV2.workspace.id,
        objective: loopSnapshot.objective,
        topic: loopSnapshot.topic,
        phase: loopSnapshot.phase,
        status: loopSnapshot.status,
        mastery_profile_id: null
      }
    ]);
    expect(learnerARowsAfter.loopUnits).toEqual([
      {
        id: loopUnitSnapshot.id,
        learning_loop_id: loopSnapshot.id,
        focus: loopUnitSnapshot.focus,
        state: loopUnitSnapshot.state,
        sequence: loopUnitSnapshot.sequence
      }
    ]);
    expect(learnerARowsAfter.assignments).toHaveLength(2);
    expect(learnerARowsAfter.assignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: quickCheckAssignmentSnapshot.id,
          learning_loop_id: loopSnapshot.id,
          loop_unit_id: loopUnitSnapshot.id,
          variant_id: quickCheckVariantSnapshot.id,
          purpose: "quick_check",
          sequence: quickCheckAssignmentSnapshot.sequence
        }),
        expect.objectContaining({
          id: reviewAssignmentSnapshot.id,
          learning_loop_id: loopSnapshot.id,
          loop_unit_id: loopUnitSnapshot.id,
          variant_id: reviewVariantSnapshot.id,
          purpose: "review",
          sequence: reviewAssignmentSnapshot.sequence
        })
      ])
    );
    expect(learnerARowsAfter.questionSeeds).toEqual([
      {
        id: questionSeedSnapshot.id,
        learning_loop_id: loopSnapshot.id,
        topic: questionSeedSnapshot.topic,
        focus: questionSeedSnapshot.focus,
        answer_model: questionSeedSnapshot.answerModel
      }
    ]);
    expect(learnerARowsAfter.questionVariants).toHaveLength(2);
    expect(learnerARowsAfter.questionVariants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: quickCheckVariantSnapshot.id,
          learning_loop_id: loopSnapshot.id,
          seed_id: questionSeedSnapshot.id,
          owner_id: loopUnitSnapshot.id,
          owner_kind: quickCheckVariantSnapshot.ownerKind,
          mode: quickCheckVariantSnapshot.mode,
          position: quickCheckVariantSnapshot.position
        }),
        expect.objectContaining({
          id: reviewVariantSnapshot.id,
          learning_loop_id: loopSnapshot.id,
          seed_id: questionSeedSnapshot.id,
          owner_id: loopUnitSnapshot.id,
          owner_kind: reviewVariantSnapshot.ownerKind,
          mode: reviewVariantSnapshot.mode,
          position: reviewVariantSnapshot.position
        })
      ])
    );
    expect(learnerARowsAfter.learnerEvidence).toHaveLength(1);
    expect(learnerARowsAfter.learnerEvidence[0]).toEqual(
      expect.objectContaining({
        id: learnerAStateV2.evidence.id,
        workspace_id: learnerAFixtureV2.workspace.id,
        learning_loop_id: loopSnapshot.id,
        loop_unit_id: loopUnitSnapshot.id,
        seed_id: questionSeedSnapshot.id,
        variant_id: quickCheckVariantSnapshot.id,
        correctness: learnerAEvidenceSnapshot.correctness,
        support_used: learnerAEvidenceSnapshot.supportUsed
      })
    );
    expect(learnerARowsAfter.masteryStates).toHaveLength(2);
    expect(learnerARowsAfter.masteryStates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: learnerASeedMasterySnapshot.id,
          learning_loop_id: loopSnapshot.id,
          topic: loopSnapshot.topic,
          seed_id: questionSeedSnapshot.id,
          status: learnerASeedMasterySnapshot.status,
          score: learnerASeedMasterySnapshot.score
        }),
        expect.objectContaining({
          id: learnerATopicMasterySnapshot.id,
          learning_loop_id: loopSnapshot.id,
          topic: loopSnapshot.topic,
          seed_id: null,
          status: learnerATopicMasterySnapshot.status,
          score: learnerATopicMasterySnapshot.score
        })
      ])
    );
  });
});
