import { describe, expect, it } from "vitest";
import { ActiveReviewSession } from "../src/domain/learning/ActiveReviewSession.js";
import { Assessment, Attempt, Evaluation } from "../src/domain/learning/Assessment.js";
import { LearningLoopBatch } from "../src/domain/learning/LearningLoopBatch.js";
import {
  KnowledgeGap,
  LearningLoop,
  MasteryProfile
} from "../src/domain/learning/LearningLoop.js";
import { PracticeActivity } from "../src/domain/learning/PracticeActivity.js";
import { Artifact } from "../src/domain/primitives/Artifact.js";
import { createDomainEventRecorder, type DomainEvent } from "../src/domain/primitives/Event.js";
import { Task } from "../src/domain/primitives/Task.js";
import { WorkPlan } from "../src/domain/primitives/WorkPlan.js";
import { Workspace } from "../src/domain/primitives/Workspace.js";
import { LearnerWorkspaceKey } from "../src/modules/planning/LearnerWorkspaceKey.js";
import { RuntimeConversationBinding } from "../src/modules/runtime/RuntimeConversationBinding.js";
import { RuntimeTrace } from "../src/modules/runtime/RuntimeTrace.js";
import {
  clearAllLearningLoops,
  findPurgeableLearningLoops,
  purgeLearningLoops
} from "../src/modules/learning/LoopLifecyclePurge.js";
import { createLearningLoopRecord } from "../src/modules/planning/LearningLoopRepository.js";

describe("LoopLifecyclePurge", () => {
  it("finds non-active loops as purge candidates", () => {
    const workspace = Workspace.create({
      title: "Purge workspace",
      learner: {
        name: "Purge learner",
        yearGroup: "Year 7",
        availableMinutesByDay: {}
      },
      activeObjective: "Keep active loops only."
    });
    const events = createDomainEventRecorder(workspace.id);
    const activeLoop = LearningLoop.create(
      {
        workspaceId: workspace.id,
        objective: "Keep this active loop.",
        topic: "Fractions"
      },
      events
    );
    const completedLoop = LearningLoop.rehydrate({
      ...LearningLoop.create(
        {
          workspaceId: workspace.id,
          objective: "Purge this completed loop.",
          topic: "Coasts"
        },
        events
      ).toSnapshot(),
      status: "completed"
    });
    const record = createLearningLoopRecord({
      workspace,
      tasks: [],
      workPlans: [],
      artifacts: [],
      events: [],
      learningLoops: [activeLoop, completedLoop],
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
    });

    const candidates = findPurgeableLearningLoops(
      LearnerWorkspaceKey.fromLearner("Purge learner", "Year 7"),
      record
    );

    expect(candidates).toEqual([
      expect.objectContaining({
        learningLoopId: completedLoop.id,
        status: "completed",
        topic: "Coasts"
      })
    ]);
  });

  it("purges a completed loop and its dependent records while keeping the active loop intact", () => {
    const workspace = Workspace.create({
      title: "Purge workspace",
      learner: {
        name: "Purge learner",
        yearGroup: "Year 7",
        availableMinutesByDay: {}
      },
      activeObjective: "Keep active loops only."
    });
    const events = createDomainEventRecorder(workspace.id);
    const activeLoop = LearningLoop.create(
      {
        workspaceId: workspace.id,
        objective: "Keep this active loop.",
        topic: "Fractions",
        sourceIds: ["source_keep" as never]
      },
      events
    );
    const purgedLoop = LearningLoop.rehydrate({
      ...LearningLoop.create(
        {
          workspaceId: workspace.id,
          objective: "Purge this completed loop.",
          topic: "Coasts",
          sourceIds: ["source_purge" as never]
        },
        events
      ).toSnapshot(),
      status: "completed",
      phase: "mastery-tracking",
      assessmentIds: ["assessment_purge" as never],
      attemptIds: ["attempt_purge" as never],
      evaluationIds: ["evaluation_purge" as never],
      knowledgeGapIds: ["gap_purge" as never],
      workPlanIds: ["workplan_purge" as never],
      artifactIds: ["artifact_purge" as never],
      practiceActivityIds: ["practice_purge" as never],
      activeReviewSessionIds: ["review_purge" as never],
      masteryProfileId: "mastery_purge" as never
    });

    const keptTask = Task.rehydrate({
      id: "task_keep" as never,
      workspaceId: workspace.id,
      title: "Keep task",
      kind: "assessment",
      state: "completed",
      childTaskIds: [],
      dependencies: [],
      input: { objective: "Keep", facts: [] },
      output: { artifactIds: ["artifact_keep" as never], summary: "keep" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    const purgedTask = Task.rehydrate({
      id: "task_purge" as never,
      workspaceId: workspace.id,
      title: "Purge task",
      kind: "practice-activity",
      state: "completed",
      childTaskIds: [],
      dependencies: [],
      input: { objective: "Purge", facts: [] },
      output: { artifactIds: ["artifact_purge" as never], summary: "purge" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const keptArtifact = Artifact.rehydrate({
      id: "artifact_keep" as never,
      workspaceId: workspace.id,
      taskId: keptTask.id,
      type: "assessment",
      content: { summary: "keep" },
      provenance: {
        controller: "Test",
        taskId: keptTask.id,
        sourceArtifactIds: [],
        sourceTopics: [],
        facts: [],
        assumptions: [],
        decisions: []
      },
      version: 1,
      createdAt: new Date().toISOString()
    });
    const purgedArtifact = Artifact.rehydrate({
      id: "artifact_purge" as never,
      workspaceId: workspace.id,
      taskId: purgedTask.id,
      type: "study-plan",
      content: { summary: "purge" },
      provenance: {
        controller: "Test",
        taskId: purgedTask.id,
        sourceArtifactIds: [],
        sourceTopics: [],
        facts: [],
        assumptions: [],
        decisions: []
      },
      version: 1,
      createdAt: new Date().toISOString()
    });

    const keptWorkPlan = WorkPlan.rehydrate({
      id: "workplan_keep" as never,
      workspaceId: workspace.id,
      objective: "Keep work plan",
      facts: [],
      assumptions: [],
      requiredCapabilities: [],
      stages: [{ id: "1", title: "Keep", objective: "Keep", taskIds: [keptTask.id] }],
      acceptanceCriteria: [],
      artifactIds: [keptArtifact.id],
      createdAt: new Date().toISOString()
    });
    const purgedWorkPlan = WorkPlan.rehydrate({
      id: "workplan_purge" as never,
      workspaceId: workspace.id,
      objective: "Purge work plan",
      facts: [],
      assumptions: [],
      requiredCapabilities: [],
      stages: [{ id: "1", title: "Purge", objective: "Purge", taskIds: [purgedTask.id] }],
      acceptanceCriteria: [],
      artifactIds: [purgedArtifact.id],
      createdAt: new Date().toISOString()
    });

    const keptAssessment = Assessment.rehydrate({
      id: "assessment_keep" as never,
      workspaceId: workspace.id,
      learningLoopId: activeLoop.id,
      kind: "initial-diagnostic",
      topic: "fractions",
      itemIds: [],
      sourceMasterDataItemIds: [],
      items: [],
      createdAt: new Date().toISOString()
    });
    const purgedAssessment = Assessment.rehydrate({
      id: "assessment_purge" as never,
      workspaceId: workspace.id,
      learningLoopId: purgedLoop.id,
      kind: "initial-diagnostic",
      topic: "coasts",
      itemIds: [],
      sourceMasterDataItemIds: [],
      items: [],
      artifactId: purgedArtifact.id,
      createdAt: new Date().toISOString()
    });

    const keptAttempt = Attempt.rehydrate({
      id: "attempt_keep" as never,
      workspaceId: workspace.id,
      assessmentId: keptAssessment.id,
      responses: [],
      submittedAt: new Date().toISOString()
    });
    const purgedAttempt = Attempt.rehydrate({
      id: "attempt_purge" as never,
      workspaceId: workspace.id,
      assessmentId: purgedAssessment.id,
      responses: [],
      submittedAt: new Date().toISOString()
    });

    const keptEvaluation = Evaluation.rehydrate({
      id: "evaluation_keep" as never,
      workspaceId: workspace.id,
      assessmentId: keptAssessment.id,
      attemptId: keptAttempt.id,
      score: 1,
      itemResults: [],
      createdAt: new Date().toISOString()
    });
    const purgedEvaluation = Evaluation.rehydrate({
      id: "evaluation_purge" as never,
      workspaceId: workspace.id,
      assessmentId: purgedAssessment.id,
      attemptId: purgedAttempt.id,
      score: 0,
      itemResults: [],
      createdAt: new Date().toISOString()
    });

    const keptGap = KnowledgeGap.rehydrate({
      id: "gap_keep" as never,
      learningLoopId: activeLoop.id,
      topic: "fractions",
      description: "keep",
      evidence: "keep",
      severity: "medium",
      createdAt: new Date().toISOString()
    });
    const purgedGap = KnowledgeGap.rehydrate({
      id: "gap_purge" as never,
      learningLoopId: purgedLoop.id,
      topic: "coasts",
      description: "purge",
      evidence: "purge",
      severity: "high",
      createdAt: new Date().toISOString()
    });

    const keptMastery = MasteryProfile.rehydrate({
      id: "mastery_keep" as never,
      learningLoopId: activeLoop.id,
      topics: [{ topic: "fractions", score: 0.6, status: "developing" }],
      updatedAt: new Date().toISOString()
    });
    const purgedMastery = MasteryProfile.rehydrate({
      id: "mastery_purge" as never,
      learningLoopId: purgedLoop.id,
      topics: [{ topic: "coasts", score: 1, status: "secure" }],
      updatedAt: new Date().toISOString()
    });

    const keptPractice = PracticeActivity.rehydrate({
      id: "practice_keep" as never,
      workspaceId: workspace.id,
      learningLoopId: activeLoop.id,
      kind: "flashcard_set",
      title: "Keep practice",
      targetKnowledgeGapIds: ["gap_keep" as never],
      learningObjectives: ["Keep objective"],
      sourceMasterDataItemIds: ["item_keep" as never],
      reviewSessionIds: ["review_keep" as never],
      nextReviewAt: new Date().toISOString(),
      reviewIntervalHours: 24,
      easeSignal: "steady",
      flashcardSet: { instructions: "Keep", cards: [] },
      createdAt: new Date().toISOString()
    });
    const purgedPractice = PracticeActivity.rehydrate({
      id: "practice_purge" as never,
      workspaceId: workspace.id,
      learningLoopId: purgedLoop.id,
      kind: "flashcard_set",
      title: "Purge practice",
      taskId: purgedTask.id,
      targetKnowledgeGapIds: ["gap_purge" as never],
      learningObjectives: ["Purge objective"],
      sourceMasterDataItemIds: ["item_purge" as never],
      reviewSessionIds: ["review_purge" as never],
      nextReviewAt: new Date().toISOString(),
      reviewIntervalHours: 24,
      easeSignal: "steady",
      flashcardSet: { instructions: "Purge", cards: [] },
      createdAt: new Date().toISOString()
    });

    const keptReview = ActiveReviewSession.rehydrate({
      id: "review_keep" as never,
      workspaceId: workspace.id,
      learningLoopId: activeLoop.id,
      practiceActivityId: keptPractice.id,
      kind: "flashcard_set",
      completedAt: new Date().toISOString(),
      itemResults: [],
      masteryScore: 1,
      confidenceScore: 1,
      remainingKnowledgeGapIds: [],
      reviewIntervalHours: 24,
      nextReviewAt: new Date().toISOString(),
      easeSignal: "easy",
      evidenceSummary: "keep"
    });
    const purgedReview = ActiveReviewSession.rehydrate({
      id: "review_purge" as never,
      workspaceId: workspace.id,
      learningLoopId: purgedLoop.id,
      practiceActivityId: purgedPractice.id,
      kind: "flashcard_set",
      completedAt: new Date().toISOString(),
      itemResults: [],
      masteryScore: 0,
      confidenceScore: 0,
      remainingKnowledgeGapIds: ["gap_purge" as never],
      reviewIntervalHours: 24,
      nextReviewAt: new Date().toISOString(),
      easeSignal: "hard",
      evidenceSummary: "purge"
    });

    const keptBatch = LearningLoopBatch.rehydrate({
      id: "batch_keep" as never,
      learningLoopId: activeLoop.id,
      overview: "Keep batch",
      targetDurationMinutes: 10,
      createdAt: new Date().toISOString(),
      units: []
    });
    const purgedBatch = LearningLoopBatch.rehydrate({
      id: "batch_purge" as never,
      learningLoopId: purgedLoop.id,
      overview: "Purge batch",
      targetDurationMinutes: 10,
      createdAt: new Date().toISOString(),
      units: [
        {
          id: "1" as never,
          focus: "Coasts",
          reason: "purge",
          objectiveRefs: [],
          sourceRefs: [],
          shortExplanation: "purge",
          learnerTask: "purge",
          targetKnowledgeGapIds: ["gap_purge" as never],
          state: "completed",
          quickCheckQuestions: [],
          reviewItems: []
        }
      ]
    });

    const keptBinding = RuntimeConversationBinding.create({
      learningLoopId: activeLoop.id,
      profileId: "default",
      relayConversationId: "conv_keep",
      workspaceId: workspace.id
    });
    const purgedBinding = RuntimeConversationBinding.create({
      learningLoopId: purgedLoop.id,
      profileId: "default",
      relayConversationId: "conv_purge",
      workspaceId: workspace.id
    });

    const keptTrace = RuntimeTrace.succeed({
      producedDomainIds: [keptAssessment.id],
      seed: { provider: "fixture", operation: "generateInitialAssessment" }
    });
    const purgedTrace = RuntimeTrace.succeed({
      producedDomainIds: [purgedAssessment.id, purgedLoop.id],
      seed: { provider: "fixture", operation: "generateInitialAssessment" }
    });

    const eventsRecord: DomainEvent[] = [
      {
        id: "event_keep" as never,
        workspaceId: workspace.id,
        type: "learning-loop.created",
        occurredAt: new Date().toISOString(),
        payload: { learningLoopId: activeLoop.id, phase: activeLoop.phase, topic: activeLoop.topic }
      },
      {
        id: "event_purge" as never,
        workspaceId: workspace.id,
        type: "learning-loop.completed",
        occurredAt: new Date().toISOString(),
        payload: { learningLoopId: purgedLoop.id, topic: purgedLoop.topic }
      }
    ];

    const rebuiltWorkspace = Workspace.rehydrate({
      ...workspace.toSnapshot(),
      taskIds: [keptTask.id, purgedTask.id],
      workPlanIds: [keptWorkPlan.id, purgedWorkPlan.id],
      artifactIds: [keptArtifact.id, purgedArtifact.id],
      eventIds: eventsRecord.map((event) => event.id)
    });

    const record = createLearningLoopRecord({
      workspace: rebuiltWorkspace,
      tasks: [keptTask, purgedTask],
      workPlans: [keptWorkPlan, purgedWorkPlan],
      artifacts: [keptArtifact, purgedArtifact],
      events: eventsRecord,
      learningLoops: [activeLoop, purgedLoop],
      assessments: [keptAssessment, purgedAssessment],
      attempts: [keptAttempt, purgedAttempt],
      evaluations: [keptEvaluation, purgedEvaluation],
      knowledgeGaps: [keptGap, purgedGap],
      masteryProfiles: [keptMastery, purgedMastery],
      practiceActivities: [keptPractice, purgedPractice],
      activeReviewSessions: [keptReview, purgedReview],
      loopBatches: [keptBatch, purgedBatch],
      runtimeConversationBindings: [keptBinding, purgedBinding],
      runtimeTraces: [keptTrace, purgedTrace]
    });

    const purged = purgeLearningLoops(record, [purgedLoop.id]);

    expect(purged.ok).toBe(true);
    if (!purged.ok) {
      return;
    }

    expect(purged.value.learningLoops.map((loop) => loop.id)).toEqual([activeLoop.id]);
    expect(purged.value.assessments.map((assessment) => assessment.id)).toEqual([keptAssessment.id]);
    expect(purged.value.attempts.map((attempt) => attempt.id)).toEqual([keptAttempt.id]);
    expect(purged.value.evaluations.map((evaluation) => evaluation.id)).toEqual([keptEvaluation.id]);
    expect(purged.value.knowledgeGaps.map((gap) => gap.id)).toEqual([keptGap.id]);
    expect(purged.value.masteryProfiles.map((profile) => profile.id)).toEqual([keptMastery.id]);
    expect(purged.value.practiceActivities.map((activity) => activity.id)).toEqual([keptPractice.id]);
    expect(purged.value.activeReviewSessions.map((session) => session.id)).toEqual([keptReview.id]);
    expect(purged.value.loopBatches.map((batch) => batch.id)).toEqual([keptBatch.id]);
    expect(purged.value.runtimeConversationBindings.map((binding) => binding.learningLoopId)).toEqual([
      activeLoop.id
    ]);
    expect(purged.value.runtimeTraces).toHaveLength(1);
    expect(purged.value.tasks.map((task) => task.id)).toEqual([keptTask.id]);
    expect(purged.value.workPlans.map((workPlan) => workPlan.id)).toEqual([keptWorkPlan.id]);
    expect(purged.value.artifacts.map((artifact) => artifact.id)).toEqual([keptArtifact.id]);
    expect(purged.value.events.map((event) => event.id)).toEqual(["event_keep"]);
    expect(purged.value.workspace.toSnapshot().taskIds).toEqual([keptTask.id]);
    expect(purged.value.workspace.toSnapshot().workPlanIds).toEqual([keptWorkPlan.id]);
    expect(purged.value.workspace.toSnapshot().artifactIds).toEqual([keptArtifact.id]);
    expect(purged.value.workspace.toSnapshot().eventIds).toEqual(["event_keep"]);
  });

  it("clears all loops and loop-owned records while keeping the learner workspace", () => {
    const workspace = Workspace.create({
      title: "Clear workspace",
      learner: {
        name: "Clear learner",
        yearGroup: "Year 7",
        availableMinutesByDay: {}
      },
      activeObjective: "Reset this learner."
    });
    const events = createDomainEventRecorder(workspace.id);
    const loop = LearningLoop.create(
      {
        workspaceId: workspace.id,
        objective: "Clear this loop.",
        topic: "Weather"
      },
      events
    );
    const task = Task.rehydrate({
      id: "task_clear" as never,
      workspaceId: workspace.id,
      title: "Clear task",
      kind: "assessment",
      state: "completed",
      childTaskIds: [],
      dependencies: [],
      input: { objective: "Clear", facts: [] },
      output: { artifactIds: ["artifact_clear" as never], summary: "clear" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    const artifact = Artifact.rehydrate({
      id: "artifact_clear" as never,
      workspaceId: workspace.id,
      taskId: task.id,
      type: "assessment",
      content: { summary: "clear" },
      provenance: {
        controller: "Test",
        taskId: task.id,
        sourceArtifactIds: [],
        sourceTopics: [],
        facts: [],
        assumptions: [],
        decisions: []
      },
      version: 1,
      createdAt: new Date().toISOString()
    });
    const rebuiltWorkspace = Workspace.rehydrate({
      ...workspace.toSnapshot(),
      taskIds: [task.id],
      artifactIds: [artifact.id],
      eventIds: ["event_clear" as never]
    });

    const record = createLearningLoopRecord({
      workspace: rebuiltWorkspace,
      tasks: [task],
      workPlans: [],
      artifacts: [artifact],
      events: [
        {
          id: "event_clear" as never,
          workspaceId: workspace.id,
          type: "learning-loop.created",
          occurredAt: new Date().toISOString(),
          payload: { learningLoopId: loop.id, phase: loop.phase, topic: loop.topic }
        }
      ],
      learningLoops: [loop],
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
    });

    const cleared = clearAllLearningLoops(record);

    expect(cleared.learningLoops).toEqual([]);
    expect(cleared.tasks).toEqual([]);
    expect(cleared.artifacts).toEqual([]);
    expect(cleared.events).toEqual([]);
    expect(cleared.workspace.toSnapshot().title).toBe(workspace.title);
    expect(cleared.workspace.toSnapshot().learner.name).toBe(workspace.learner.name);
    expect(cleared.workspace.toSnapshot().taskIds).toEqual([]);
    expect(cleared.workspace.toSnapshot().artifactIds).toEqual([]);
    expect(cleared.workspace.toSnapshot().eventIds).toEqual([]);
  });
});
