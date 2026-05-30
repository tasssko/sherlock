import type { Controller } from "../../domain/primitives/Controller.js";
import { err, ok, type Result } from "../../domain/primitives/result.js";
import type {
  AssessmentAttemptResponse,
  SubmitAssessmentAttemptCommand
} from "../../domain/study/AssessmentGeneration.js";
import { createDomainEventRecorder } from "../../domain/primitives/Event.js";
import {
  createLearningLoopRecord,
  type LearningLoopRepository
} from "../planning/LearningLoopRepository.js";
import { AssessmentAttemptEvaluator } from "./AssessmentAttemptEvaluator.js";

export class AssessmentAttemptController
  implements Controller<SubmitAssessmentAttemptCommand, AssessmentAttemptResponse>
{
  constructor(
    private readonly repository: LearningLoopRepository,
    private readonly evaluator = new AssessmentAttemptEvaluator()
  ) {}

  execute(command: SubmitAssessmentAttemptCommand): Result<AssessmentAttemptResponse> {
    const located = this.repository.findRecordByAssessmentId(command.assessmentId as never);
    if (!located) {
      return err({
        code: "NOT_FOUND",
        message: `Assessment ${command.assessmentId} was not found.`
      });
    }

    const assessment = located.record.assessments.find(
      (candidate) => candidate.id === (command.assessmentId as never)
    );
    if (!assessment) {
      return err({
        code: "NOT_FOUND",
        message: `Assessment ${command.assessmentId} was not found.`
      });
    }

    const learningLoop = located.record.learningLoops.find(
      (candidate) => candidate.id === assessment.learningLoopId
    );
    if (!learningLoop) {
      return err({
        code: "NOT_FOUND",
        message: `Learning loop for assessment ${command.assessmentId} was not found.`
      });
    }

    const events = createDomainEventRecorder(located.record.workspace.id);
    const evaluation = this.evaluator.evaluate({
      assessment,
      command,
      events,
      learningLoop
    });
    if (!evaluation.ok) {
      return evaluation;
    }

    const newEvents = events.all();
    const workspace = located.record.workspace.appendEventLedger(newEvents.map((event) => event.id));
    const updatedRecord = createLearningLoopRecord({
      workspace,
      tasks: [...located.record.tasks],
      workPlans: [...located.record.workPlans],
      artifacts: [...located.record.artifacts],
      events: [...located.record.events, ...newEvents],
      learningLoops: [
        ...located.record.learningLoops.filter((candidate) => candidate.id !== learningLoop.id),
        evaluation.value.learningLoop
      ],
      assessments: [...located.record.assessments],
      attempts: [...located.record.attempts, evaluation.value.attempt],
      evaluations: [...located.record.evaluations, evaluation.value.evaluation],
      knowledgeGaps: [...located.record.knowledgeGaps, ...evaluation.value.knowledgeGaps],
      masteryProfiles: [...located.record.masteryProfiles],
      practiceActivities: [...located.record.practiceActivities],
      activeReviewSessions: [...located.record.activeReviewSessions]
    });

    this.repository.saveRecord(located.key, updatedRecord);

    return ok({
      workspace: workspace.toSnapshot(),
      learningLoop: evaluation.value.learningLoop.toSnapshot(),
      attempt: evaluation.value.attempt.toSnapshot(),
      evaluation: evaluation.value.evaluation.toSnapshot(),
      knowledgeGaps: evaluation.value.knowledgeGaps.map((gap) => gap.toSnapshot()),
      events: newEvents
    });
  }
}
