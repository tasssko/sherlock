import { describe, expect, it } from "vitest";
import { LearningLoop } from "../src/domain/learning/LearningLoop.js";
import { createDomainEventRecorder } from "../src/domain/primitives/Event.js";
import { Workspace } from "../src/domain/primitives/Workspace.js";
import { InitialAssessmentController } from "../src/modules/assessment/InitialAssessmentController.js";
import { MasterDataUploadController } from "../src/modules/assessment/MasterDataUploadController.js";
import { LearningLoopSelector } from "../src/modules/learning/LearningLoopSelector.js";
import {
  createLearningLoopRecord,
  type LearningLoopRecord
} from "../src/modules/planning/LearningLoopRepository.js";
import { LearnerWorkspaceKey } from "../src/modules/planning/LearnerWorkspaceKey.js";
import { SqliteLearningLoopRepository } from "../src/modules/planning/SqliteLearningLoopRepository.js";

function createEmptyRecord(workspace: Workspace, learningLoops: readonly LearningLoop[] = []): LearningLoopRecord {
  return createLearningLoopRecord({
    workspace,
    tasks: [],
    workPlans: [],
    artifacts: [],
    events: [],
    learningLoops,
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
}

describe("Learning loop lifecycle", () => {
  it("rehydrates legacy snapshots as active when status is missing", () => {
    const workspace = Workspace.create({
      title: "Legacy loop workspace",
      learner: {
        name: "Legacy learner",
        yearGroup: "Year 7",
        availableMinutesByDay: {}
      },
      activeObjective: "Resume an older loop safely."
    });
    const events = createDomainEventRecorder(workspace.id);
    const loop = LearningLoop.create(
      {
        workspaceId: workspace.id,
        objective: "Build secure understanding in Coasts.",
        topic: "Coasts"
      },
      events
    );

    const legacySnapshot = {
      ...loop.toSnapshot(),
      status: undefined
    } as never;

    expect(LearningLoop.rehydrate(legacySnapshot).status).toBe("active");
  });

  it("supersedes a stranded same-topic loop before creating a fresh initial assessment loop", async () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const uploadController = new MasterDataUploadController(repository);
    const assessmentController = new InitialAssessmentController(repository);

    uploadController.execute({
      sourceName: "Coasts source",
      items: [
        {
          topic: "Coasts",
          prompt: "What is the coast?",
          canonicalAnswer: "The land that meets the sea.",
          visibleMaterial: "The coast is where the land meets the sea."
        }
      ]
    });

    const workspace = Workspace.create({
      title: "Year 7 learner Study Workspace",
      learner: {
        name: "Year 7 learner",
        yearGroup: "Year 7",
        availableMinutesByDay: {}
      },
      activeObjective: "Diagnose and improve Coasts."
    });
    const loopEvents = createDomainEventRecorder(workspace.id);
    const strandedLoop = LearningLoop.rehydrate({
      ...LearningLoop.create(
        {
          workspaceId: workspace.id,
          objective: "Old stranded Coasts loop.",
          topic: "Coasts"
        },
        loopEvents
      ).toSnapshot(),
      phase: "study-planning",
      status: "active",
      workPlanIds: []
    });
    const key = LearnerWorkspaceKey.fromLearner("Year 7 learner", "Year 7");
    repository.saveRecord(key, createEmptyRecord(workspace, [strandedLoop]));

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

    expect(assessment.value.learningLoop.id).not.toBe(strandedLoop.id);
    expect(assessment.value.events.map((event) => event.type)).toContain("learning-loop.superseded");

    const savedRecord = repository.findRecord(key);
    expect(savedRecord).toBeDefined();
    if (!savedRecord) {
      return;
    }

    const coastsLoops = savedRecord.learningLoops.filter((candidate) => candidate.topic === "Coasts");
    expect(coastsLoops).toHaveLength(2);
    expect(coastsLoops.find((candidate) => candidate.id === strandedLoop.id)?.status).toBe(
      "superseded"
    );
    expect(coastsLoops.find((candidate) => candidate.id === assessment.value.learningLoop.id)?.status).toBe(
      "active"
    );
  });

  it("prefers the latest active loop and ignores superseded or completed loops", () => {
    const workspace = Workspace.create({
      title: "Selector workspace",
      learner: {
        name: "Selector learner",
        yearGroup: "Year 7",
        availableMinutesByDay: {}
      },
      activeObjective: "Choose the right loop."
    });
    const events = createDomainEventRecorder(workspace.id);
    const selector = new LearningLoopSelector();

    const activeLoop = LearningLoop.create(
      {
        workspaceId: workspace.id,
        objective: "Use this loop.",
        topic: "Coasts"
      },
      events
    );
    const supersededLoop = LearningLoop.rehydrate({
      ...LearningLoop.create(
        {
          workspaceId: workspace.id,
          objective: "Ignore this superseded loop.",
          topic: "Coasts"
        },
        events
      ).toSnapshot(),
      status: "superseded"
    });
    const completedLoop = LearningLoop.rehydrate({
      ...LearningLoop.create(
        {
          workspaceId: workspace.id,
          objective: "Ignore this completed loop.",
          topic: "Coasts"
        },
        events
      ).toSnapshot(),
      status: "completed"
    });

    const selected = selector.findByTopic(
      createEmptyRecord(workspace, [activeLoop, supersededLoop, completedLoop]),
      "Coasts"
    );

    expect(selected?.id).toBe(activeLoop.id);
  });
});
