import { describe, expect, it } from "vitest";
import { StudyPlanController } from "../src/modules/planning/StudyPlanController.js";
import { SqliteStudyPlanRepository } from "../src/modules/planning/StudyPlanRepository.js";
import { studyDays } from "../src/domain/study/StudySchedule.js";

describe("StudyPlanController", () => {
  it("returns a structured workspace snapshot with ordered lifecycle events", () => {
    const controller = new StudyPlanController(new SqliteStudyPlanRepository(":memory:"));
    const result = controller.execute({
      learnerName: "Year 7 learner",
      yearGroup: "Year 7",
      objective: "Build a weekly plan for fractions, forces, and French vocabulary.",
      focusTopics: ["fractions", "forces", "French vocabulary"],
      availableMinutesByDay: Object.fromEntries(
        studyDays.map((day) => [day, day === "Saturday" ? 60 : day === "Sunday" ? 0 : 30])
      ) as Record<(typeof studyDays)[number], number>
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const parentTask = result.value.tasks.find((task) => task.parentTaskId === undefined);
    const childTasks = result.value.tasks.filter((task) => task.parentTaskId !== undefined);

    expect(parentTask).toBeDefined();
    expect(childTasks).toHaveLength(3);
    expect(parentTask?.childTaskIds).toHaveLength(3);
    expect(parentTask?.dependencies).toEqual(childTasks.map((task) => task.id));
    expect(childTasks.every((task) => task.parentTaskId === parentTask?.id)).toBe(true);
    expect(result.value.artifact.provenance.controller).toBe("StudyPlanController");
    expect(result.value.artifact.provenance.assumptions).toHaveLength(3);
    expect(result.value.workPlan.assumptions).toHaveLength(3);
    expect(result.value.workspace.eventIds).toHaveLength(result.value.events.length);
    expect(result.value.blockedTaskIds).toHaveLength(0);
    expect(result.value.learningLoop.topic).toBe("fractions");
    expect(result.value.learningLoop.workPlanIds).toContain(result.value.workPlan.id);
    expect(result.value.learningLoop.artifactIds).toContain(result.value.artifact.id);
    expect(result.value.events.every((event) => event.workspaceId === result.value.workspace.id)).toBe(
      true
    );

    const eventTypes = result.value.events.map((event) => event.type);
    expect(eventTypes.indexOf("work-plan.created")).toBeLessThan(
      eventTypes.indexOf("work-plan.assumption-recorded")
    );
    expect(eventTypes.indexOf("artifact.generated")).toBeLessThan(
      eventTypes.indexOf("workspace.artifact-attached")
    );
    expect(eventTypes.indexOf("learning-loop.work-plan-attached")).toBeGreaterThan(
      eventTypes.indexOf("work-plan.created")
    );
    const artifactGeneratedEvent = result.value.events.find(
      (event) => event.type === "artifact.generated"
    );
    expect(artifactGeneratedEvent?.payload).toMatchObject({
      artifactId: result.value.artifact.id,
      taskId: parentTask?.id,
      version: 1
    });
  });
});
