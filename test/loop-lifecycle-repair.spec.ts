import { describe, expect, it } from "vitest";
import { LearningLoop } from "../src/domain/learning/LearningLoop.js";
import { createDomainEventRecorder } from "../src/domain/primitives/Event.js";
import { Workspace } from "../src/domain/primitives/Workspace.js";
import {
  findStrandedLearningLoops,
  supersedeLearningLoop
} from "../src/modules/learning/LoopLifecycleRepair.js";
import { createLearningLoopRecord } from "../src/modules/planning/LearningLoopRepository.js";
import { LearnerWorkspaceKey } from "../src/modules/planning/LearnerWorkspaceKey.js";

describe("LoopLifecycleRepair", () => {
  it("finds stranded legacy study-planning loops", () => {
    const workspace = Workspace.create({
      title: "Repair workspace",
      learner: {
        name: "Repair learner",
        yearGroup: "Year 7",
        availableMinutesByDay: {}
      },
      activeObjective: "Repair stale loops."
    });
    const events = createDomainEventRecorder(workspace.id);
    const strandedLoop = LearningLoop.rehydrate({
      ...LearningLoop.create(
        {
          workspaceId: workspace.id,
          objective: "Old stranded loop.",
          topic: "Coasts"
        },
        events
      ).toSnapshot(),
      phase: "study-planning",
      workPlanIds: []
    });
    const healthyLoop = LearningLoop.create(
      {
        workspaceId: workspace.id,
        objective: "Healthy loop.",
        topic: "Fractions"
      },
      events
    );
    const record = createLearningLoopRecord({
      workspace,
      tasks: [],
      workPlans: [],
      artifacts: [],
      events: [],
      learningLoops: [strandedLoop, healthyLoop],
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

    const candidates = findStrandedLearningLoops(
      LearnerWorkspaceKey.fromLearner("Repair learner", "Year 7"),
      record
    );

    expect(candidates).toEqual([
      expect.objectContaining({
        learningLoopId: strandedLoop.id,
        topic: "Coasts",
        phase: "study-planning"
      })
    ]);
  });

  it("supersedes the selected loop and records a lifecycle event", () => {
    const workspace = Workspace.create({
      title: "Repair workspace",
      learner: {
        name: "Repair learner",
        yearGroup: "Year 7",
        availableMinutesByDay: {}
      },
      activeObjective: "Repair stale loops."
    });
    const events = createDomainEventRecorder(workspace.id);
    const loop = LearningLoop.create(
      {
        workspaceId: workspace.id,
        objective: "Supersede this loop.",
        topic: "Coasts"
      },
      events
    );
    const record = createLearningLoopRecord({
      workspace,
      tasks: [],
      workPlans: [],
      artifacts: [],
      events: [],
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

    const repaired = supersedeLearningLoop(record, loop.id);

    expect(repaired.ok).toBe(true);
    if (!repaired.ok) {
      return;
    }

    expect(repaired.value.learningLoops[0]?.status).toBe("superseded");
    expect(repaired.value.events.map((event) => event.type)).toContain("learning-loop.superseded");
    expect(repaired.value.workspace.toSnapshot().eventIds.length).toBe(1);
  });
});
