import type { CreateStudyPlanCommand, StudyPlanResponse } from "../../../domain/study/StudyPlanning.js";
import { studyDays, type StudyDay } from "../../../domain/study/StudySchedule.js";

export interface StudyPlanRequestFormValues {
  learnerName: string;
  yearGroup: string;
  objective: string;
  topics: string;
  minutes: Record<StudyDay, number>;
}

function createCommand(values: StudyPlanRequestFormValues): CreateStudyPlanCommand {
  return {
    learnerName: values.learnerName,
    yearGroup: values.yearGroup,
    objective: values.objective,
    focusTopics: values.topics
      .split(",")
      .map((topic) => topic.trim())
      .filter(Boolean),
    availableMinutesByDay: studyDays.reduce(
      (minutesByDay, day) => ({
        ...minutesByDay,
        [day]: values.minutes[day]
      }),
      {} as Record<StudyDay, number>
    )
  };
}

export async function requestStudyPlan(
  apiBaseUrl: string,
  values: StudyPlanRequestFormValues
): Promise<StudyPlanResponse> {
  const response = await fetch(`${apiBaseUrl}/v1/study-plans`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(createCommand(values))
  });

  if (!response.ok) {
    const payload = (await response.json()) as { error?: string };
    throw new Error(payload.error ?? "Request failed.");
  }

  return (await response.json()) as StudyPlanResponse;
}

