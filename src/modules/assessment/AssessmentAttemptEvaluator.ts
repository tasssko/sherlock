import { Attempt, Evaluation } from "../../domain/learning/Assessment.js";
import { KnowledgeGap } from "../../domain/learning/LearningLoop.js";
import type { DomainEventRecorder } from "../../domain/primitives/Event.js";
import { err, ok, type Result } from "../../domain/primitives/result.js";
import type { SubmitAssessmentAttemptCommand } from "../../domain/study/AssessmentGeneration.js";
import type { Assessment } from "../../domain/learning/Assessment.js";
import type { LearningLoop } from "../../domain/learning/LearningLoop.js";

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface AssessmentAttemptEvaluation {
  attempt: Attempt;
  evaluation: Evaluation;
  knowledgeGaps: readonly KnowledgeGap[];
  learningLoop: LearningLoop;
}

export class AssessmentAttemptEvaluator {
  evaluate(input: {
    assessment: Assessment;
    command: SubmitAssessmentAttemptCommand;
    events: DomainEventRecorder;
    learningLoop: LearningLoop;
  }): Result<AssessmentAttemptEvaluation> {
    const assessmentSnapshot = input.assessment.toSnapshot();
    const responseByItemId = new Map(input.command.responses.map((response) => [response.itemId, response.answer]));

    if (responseByItemId.size === 0) {
      return err({
        code: "VALIDATION_ERROR",
        message: "At least one assessment response is required."
      });
    }

    const attempt = Attempt.create(
      input.assessment.workspaceId,
      input.assessment.id,
      input.command.responses,
      input.events
    );
    const itemResults = assessmentSnapshot.items.map((item) => {
      const answer = responseByItemId.get(item.id) ?? "";
      const correct = normalize(answer) === normalize(item.canonicalAnswer);

      return {
        itemId: item.id,
        correct,
        feedback: correct
          ? `Secure response for ${item.topic}.`
          : `Review the underlying idea for ${item.topic} and revisit the missed method.`,
        topic: item.topic
      };
    });
    const correctCount = itemResults.filter((result) => result.correct).length;
    const score = itemResults.length === 0 ? 0 : correctCount / itemResults.length;
    const evaluation = Evaluation.create(
      {
        workspaceId: input.assessment.workspaceId,
        assessmentId: input.assessment.id,
        attemptId: attempt.id,
        score,
        itemResults
      },
      input.events
    );

    let learningLoop = input.learningLoop.recordAssessmentAttemptSubmitted(
      {
        assessmentId: input.assessment.id,
        attemptId: attempt.id
      },
      input.events
    );
    learningLoop = learningLoop.recordAssessmentEvaluated(
      {
        assessmentId: input.assessment.id,
        evaluationId: evaluation.id,
        score
      },
      input.events
    );

    const knowledgeGaps = itemResults
      .filter((result) => !result.correct)
      .map((result) =>
        KnowledgeGap.create({
          learningLoopId: input.learningLoop.id,
          topic: result.topic,
          description: `Needs more support with ${result.topic}.`,
          evidence: `Missed assessment item ${result.itemId}.`,
          severity: score < 0.5 ? "high" : "medium"
        })
      );

    learningLoop = learningLoop.identifyKnowledgeGaps(
      knowledgeGaps.map((gap) => gap.id),
      input.events
    );

    return ok({
      attempt,
      evaluation,
      knowledgeGaps,
      learningLoop
    });
  }
}
