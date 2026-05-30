import type {
  ActiveReviewItemResult,
  ReviewSchedule,
  ReviewScheduler
} from "../../domain/learning/ActiveReviewSession.js";

export class PracticeReviewSchedulingPolicy implements ReviewScheduler {
  schedule(input: {
    completedAt: string;
    existingSessionCount: number;
    itemResults: readonly ActiveReviewItemResult[];
  }): ReviewSchedule {
    const totalItems = input.itemResults.length;
    const correctCount = input.itemResults.filter((result) => result.correct).length;
    const highConfidenceCount = input.itemResults.filter(
      (result) => result.confidence === "high"
    ).length;
    const overconfidenceCount = input.itemResults.filter((result) => result.overconfidence).length;
    const lowConfidenceMissCount = input.itemResults.filter(
      (result) => !result.correct && result.confidence === "low"
    ).length;

    let reviewIntervalHours = 24;
    let easeSignal: ReviewSchedule["easeSignal"] = "steady";

    if (correctCount === totalItems && highConfidenceCount === totalItems) {
      easeSignal = "easy";
      reviewIntervalHours = input.existingSessionCount === 0 ? 72 : 96;
    } else if (overconfidenceCount > 0 || lowConfidenceMissCount > 0 || correctCount / totalItems < 0.6) {
      easeSignal = "hard";
      reviewIntervalHours = 12;
    }

    const nextReviewAt = new Date(
      new Date(input.completedAt).getTime() + reviewIntervalHours * 60 * 60 * 1000
    ).toISOString();

    return {
      easeSignal,
      nextReviewAt,
      reviewIntervalHours
    };
  }
}
