import { Attempt, Evaluation } from "../../domain/learning/Assessment.js";
import { KnowledgeGap } from "../../domain/learning/LearningLoop.js";
import type { DomainEventRecorder } from "../../domain/primitives/Event.js";
import { err, ok, type Result } from "../../domain/primitives/result.js";
import type { SubmitAssessmentAttemptCommand } from "../../domain/study/AssessmentGeneration.js";
import type { Assessment } from "../../domain/learning/Assessment.js";
import type { LearningLoop } from "../../domain/learning/LearningLoop.js";
import type { AgentRuntime } from "../runtime/AgentRuntime.js";
import { FixtureAgentRuntime } from "../runtime/FixtureAgentRuntime.js";
import type { RuntimeTraceSeed } from "../runtime/RuntimeTrace.js";
import type { RuntimeConversationBinding } from "../runtime/RuntimeConversationBinding.js";
import type { MasterDataInterpretationCandidate } from "../masterData/MasterDataInterpretation.js";
import type { MasterDataItem } from "../../domain/learning/MasterData.js";

export interface AssessmentAttemptEvaluation {
  attempt: Attempt;
  evaluation: Evaluation;
  knowledgeGaps: readonly KnowledgeGap[];
  learningLoop: LearningLoop;
  runtimeConversationBinding?: RuntimeConversationBinding;
  runtimeTrace?: RuntimeTraceSeed;
}

export class AssessmentAttemptEvaluator {
  constructor(private readonly runtime: AgentRuntime = new FixtureAgentRuntime()) {}

  async evaluate(input: {
    assessment: Assessment;
    command: SubmitAssessmentAttemptCommand;
    events: DomainEventRecorder;
    learningLoop: LearningLoop;
    materialInterpretation?: MasterDataInterpretationCandidate;
    runtimeConversationBinding?: RuntimeConversationBinding;
    sourceItems?: readonly MasterDataItem[];
  }): Promise<Result<AssessmentAttemptEvaluation>> {
    const assessmentSnapshot = input.assessment.toSnapshot();
    const attempt = Attempt.create(
      input.assessment.workspaceId,
      input.assessment.id,
      input.command.responses,
      input.events
    );
    const runtimeEvaluation = await this.runtime.evaluateAssessmentAttempt({
      assessment: {
        items: assessmentSnapshot.items,
        topic: assessmentSnapshot.topic
      },
      contextTopic: assessmentSnapshot.topic,
      materialInterpretation: input.materialInterpretation,
      learningLoopId: input.learningLoop.id,
      responses: input.command.responses,
      sourceEvidence:
        input.sourceItems
          ?.map((item) => ({
            content: item.content ?? item.canonicalAnswer,
            excerpt: item.content ?? item.visibleMaterial,
            sourceMasterDataItemId: item.id,
            sourceRef: item.sourceRef ?? item.id,
            subtopic: item.subtopic ?? item.topic,
            topic: item.topic
          }))
          .filter((item) => item.content && item.sourceRef) ?? [],
      runtimeConversationBinding: input.runtimeConversationBinding
    });
    if (!runtimeEvaluation.ok) {
      return runtimeEvaluation;
    }

    if (!Array.isArray(runtimeEvaluation.value.itemResults)) {
      return err({
        code: "VALIDATION_ERROR",
        message: "Assessment attempt evaluation did not return a valid itemResults array."
      });
    }

    if (!Array.isArray(runtimeEvaluation.value.knowledgeGaps)) {
      return err({
        code: "VALIDATION_ERROR",
        message: "Assessment attempt evaluation did not return a valid knowledgeGaps array."
      });
    }

    if (
      typeof runtimeEvaluation.value.score !== "number" ||
      !Number.isFinite(runtimeEvaluation.value.score)
    ) {
      return err({
        code: "VALIDATION_ERROR",
        message: "Assessment attempt evaluation did not return a valid score."
      });
    }

    const evaluation = Evaluation.create(
      {
        workspaceId: input.assessment.workspaceId,
        assessmentId: input.assessment.id,
        attemptId: attempt.id,
        score: runtimeEvaluation.value.score,
        itemResults: runtimeEvaluation.value.itemResults
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
        score: runtimeEvaluation.value.score
      },
      input.events
    );

    const knowledgeGaps = runtimeEvaluation.value.knowledgeGaps.map((candidate) =>
        KnowledgeGap.create({
          learningLoopId: input.learningLoop.id,
          topic: candidate.topic,
          description: candidate.description,
          evidence: candidate.evidence,
          severity: candidate.severity
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
      learningLoop,
      runtimeConversationBinding: runtimeEvaluation.value.runtimeConversationBinding,
      runtimeTrace: runtimeEvaluation.value.runtimeTrace
    });
  }
}
