import { describe, expect, it } from "vitest";
import { StudyPlanController } from "../src/modules/planning/StudyPlanController.js";
import { studyDays } from "../src/domain/study/StudyPlanning.js";

describe("StudyPlanController", () => {
  it("returns a structured workspace snapshot", () => {
    const controller = new StudyPlanController();
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

    expect(result.value.tasks.length).toBe(4);
    expect(result.value.workPlan.stages.length).toBe(3);
    expect(result.value.artifact.type).toBe("study-plan");
    expect(result.value.artifact.content.sessions.length).toBe(6);
    expect(result.value.events.some((event) => event.type === "artifact.generated")).toBe(true);
  });
});
