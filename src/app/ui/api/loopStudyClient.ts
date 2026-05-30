import type {
  AssessmentAttemptResponse,
  InitialAssessmentResponse
} from "../../../domain/study/AssessmentGeneration.js";
import type {
  MasterDataUploadResponse,
  UploadMasterDataCommand
} from "../../../domain/study/MasterDataUpload.js";
import type {
  CompletePracticeActivityCommand,
  PracticeActivityCompletionResponse,
  PracticeActivityResponse
} from "../../../domain/study/PracticeActivities.js";
import type { CreateStudyPlanCommand, StudyPlanResponse } from "../../../domain/study/StudyPlanning.js";

async function requestJson<TResponse>(url: string, init: RequestInit): Promise<TResponse> {
  const response = await fetch(url, init);
  const payload = (await response.json()) as { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed with status ${response.status}.`);
  }

  return payload as TResponse;
}

export async function uploadMasterData(
  apiBaseUrl: string,
  command: UploadMasterDataCommand
): Promise<MasterDataUploadResponse> {
  return requestJson<MasterDataUploadResponse>(`${apiBaseUrl}/v1/master-data`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(command)
  });
}

export async function generateInitialAssessment(
  apiBaseUrl: string,
  command: {
    learnerName: string;
    questionCount: number;
    topic: string;
    yearGroup: string;
  }
): Promise<InitialAssessmentResponse> {
  return requestJson<InitialAssessmentResponse>(`${apiBaseUrl}/v1/assessments/initial`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(command)
  });
}

export async function submitAssessmentAttempt(
  apiBaseUrl: string,
  command: {
    assessmentId: string;
    responses: readonly {
      answer: string;
      itemId: string;
    }[];
  }
): Promise<AssessmentAttemptResponse> {
  return requestJson<AssessmentAttemptResponse>(`${apiBaseUrl}/v1/assessments/attempts`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(command)
  });
}

export async function generateStudyPlan(
  apiBaseUrl: string,
  command: CreateStudyPlanCommand
): Promise<StudyPlanResponse> {
  return requestJson<StudyPlanResponse>(`${apiBaseUrl}/v1/study-plans`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(command)
  });
}

export async function generatePracticeActivity(
  apiBaseUrl: string,
  command: {
    cardCount: number;
    kind: "flashcard_set";
    learningLoopId: string;
  }
): Promise<PracticeActivityResponse> {
  return requestJson<PracticeActivityResponse>(
    `${apiBaseUrl}/v1/learning-loops/${command.learningLoopId}/practice-activities`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        kind: command.kind,
        cardCount: command.cardCount
      })
    }
  );
}

export async function completePracticeActivity(
  apiBaseUrl: string,
  command: CompletePracticeActivityCommand
): Promise<PracticeActivityCompletionResponse> {
  return requestJson<PracticeActivityCompletionResponse>(
    `${apiBaseUrl}/v1/practice-activities/${command.practiceActivityId}/completions`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        responses: command.responses
      })
    }
  );
}
