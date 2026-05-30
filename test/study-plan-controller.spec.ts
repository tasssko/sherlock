import { describe, expect, it } from "vitest";
import { StudyPlanController } from "../src/modules/planning/StudyPlanController.js";
import { SqliteLearningLoopRepository } from "../src/modules/planning/SqliteLearningLoopRepository.js";
import { InitialAssessmentController } from "../src/modules/assessment/InitialAssessmentController.js";
import { AssessmentAttemptController } from "../src/modules/assessment/AssessmentAttemptController.js";
import { MasterDataUploadController } from "../src/modules/assessment/MasterDataUploadController.js";
import { studyDays } from "../src/domain/study/StudySchedule.js";

describe("StudyPlanController", () => {
  it("requires an existing diagnosed learning loop before adapting a study plan", async () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const controller = new StudyPlanController(repository);

    const result = await controller.execute({
      learnerName: "Year 7 learner",
      yearGroup: "Year 7",
      objective: "Build a weekly plan for fractions.",
      focusTopics: ["fractions"],
      availableMinutesByDay: Object.fromEntries(
        studyDays.map((day) => [day, day === "Saturday" ? 60 : 30])
      ) as Record<(typeof studyDays)[number], number>
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("NOT_FOUND");
    expect(result.error.message).toContain("learning loop must exist");
  });

  it("returns a structured workspace snapshot with ordered lifecycle events", async () => {
    const repository = new SqliteLearningLoopRepository(":memory:");
    const uploadController = new MasterDataUploadController(repository);
    const assessmentController = new InitialAssessmentController(repository);
    const attemptController = new AssessmentAttemptController(repository);
    const controller = new StudyPlanController(repository);

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

    const result = await controller.execute({
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
    expect(result.value.workspace.eventIds.slice(-result.value.events.length)).toEqual(
      result.value.events.map((event) => event.id)
    );
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
    expect(eventTypes).not.toContain("learning-loop.created");
    expect(eventTypes).toContain("study-plan.adapted");
    const artifactGeneratedEvent = result.value.events.find(
      (event) => event.type === "artifact.generated"
    );
    const adaptedEvent = result.value.events.find((event) => event.type === "study-plan.adapted");
    expect(artifactGeneratedEvent?.payload).toMatchObject({
      artifactId: result.value.artifact.id,
      taskId: parentTask?.id,
      version: 1
    });
    expect(adaptedEvent?.payload).toMatchObject({
      learningLoopId: result.value.learningLoop.id,
      workPlanId: result.value.workPlan.id,
      artifactId: result.value.artifact.id,
      diagnosedGapCount: 1
    });
  });
});
