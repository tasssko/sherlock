import { err, ok, type Result } from "../../domain/primitives/result.js";
import type {
  ActiveReviewEvaluationCandidate,
  AgentRuntime,
  AssessmentAttemptEvaluationCandidate,
  InitialAssessmentGenerationCandidate,
  LearningLoopBatchGenerationCandidate,
  MasterDataInterpretationResultCandidate,
  PracticeActivityGenerationCandidate,
  StudyPlanGenerationCandidate
} from "./AgentRuntime.js";
import type {
  InitialAssessmentContext,
  PracticeActivityContext,
  StudyPlanningContext
} from "../../domain/primitives/Context.js";
import type {
  MasterDataItem,
  MasterDataSource
} from "../../domain/learning/MasterData.js";
import {
  buildMasterDataInterpretationSummary,
  buildSourceEvidenceFromInterpretation,
  normalizeCompatibleMasterDataInterpretationCandidate,
  selectInterpretationObjectives,
  validateMasterDataInterpretationCandidate,
  type MasterDataInterpretationCandidate
} from "../masterData/MasterDataInterpretation.js";
import { validateLearningLoopBatchCandidate } from "../loopBatch/LearningLoopBatchValidation.js";
import type { AssessmentItem, EvaluationItemResult } from "../../domain/learning/Assessment.js";
import type {
  PracticeItem,
  PracticeItemResponse
} from "../../domain/learning/PracticeActivity.js";
import type { KnowledgeGapSeverity } from "../../domain/learning/LearningLoop.js";
import type { LoopStudyRelayCapability } from "./LoopStudyRelayRuntimeProfile.js";
import type { RuntimeTraceSeed } from "./RuntimeTrace.js";
import { RelayWorkspaceBinding } from "./RelayWorkspaceBinding.js";
import { LoopStudyRelayConversationAdapter } from "./LoopStudyRelayConversationAdapter.js";
import type { RuntimeConversationBinding } from "./RuntimeConversationBinding.js";

interface RelayRequestOptions {
  binding: RelayWorkspaceBinding;
  createdBy?: string;
  diagnosticsLogger?: {
    info(bindings: Record<string, unknown>, message: string): void;
    warn?(bindings: Record<string, unknown>, message: string): void;
  };
  fetcher?: typeof fetch;
}

export class RelayAgentRuntime implements AgentRuntime {
  private readonly adapter: LoopStudyRelayConversationAdapter;
  private readonly diagnosticsLogger: RelayRequestOptions["diagnosticsLogger"];

  constructor(private readonly options: RelayRequestOptions) {
    this.adapter = new LoopStudyRelayConversationAdapter({
      binding: options.binding,
      createdBy: options.createdBy,
      fetcher: options.fetcher
    });
    this.diagnosticsLogger = options.diagnosticsLogger;
  }

  describeBinding(): {
    controllerId?: string;
    defaultAgentHandle: string;
    workspaceId: string;
  } {
    return {
      workspaceId: this.options.binding.workspaceId,
      defaultAgentHandle: this.options.binding.defaultAgentHandle,
      controllerId: this.options.binding.controllerId
    };
  }

  evaluateActiveReviewSession(input: {
    learningLoopId: string;
    practiceItems: readonly PracticeItem[];
    responses: readonly PracticeItemResponse[];
    runtimeConversationBinding?: RuntimeConversationBinding;
  }): Promise<Result<ActiveReviewEvaluationCandidate>> {
    return this.runStructuredConversation<ActiveReviewEvaluationCandidate>({
      failureMessage:
        "The review service could not evaluate this practice evidence right now.",
      capability: "evaluateActiveReviewSession",
      expectedOutputSchema: "ActiveReviewEvaluationCandidate",
      operation: "evaluateActiveReviewSession",
      learningLoopId: input.learningLoopId,
      runtimeConversationBinding: input.runtimeConversationBinding,
      payload: {
        practiceItems: input.practiceItems,
        responses: input.responses
      }
    });
  }

  async evaluateAssessmentAttempt(input: {
    assessment: {
      items: readonly AssessmentItem[];
      topic: string;
    };
    contextTopic: string;
    materialInterpretation?: MasterDataInterpretationCandidate;
    learningLoopId: string;
    responses: readonly {
      answer: string;
      itemId: string;
    }[];
    sourceEvidence?: readonly {
      content: string;
      excerpt: string;
      sourceMasterDataItemId?: string;
      sourceRef: string;
      subtopic: string;
      topic: string;
    }[];
    runtimeConversationBinding?: RuntimeConversationBinding;
  }): Promise<Result<AssessmentAttemptEvaluationCandidate>> {
    const generated = await this.runStructuredConversation<AssessmentAttemptEvaluationCandidate>({
      failureMessage:
        "The assessment service could not evaluate this attempt right now.",
      capability: "evaluateAssessmentAttempt",
      expectedOutputSchema: "AssessmentAttemptEvaluationCandidate",
      operation: "evaluateAssessmentAttempt",
      learningLoopId: input.learningLoopId,
      runtimeConversationBinding: input.runtimeConversationBinding,
      payload: {
        assessment: input.assessment,
        contextTopic: input.contextTopic,
        responses: input.responses,
        materialInterpretation: input.materialInterpretation,
        sourceEvidence: input.sourceEvidence ?? [],
        markingRules: [
          "Mark answers against the assessment item, accepted interpretation, and cited source evidence only.",
          "Reward accurate, source-grounded partial understanding in feedback, but only mark correct when the answer fully meets the expected response.",
          "Use the accepted interpretation objectives and source refs to identify specific focus areas and knowledge gaps.",
          "Do not invent extra facts or reveal hidden scoring internals in learner-facing feedback."
        ]
      }
    });
    if (!generated.ok) {
      return generated;
    }

    try {
      const normalized = normalizeAssessmentAttemptEvaluationCandidate(generated.value, {
        assessment: input.assessment,
        contextTopic: input.contextTopic,
        responses: input.responses
      });

      return ok({
        ...normalized,
        runtimeConversationBinding: generated.value.runtimeConversationBinding,
        runtimeTrace: generated.value.runtimeTrace
      });
    } catch (error) {
      return err({
        code: "VALIDATION_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Assessment attempt evaluation candidate failed validation."
      });
    }
  }

  async interpretMasterData(input: {
    contentType: string;
    expectedOutputSchema: "MasterDataInterpretationCandidate.v1";
    fallbackItems?: readonly {
      canonicalAnswer: string;
      prompt: string;
      topic: string;
      visibleMaterial: string;
    }[];
    learnerYearGroup?: string;
    rawSourceContent: string;
    sourceId: string;
    sourceName: string;
    userHints?: {
      subject?: string;
      topic?: string;
    };
  }): Promise<Result<MasterDataInterpretationResultCandidate>> {
    const generated = await this.runStructuredConversation<
      MasterDataInterpretationCandidate | { interpretation: MasterDataInterpretationCandidate }
    >({
      failureMessage:
        "The material interpretation service could not prepare this study pack right now.",
      capability: "interpretMasterData",
      expectedOutputSchema: input.expectedOutputSchema,
      operation: "interpretMasterData",
      learningLoopId: input.sourceId,
      payload: buildInterpretMasterDataPayload(input)
    });
    if (!generated.ok) {
      return generated;
    }

    try {
      const normalizedCandidate = normalizeCompatibleMasterDataInterpretationCandidate(
        extractInterpretationCandidatePayload(generated.value),
        {
          sourceName: input.sourceName,
          rawSourceContent: input.rawSourceContent,
          learnerYearGroup: input.learnerYearGroup,
          userHints: input.userHints
        }
      );
      const interpretation = validateMasterDataInterpretationCandidate(
        normalizedCandidate
      );
      return ok({
        interpretation,
        runtimeConversationBinding: generated.value.runtimeConversationBinding,
        runtimeTrace: generated.value.runtimeTrace
      });
    } catch (error) {
      return err({
        code: "VALIDATION_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Master data interpretation candidate failed validation."
      });
    }
  }

  async generateInitialAssessment(input: {
    context: InitialAssessmentContext;
    learningLoopId: string;
    source: MasterDataSource;
    sourceItems: readonly MasterDataItem[];
    runtimeConversationBinding?: RuntimeConversationBinding;
  }): Promise<Result<InitialAssessmentGenerationCandidate>> {
    const acceptedInterpretationItems =
      input.source.acceptedInterpretation?.items.length
        ? input.source.acceptedInterpretation.items
        : undefined;
    const relevantSourceExcerpts = buildSourceEvidenceFromInterpretation({
      interpretation: input.source.acceptedInterpretation,
      items:
        acceptedInterpretationItems ??
        input.sourceItems.map((item) => ({
          subject: item.subject ?? inferSubjectFromSourceName(input.source.name) ?? "Unknown",
          yearGroup: item.yearGroup ?? input.context.yearGroup,
          topic: item.topic,
          subtopic: item.subtopic ?? item.topic,
          itemType: item.itemType ?? "fact",
          content: item.content ?? item.canonicalAnswer,
          sourceRef: item.sourceRef ?? item.id
        }))
    });

    const generated = await this.runStructuredConversation<InitialAssessmentGenerationCandidate>({
      failureMessage:
        "The assessment service could not generate a diagnostic right now.",
      capability: "generateInitialAssessment",
      expectedOutputSchema: "InitialAssessmentGenerationCandidate",
      operation: "generateInitialAssessment",
      learningLoopId: input.learningLoopId,
      runtimeConversationBinding: input.runtimeConversationBinding,
      payload: {
        context: input.context.toSnapshot(),
        topic: input.context.topic,
        materialInterpretation: input.source.acceptedInterpretation ?? {
              mainTopic: input.context.topic,
              subject:
                input.sourceItems[0]?.subject ??
                inferSubjectFromSourceName(input.source.name),
              yearGroup: input.context.yearGroup,
              subtopics: unique(
                input.sourceItems
                  .map((item) => item.subtopic)
                  .filter((value): value is string => Boolean(value))
              ),
              keyPeople: unique(
                input.sourceItems
                  .map((item) => item.person)
                  .filter((value): value is string => Boolean(value))
              ),
              keyTerms: unique(
                input.sourceItems
                  .map((item) => item.term)
                  .filter((value): value is string => Boolean(value))
              ),
              importantDates: unique(
                input.sourceItems
                  .map((item) => item.date)
                  .filter((value): value is string => Boolean(value))
              ),
              learningObjectives: [],
              processes: [],
              learnerFacingMaterialSummary: undefined,
              sourceMap: [],
              items: []
            },
        relevantSourceExcerpts,
        source: {
          id: input.source.id,
          name: input.source.name,
          contentType: input.source.contentType,
          rawSourceContent: input.source.rawSourceContent
        }
      }
    });
    if (!generated.ok) {
      return generated;
    }

    try {
      const normalized = normalizeInitialAssessmentGenerationCandidate(
        generated.value,
        {
          contextTopic: input.context.topic,
          questionCount: input.context.questionCount,
          sourceItems: input.sourceItems,
          relevantSourceExcerpts
        }
      );

      return ok({
        ...normalized,
        runtimeConversationBinding: generated.value.runtimeConversationBinding,
        runtimeTrace: generated.value.runtimeTrace
      });
    } catch (error) {
      return err({
        code: "VALIDATION_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Initial assessment candidate failed validation."
      });
    }
  }

  generatePracticeActivity(input: {
    context: PracticeActivityContext;
    learningLoopId: string;
    materialInterpretation?: MasterDataInterpretationCandidate;
    selections: readonly {
      gap: {
        description: string;
        id: string;
      };
      item: MasterDataItem;
    }[];
    runtimeConversationBinding?: RuntimeConversationBinding;
  }): Promise<Result<PracticeActivityGenerationCandidate>> {
    const learningObjectives = selectInterpretationObjectives({
      interpretation: input.materialInterpretation,
      sourceRefs: input.selections.map(
        (selection) => selection.item.sourceRef ?? selection.item.id
      ),
      fallbackObjectives: input.selections.map((selection) => selection.gap.description)
    });

    return this.runStructuredConversation<PracticeActivityGenerationCandidate>({
      failureMessage:
        "The practice service could not generate an activity right now.",
      capability: "generatePracticeActivity",
      expectedOutputSchema: "PracticeActivityGenerationCandidate",
      operation: "generatePracticeActivity",
      learningLoopId: input.learningLoopId,
      runtimeConversationBinding: input.runtimeConversationBinding,
      payload: {
        context: input.context.toSnapshot(),
        subject:
          input.selections[0]?.item.subject ??
          inferSubjectFromSourceNames(input.context.toSnapshot().sourceNames),
        yearGroup: input.context.yearGroup,
        topic: input.context.topic,
        materialInterpretation: input.materialInterpretation
          ? buildMasterDataInterpretationSummary(input.materialInterpretation)
          : undefined,
        learningObjectives,
        selectedSourceEvidence: buildSourceEvidenceFromInterpretation({
          interpretation: input.materialInterpretation,
          items: input.selections.map((selection) => ({
            subject: selection.item.subject ?? "Unknown",
            yearGroup: selection.item.yearGroup ?? input.context.yearGroup,
            topic: selection.item.topic,
            subtopic: selection.item.subtopic ?? selection.item.topic,
            itemType: selection.item.itemType ?? "fact",
            content: selection.item.content ?? selection.item.canonicalAnswer,
            sourceRef: selection.item.sourceRef ?? selection.item.id
          }))
        }),
        selectedSourceItems: input.selections.map((selection) =>
          selection.item.toRuntimePayload()
        ),
        selections: input.selections.map((selection) => ({
          gap: selection.gap,
          item: selection.item.toRuntimePayload()
        }))
      }
    });
  }

  generateLearningLoopBatch(input: {
    desiredLoopCount: number;
    learningLoopId: string;
    materialInterpretation: MasterDataInterpretationCandidate;
    targetLoopDurationMinutes: number;
    diagnosedGaps: readonly {
      description: string;
      evidence: string;
      id: string;
      severity: "high" | "medium" | "low";
      topic: string;
    }[];
    evaluation: {
      itemResults: readonly EvaluationItemResult[];
      score: number;
    };
    learnerYearGroup: string;
    runtimeConversationBinding?: RuntimeConversationBinding;
  }): Promise<Result<LearningLoopBatchGenerationCandidate>> {
    return this.runStructuredConversation<LearningLoopBatchGenerationCandidate>({
      failureMessage:
        "The loop service could not prepare the next study loops right now.",
      capability: "generateLearningLoopBatch",
      expectedOutputSchema: "LearningLoopBatchCandidate.v1",
      operation: "generateLearningLoopBatch",
      learningLoopId: input.learningLoopId,
      runtimeConversationBinding: input.runtimeConversationBinding,
      payload: {
        learnerYearGroup: input.learnerYearGroup,
        desiredLoopCount: input.desiredLoopCount,
        targetLoopDurationMinutes: input.targetLoopDurationMinutes,
        materialInterpretation: input.materialInterpretation,
        diagnosedGaps: input.diagnosedGaps,
        evaluation: input.evaluation
      }
    }).then((generated) => {
      if (!generated.ok) {
        return generated;
      }

      try {
        const candidate = validateLearningLoopBatchCandidate({
          candidate: generated.value,
          diagnosedGaps: input.diagnosedGaps,
          interpretation: input.materialInterpretation
        });

        return ok({
          overview: candidate.overview,
          targetDurationMinutes: candidate.targetDurationMinutes,
          units: candidate.units,
          runtimeConversationBinding: generated.value.runtimeConversationBinding,
          runtimeTrace: generated.value.runtimeTrace
        });
      } catch (error) {
        return err({
          code: "VALIDATION_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Learning loop batch candidate failed validation."
        });
      }
    });
  }

  generateStudyPlan(input: {
    context: StudyPlanningContext;
    learningLoopId: string;
    materialInterpretations?: readonly MasterDataInterpretationCandidate[];
    runtimeConversationBinding?: RuntimeConversationBinding;
  }): Promise<Result<StudyPlanGenerationCandidate>> {
    return this.runStructuredConversation<StudyPlanGenerationCandidate>({
      failureMessage:
        "The planning service could not generate a study plan right now.",
      capability: "generateStudyPlan",
      expectedOutputSchema: "StudyPlanGenerationCandidate",
      operation: "generateStudyPlan",
      learningLoopId: input.learningLoopId,
      runtimeConversationBinding: input.runtimeConversationBinding,
      payload: {
        context: input.context.toSnapshot(),
        materialInterpretations: (input.materialInterpretations ?? []).map((interpretation) =>
          buildMasterDataInterpretationSummary(interpretation)
        )
      }
    }).then((generated) => {
      if (!generated.ok) {
        return generated;
      }

      try {
        const normalized = normalizeStudyPlanGenerationCandidate(generated.value, {
          context: input.context
        });

        return ok({
          ...normalized,
          runtimeConversationBinding: generated.value.runtimeConversationBinding,
          runtimeTrace: generated.value.runtimeTrace
        });
      } catch (error) {
        this.diagnosticsLogger?.warn?.(
          summarizeStudyPlanPayloadShape(generated.value),
          "Relay study-plan candidate could not be normalized."
        );
        return err({
          code: "VALIDATION_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Study plan candidate failed validation."
        });
      }
    });
  }

  private async runStructuredConversation<
    TValue
  >(input: {
    capability: LoopStudyRelayCapability;
    expectedOutputSchema: string;
    failureMessage: string;
    learningLoopId: string;
    operation: string;
    payload: unknown;
    runtimeConversationBinding?: RuntimeConversationBinding;
  }): Promise<
    Result<
      TValue & {
        runtimeConversationBinding?: RuntimeConversationBinding;
        runtimeTrace?: RuntimeTraceSeed;
      }
    >
  > {
    const stage = stageForOperation(input.operation);
    const idempotencyKey = createRelayIdempotencyKey({
      learningLoopId: input.learningLoopId,
      operation: input.operation,
      payload: input.payload
    });
    const relayTurn = await this.adapter.sendStructuredTurn({
      capability: input.capability,
      idempotencyKey,
      learningLoopId: input.learningLoopId as never,
      metadata: {
        stage,
        operation: input.operation
      },
      relayCommand: buildRelayCommand({
        expectedOutputSchema: input.expectedOutputSchema,
        operation: input.operation,
        payload: input.payload
      }),
      runtimeConversationBinding: input.runtimeConversationBinding
    });
    if (!relayTurn.ok) {
      return this.runtimeFailure(input.failureMessage, relayTurn.error.message);
    }

    const parsed = this.parseStructuredResult<TValue>({
      operation: input.operation,
      responseContent: relayTurn.value.responseContent,
      responseText: relayTurn.value.responseText
    });
    if (!parsed.ok) {
      return this.runtimeFailure(input.failureMessage, parsed.error.message);
    }

    const runtimeTrace: RuntimeTraceSeed = {
      provider: "relay",
      operation: input.operation as RuntimeTraceSeed["operation"],
      relayTask: {
        relayArtifactIds: relayTurn.value.correlation.relayArtifactIds,
        relayConversationId: relayTurn.value.correlation.relayConversationId,
        relayMessageId: relayTurn.value.correlation.relayMessageId,
        relayResponseMessageId: relayTurn.value.correlation.relayResponseMessageId,
        relayTaskId: relayTurn.value.correlation.relayTaskId,
        relayWorkPlanId: relayTurn.value.correlation.relayWorkPlanId
      },
      runtimeArtifacts: []
    };

    return ok({
      ...(parsed.value as Record<string, unknown>),
      runtimeConversationBinding: relayTurn.value.binding,
      runtimeTrace
    } as TValue & {
      runtimeConversationBinding?: RuntimeConversationBinding;
      runtimeTrace?: RuntimeTraceSeed;
    });
  }

  private runtimeFailure<TValue>(
    failureMessage: string,
    detail: string
  ): Result<TValue> {
    const suffix = detail.trim() ? ` ${detail.trim()}` : "";

    return err({
      code: "STATE_CONFLICT",
      message: `${failureMessage}${suffix}`
    });
  }

  private parseStructuredResult<TValue>(input: {
    operation: string;
    responseContent?: unknown;
    responseText?: string;
  }): Result<TValue> {
    if (input.responseContent !== undefined) {
      const normalized = this.normalizeResponseContent(input.operation, input.responseContent);
      if (!normalized.ok) {
        return normalized;
      }

      if (normalized.value.responseValue !== undefined) {
        return this.parseStructuredValue<TValue>(normalized.value.responseValue);
      }

      if (normalized.value.responseText) {
        return this.parseResponseText<TValue>(normalized.value.responseText);
      }
    }

    if (input.responseText) {
      return this.parseResponseText<TValue>(input.responseText);
    }

    return err({
      code: "STATE_CONFLICT",
      message: "Relay runtime response did not include structured content."
    });
  }

  private parseResponseText<TValue>(responseText: string): Result<TValue> {
    const extracted = extractStructuredJsonFromText(responseText);
    if (extracted !== undefined) {
      return this.parseStructuredValue<TValue>(extracted);
    }

    try {
      const parsed = JSON.parse(responseText) as unknown;
      return this.parseStructuredValue<TValue>(parsed);
    } catch {
      return err({
        code: "STATE_CONFLICT",
        message: "Relay runtime response was not valid JSON."
      });
    }
  }

  private parseStructuredValue<TValue>(value: unknown): Result<TValue> {
    try {
      if (!value || typeof value !== "object") {
        return err({
          code: "STATE_CONFLICT",
          message: "Relay runtime response did not contain structured JSON content."
        });
      }

      if ("result" in value) {
        return ok((value as { result: TValue }).result);
      }

      if ("valueJson" in value) {
        return this.parseStructuredValue<TValue>((value as { valueJson: unknown }).valueJson);
      }

      if ("structuredOutput" in value) {
        return this.parseStructuredValue<TValue>(
          (value as { structuredOutput: unknown }).structuredOutput
        );
      }

      return ok(value as TValue);
    } catch {
      return err({
        code: "STATE_CONFLICT",
        message: "Relay runtime response was not valid structured JSON."
      });
    }
  }

  private normalizeResponseContent(
    operation: string,
    responseContent: unknown
  ): Result<{
    responseText?: string;
    responseValue?: unknown;
  }> {
    const summary = summarizeResponseContent(responseContent);
    this.diagnosticsLogger?.info(
      {
        responseContentType: summary.type,
        responseContentSchema: summary.schema,
        responseContentTopLevelKeys: summary.topLevelKeys
      },
      `Relay runtime returned structured response content for ${operation}.`
    );

    if (Array.isArray(responseContent)) {
      const extractedValue = extractRelayStructuredValue(responseContent);
      if (extractedValue !== undefined) {
        return ok({ responseValue: extractedValue });
      }

      const extractedText = extractRelayTextContent(responseContent);
      return extractedText
        ? ok({ responseText: extractedText })
        : err({
            code: "STATE_CONFLICT",
            message: "Relay runtime array response did not include usable structured content."
          });
    }

    if (!isRecord(responseContent)) {
      return ok({ responseValue: responseContent });
    }

    const responseType = stringOrUndefined(responseContent.type);
    const responseStatus = stringOrUndefined(responseContent.status);
    const extracted = extractRelayStructuredValue(responseContent);

    if (responseType === "text") {
      if (extracted !== undefined && typeof extracted === "object" && extracted !== null) {
        return ok({ responseValue: extracted });
      }

      if (responseStatus === "failed" || responseStatus === "error") {
        this.diagnosticsLogger?.warn?.(
          {
            responseContentType: responseType,
            responseContentSchema: summary.schema,
            responseContentTopLevelKeys: summary.topLevelKeys
          },
          `Relay runtime returned a failed text response for ${operation}.`
        );

        return err({
          code: "STATE_CONFLICT",
          message: "Relay runtime returned a failed text response."
        });
      }

      const textValue =
        extractRelayTextContent(responseContent) ??
        stringOrUndefined(responseContent.value) ??
        stringOrUndefined(responseContent.text);
      return textValue
        ? ok({ responseText: textValue })
        : err({
            code: "STATE_CONFLICT",
            message: "Relay runtime text response did not include usable content."
          });
    }

    if (extracted !== undefined) {
      return ok({ responseValue: extracted });
    }

    return ok({ responseValue: responseContent });
  }
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractInterpretationCandidatePayload(
  value: MasterDataInterpretationCandidate | { interpretation: MasterDataInterpretationCandidate }
): unknown {
  if (isRecord(value) && "interpretation" in value) {
    return value.interpretation;
  }

  return value;
}

function extractRelayStructuredValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const extracted = extractRelayStructuredValue(entry);
      if (extracted !== undefined) {
        return extracted;
      }
    }

    return undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  if (Array.isArray(value.content)) {
    const extracted = extractRelayStructuredValue(value.content);
    if (extracted !== undefined) {
      return extracted;
    }
  }

  if (Array.isArray(value.blocks)) {
    const extracted = extractRelayStructuredValue(value.blocks);
    if (extracted !== undefined) {
      return extracted;
    }
  }

  if (isRecord(value.message)) {
    const extracted = extractRelayStructuredValue(value.message);
    if (extracted !== undefined) {
      return extracted;
    }
  }

  if ("valueJson" in value) {
    return (value as { valueJson: unknown }).valueJson;
  }

  if ("structuredOutput" in value) {
    return extractRelayStructuredValue((value as { structuredOutput: unknown }).structuredOutput);
  }

  if ("result" in value) {
    return value;
  }

  if ("value" in value) {
    return (value as { value: unknown }).value;
  }

  if ("json" in value) {
    return (value as { json: unknown }).json;
  }

  if ("data" in value && isRecord((value as { data: unknown }).data)) {
    return (value as { data: unknown }).data;
  }

  return undefined;
}

function extractRelayTextContent(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => extractRelayTextContent(entry))
      .filter((entry): entry is string => Boolean(entry && entry.trim()));
    return parts.length > 0 ? parts.join("\n\n") : undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  if (Array.isArray(value.content)) {
    const extracted = extractRelayTextContent(value.content);
    if (extracted) {
      return extracted;
    }
  }

  if (Array.isArray(value.blocks)) {
    const extracted = extractRelayTextContent(value.blocks);
    if (extracted) {
      return extracted;
    }
  }

  if (isRecord(value.message)) {
    const extracted = extractRelayTextContent(value.message);
    if (extracted) {
      return extracted;
    }
  }

  return (
    stringOrUndefined(value.text) ??
    stringOrUndefined(value.value) ??
    stringOrUndefined(value.output_text) ??
    stringOrUndefined(value.markdown)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function summarizeResponseContent(value: unknown): {
  schema?: string;
  topLevelKeys: readonly string[];
  type?: string;
} {
  if (Array.isArray(value)) {
    return {
      topLevelKeys: [],
      type: "array"
    };
  }

  if (!isRecord(value)) {
    return {
      topLevelKeys: [],
      type: typeof value
    };
  }

  return {
    type: stringOrUndefined(value.type),
    schema: stringOrUndefined(value.schema),
    topLevelKeys: Object.keys(value).sort()
  };
}

function extractStructuredJsonFromText(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [
    fencedMatch?.[1]?.trim(),
    extractBalancedJsonCandidate(trimmed)
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      continue;
    }
  }

  return undefined;
}

function extractBalancedJsonCandidate(value: string): string | undefined {
  const startIndex = [...value].findIndex((character) => character === "{" || character === "[");
  if (startIndex < 0) {
    return undefined;
  }

  const startCharacter = value[startIndex];
  const endCharacter = startCharacter === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      continue;
    }

    if (character === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (character === startCharacter) {
      depth += 1;
    } else if (character === endCharacter) {
      depth -= 1;
      if (depth === 0) {
        return value.slice(startIndex, index + 1);
      }
    }
  }

  return undefined;
}

function inferSubjectFromSourceName(sourceName: string): string | undefined {
  const normalized = sourceName.toLowerCase();
  if (normalized.includes("geography")) {
    return "Geography";
  }
  if (normalized.includes("history")) {
    return "History";
  }
  if (normalized.includes("science")) {
    return "Science";
  }
  if (normalized.includes("latin")) {
    return "Latin";
  }
  if (normalized.includes("tpr")) {
    return "TPR";
  }

  return undefined;
}

function inferSubjectFromSourceNames(
  sourceNames: readonly string[]
): string | undefined {
  for (const sourceName of sourceNames) {
    const inferred = inferSubjectFromSourceName(sourceName);
    if (inferred) {
      return inferred;
    }
  }

  return undefined;
}

function normalizeStudyPlanGenerationCandidate(
  value: unknown,
  context: {
    context: StudyPlanningContext;
  }
): Pick<StudyPlanGenerationCandidate, "artifactContent" | "assumptions" | "childTaskSummaries" | "decisions"> {
  const payload = unwrapStudyPlanGenerationPayload(value);
  if (!isRecord(payload)) {
    throw new Error("Study plan candidate did not contain a structured object.");
  }

  const artifactContent = normalizeStudyPlanArtifactContent(payload, context.context);
  const assumptions = normalizeStudyPlanAssumptions(payload.assumptions);
  const childTaskSummaries = normalizeStudyPlanStringArray(
    payload.childTaskSummaries,
    artifactContent.sessions.map(
      (session) => `Prepare a focused ${session.topic} study block with retrieval and self-check.`
    )
  );
  const decisions = normalizeStudyPlanStringArray(payload.decisions, []);

  return {
    artifactContent,
    assumptions,
    childTaskSummaries,
    decisions
  };
}

function summarizeStudyPlanPayloadShape(value: unknown): {
  artifactCandidateKeys: readonly string[];
  nestedCandidateKeys: Record<string, readonly string[]>;
  topLevelKeys: readonly string[];
} {
  if (!isRecord(value)) {
    return {
      topLevelKeys: [],
      artifactCandidateKeys: [],
      nestedCandidateKeys: {}
    };
  }

  const nestedCandidateKeys: Record<string, readonly string[]> = {};
  for (const key of [
    "artifactContent",
    "content",
    "artifact",
    "studyPlan",
    "plan",
    "output",
    "value"
  ]) {
    const candidate = value[key];
    if (isRecord(candidate)) {
      nestedCandidateKeys[key] = Object.keys(candidate).sort();
    }
  }

  return {
    topLevelKeys: Object.keys(value).sort(),
    artifactCandidateKeys: Object.keys(extractStudyPlanArtifactRecord(value) ?? {}).sort(),
    nestedCandidateKeys
  };
}

function unwrapStudyPlanGenerationPayload(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const nestedCandidates = [
    value.studyPlan,
    value.plan,
    value.candidate,
    value.payload,
    value.artifact,
    value.content,
    value.output
  ];
  for (const candidate of nestedCandidates) {
    if (
      isRecord(candidate) &&
      (
        "artifactContent" in candidate ||
        "summary" in candidate ||
        "sessions" in candidate ||
        "content" in candidate ||
        "artifact" in candidate
      )
    ) {
      return candidate;
    }
  }

  return value;
}

function normalizeStudyPlanArtifactContent(
  payload: Record<string, unknown>,
  context: StudyPlanningContext
): StudyPlanGenerationCandidate["artifactContent"] {
  const directArtifactContent = extractStudyPlanArtifactRecord(payload) ?? payload;
  const rawSessions = extractStudyPlanSessions(directArtifactContent);
  const summary =
    stringOrUndefined(directArtifactContent.summary) ??
    stringOrUndefined(directArtifactContent.artifactSummary) ??
    stringOrUndefined(directArtifactContent.studyPlanSummary) ??
    stringOrUndefined(directArtifactContent.summaryText) ??
    stringOrUndefined(directArtifactContent.overview) ??
    stringOrUndefined(directArtifactContent.planSummary) ??
    (rawSessions.length > 0
      ? `${context.learnerName} will follow a one-week plan focused on ${context.focusTopics.join(", ")}.`
      : undefined);

  if (!summary) {
    throw new Error("Study plan candidate did not include an artifact summary.");
  }

  if (rawSessions.length === 0) {
    throw new Error("Study plan candidate did not include any study sessions.");
  }

  const sessions = rawSessions
    .map((session, index) => normalizeStudyPlanSession(session, index, context))
    .filter((session): session is StudyPlanGenerationCandidate["artifactContent"]["sessions"][number] =>
      Boolean(session)
    );

  if (sessions.length === 0) {
    throw new Error("Study plan candidate did not include any valid study sessions.");
  }

  return {
    summary,
    sessions,
    checkpoints: normalizeStudyPlanStringArray(
      directArtifactContent.checkpoints ??
        directArtifactContent.reviewCheckpoints ??
        directArtifactContent.checks ??
        directArtifactContent.successChecks,
      []
    ),
    notes: normalizeStudyPlanStringArray(
      directArtifactContent.notes ??
        directArtifactContent.studyNotes ??
        directArtifactContent.tips ??
        directArtifactContent.guidance,
      []
    )
  };
}

function extractStudyPlanArtifactRecord(value: Record<string, unknown>): Record<string, unknown> | undefined {
  const candidates: unknown[] = [
    value.artifactContent,
    value.content,
    value.artifact,
    value.studyPlan,
    value.plan,
    value.output,
    value.value
  ];

  for (const candidate of candidates) {
    if (!isRecord(candidate)) {
      continue;
    }

    if (
      "summary" in candidate ||
      "artifactSummary" in candidate ||
      "studyPlanSummary" in candidate ||
      "summaryText" in candidate ||
      "sessions" in candidate ||
      "studySessions" in candidate ||
      "sessionPlan" in candidate ||
      "dailyPlan" in candidate ||
      "planSummary" in candidate ||
      "overview" in candidate
    ) {
      return candidate;
    }

    const nested = extractStudyPlanArtifactRecord(candidate);
    if (nested) {
      return nested;
    }
  }

  return undefined;
}

function extractStudyPlanSessions(value: Record<string, unknown>): Array<Record<string, unknown>> {
  const candidates = [
    value.sessions,
    value.studySessions,
    value.weeklySessions,
    value.sessionPlan,
    value.dailyPlan,
    value.schedule,
    value.plan
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(isRecord);
    }

    if (isRecord(candidate)) {
      const nestedArrays = [
        candidate.sessions,
        candidate.studySessions,
        candidate.weeklySessions,
        candidate.sessionPlan,
        candidate.dailyPlan
      ];
      for (const nested of nestedArrays) {
        if (Array.isArray(nested)) {
          return nested.filter(isRecord);
        }
      }
    }
  }

  return [];
}

function normalizeStudyPlanSession(
  session: Record<string, unknown>,
  index: number,
  context: StudyPlanningContext
):
  | StudyPlanGenerationCandidate["artifactContent"]["sessions"][number]
  | undefined {
  const fallbackDay = context.schedule.find((entry) => entry.minutes > 0)?.day ?? context.schedule[0]?.day;
  const fallbackTopic = context.focusTopics[index % context.focusTopics.length] ?? context.focusTopics[0];
  const day = stringOrUndefined(session.day) ?? fallbackDay;
  const topic = stringOrUndefined(session.topic) ?? fallbackTopic;
  const activity = stringOrUndefined(session.activity);
  const outcome = stringOrUndefined(session.outcome);
  const minutes = numberOrUndefined(session.minutes);

  if (!day || !topic || !activity || !outcome || minutes === undefined) {
    return undefined;
  }

  return {
    day: day as StudyPlanGenerationCandidate["artifactContent"]["sessions"][number]["day"],
    minutes,
    topic,
    activity,
    outcome
  };
}

function normalizeStudyPlanAssumptions(
  value: unknown
): StudyPlanGenerationCandidate["assumptions"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry, index) => {
      if (typeof entry === "string" && entry.trim()) {
        return {
          id: `assumption_${index + 1}`,
          statement: entry.trim()
        };
      }

      if (!isRecord(entry)) {
        return undefined;
      }

      const statement =
        stringOrUndefined(entry.statement) ??
        stringOrUndefined(entry.assumption) ??
        stringOrUndefined(entry.text);
      if (!statement) {
        return undefined;
      }

      return {
        id: stringOrUndefined(entry.id) ?? `assumption_${index + 1}`,
        statement
      };
    })
    .filter(
      (
        entry
      ): entry is StudyPlanGenerationCandidate["assumptions"][number] => Boolean(entry)
    );
}

function normalizeStudyPlanStringArray(
  value: unknown,
  fallback: readonly string[]
): string[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const strings = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
  return strings.length > 0 ? strings : [...fallback];
}

function normalizeInitialAssessmentGenerationCandidate(
  value: unknown,
  context: {
    contextTopic: string;
    questionCount: number;
    relevantSourceExcerpts: readonly {
      content: string;
      excerpt: string;
      sourceRef: string;
      subtopic: string;
      topic: string;
    }[];
    sourceItems: readonly MasterDataItem[];
  }
): Pick<InitialAssessmentGenerationCandidate, "artifactContent" | "items"> {
  const payload = unwrapInitialAssessmentPayload(value);
  if (!isRecord(payload)) {
    throw new Error("Initial assessment candidate did not contain a structured object.");
  }

  const artifactContentRecord = extractArtifactContentRecord(payload);
  const promptSpecs = extractPromptSpecs(payload, artifactContentRecord);
  const sourceItemIdByRef = new Map(
    context.sourceItems.map((item) => [item.sourceRef ?? item.id, item.id])
  );
  const evidenceByRef = new Map(
    context.relevantSourceExcerpts.map((item) => [item.sourceRef, item])
  );

  const items = normalizeAssessmentItems({
    rawItems: payload.items,
    promptSpecs,
    contextTopic: context.contextTopic,
    sourceItemIdByRef,
    evidenceByRef,
    fallbackEvidence: context.relevantSourceExcerpts
  });

  if (items.length === 0) {
    throw new Error("Initial assessment candidate did not include any assessment items.");
  }

  return {
    items,
    artifactContent: normalizeAssessmentArtifactContent({
      artifactContent: artifactContentRecord,
      items,
      contextTopic: context.contextTopic,
      questionCount: context.questionCount
    })
  };
}

function normalizeAssessmentAttemptEvaluationCandidate(
  value: unknown,
  context: {
    assessment: {
      items: readonly AssessmentItem[];
      topic: string;
    };
    contextTopic: string;
    responses: readonly {
      answer: string;
      itemId: string;
    }[];
  }
): Pick<AssessmentAttemptEvaluationCandidate, "itemResults" | "knowledgeGaps" | "score"> {
  const payload = unwrapAssessmentAttemptEvaluationPayload(value);
  if (!isRecord(payload)) {
    throw new Error("Assessment attempt evaluation did not contain a structured object.");
  }

  const responseByItemId = new Map(
    context.responses.map((response) => [response.itemId, response.answer])
  );
  const itemRecords = extractAssessmentEvaluationItemRecords(payload);
  const itemResults =
    itemRecords.length > 0
      ? itemRecords
          .map((record, index) =>
            normalizeAssessmentEvaluationItemResult(record, index, {
              assessmentItems: context.assessment.items,
              contextTopic: context.contextTopic,
              responseByItemId
            })
          )
          .filter((item): item is EvaluationItemResult => Boolean(item))
      : context.assessment.items.map((item) => {
          const answer = responseByItemId.get(item.id) ?? "";
          const correct = normalize(answer) === normalize(item.canonicalAnswer);
          return {
            itemId: item.id,
            correct,
            feedback: correct
              ? `Secure response for ${item.topic}.`
              : `Review the underlying idea for ${item.topic} and revisit the missed method.`,
            topic: item.topic
          } satisfies EvaluationItemResult;
        });

  if (itemResults.length === 0) {
    throw new Error("Assessment attempt evaluation did not return a valid itemResults array.");
  }

  const score =
    numberOrUndefined(payload.score) ??
    numberOrUndefined(payload.percentage) ??
    numberOrUndefined(payload.fractionCorrect) ??
    deriveAssessmentEvaluationScore(itemResults);

  const knowledgeGaps = normalizeAssessmentKnowledgeGaps(payload, {
    contextTopic: context.contextTopic,
    itemResults,
    score
  });

  return {
    score,
    itemResults,
    knowledgeGaps
  };
}

function buildInterpretMasterDataPayload(input: {
  contentType: string;
  learnerYearGroup?: string;
  rawSourceContent: string;
  sourceId: string;
  sourceName: string;
  userHints?: {
    subject?: string;
    topic?: string;
  };
}) {
  return {
    sourceId: input.sourceId,
    sourceName: input.sourceName,
    rawSourceContent: input.rawSourceContent,
    contentType: input.contentType,
    learnerYearGroup: input.learnerYearGroup,
    userHints: input.userHints,
    outputContract: {
      schema: "MasterDataInterpretationCandidate.v1",
      fields: {
        schema: '"MasterDataInterpretationCandidate.v1"',
        detectedSubject: "string",
        detectedYearGroup: "string",
        mainTopic: "string",
        subtopics: ["string"],
        keyPeople: ["string"],
        keyTerms: ["string"],
        importantDates: ["string"],
        processes: ["string"],
        learnerFacingMaterialSummary: "string",
        learningObjectives: [
          {
            id: "string",
            objective: "string",
            sourceRefs: ["string"]
          }
        ],
        sourceMap: [
          {
            sourceRef: "string",
            excerpt: "string"
          }
        ],
        items: [
          {
            subject: "string",
            yearGroup: "string",
            topic: "string",
            subtopic: "string",
            itemType: "fact|person|key_term|date|cause|event|consequence|legacy",
            content: "string",
            sourceRef: "string",
            term: "string?",
            definition: "string?",
            person: "string?",
            date: "string?"
          }
        ]
      },
      rules: [
        "Return schema exactly as MasterDataInterpretationCandidate.v1.",
        "learningObjectives must be objects with id, objective, and sourceRefs; do not return strings.",
        "Use empty arrays, not null or omitted fields, when keyPeople, importantDates, or processes are absent.",
        "Every learning objective and structured item must include source refs that point to sourceMap entries."
      ],
      example: {
        schema: "MasterDataInterpretationCandidate.v1",
        detectedSubject: "Geography",
        detectedYearGroup: "Year 7",
        mainTopic: "Coasts",
        subtopics: ["Erosion", "Coastal Defences"],
        keyPeople: [],
        keyTerms: ["erosion", "sea wall"],
        importantDates: [],
        processes: ["erosion", "transportation", "deposition"],
        learnerFacingMaterialSummary:
          "Coasts explains how erosion, transportation, and deposition shape coastlines and how hard and soft engineering protect them.",
        learningObjectives: [
          {
            id: "objective_1",
            objective: "Explain how erosion, transportation, and deposition change coastlines.",
            sourceRefs: ["Coasts > Erosion > fact-1"]
          }
        ],
        sourceMap: [
          {
            sourceRef: "Coasts > Erosion > fact-1",
            excerpt: "Waves force air and water into cracks so pressure breaks rock off the cliff."
          }
        ],
        items: [
          {
            subject: "Geography",
            yearGroup: "Year 7",
            topic: "Coasts",
            subtopic: "Erosion",
            itemType: "fact",
            content: "Waves force air and water into cracks so pressure breaks rock off the cliff.",
            sourceRef: "Coasts > Erosion > fact-1"
          }
        ]
      }
    }
  };
}

function buildRelayCommand(input: {
  expectedOutputSchema: string;
  operation: string;
  payload: unknown;
}): {
  expectedOutputSchema: string;
  input: unknown;
  inputSchema: string;
  name: string;
  previewText: string;
  type: "command";
} {
  return {
    type: "command",
    name: relayCommandName(input.operation),
    inputSchema: relayInputSchema(input.operation),
    expectedOutputSchema: input.expectedOutputSchema,
    input: buildRelayCommandInput({
      expectedOutputSchema: input.expectedOutputSchema,
      operation: input.operation,
      payload: input.payload
    }),
    previewText: relayPreviewText(input.operation, input.payload)
  };
}

function unwrapInitialAssessmentPayload(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const nestedCandidates = [
    value.assessment,
    value.initialAssessment,
    value.candidate,
    value.payload
  ];

  for (const candidate of nestedCandidates) {
    if (isRecord(candidate) && ("items" in candidate || "artifactContent" in candidate || "questions" in candidate)) {
      return candidate;
    }
  }

  return value;
}

function unwrapAssessmentAttemptEvaluationPayload(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const nestedCandidates = [
    value.evaluation,
    value.assessmentEvaluation,
    value.candidate,
    value.payload
  ];

  for (const candidate of nestedCandidates) {
    if (
      isRecord(candidate) &&
      (
        "itemResults" in candidate ||
        "results" in candidate ||
        "questionResults" in candidate ||
        "knowledgeGaps" in candidate ||
        "focusAreas" in candidate ||
        "gaps" in candidate
      )
    ) {
      return candidate;
    }
  }

  return value;
}

function extractArtifactContentRecord(
  payload: Record<string, unknown>
): Record<string, unknown> | undefined {
  const direct = payload.artifactContent;
  if (isRecord(direct)) {
    return direct;
  }

  const artifact = payload.artifact;
  if (isRecord(artifact) && isRecord(artifact.content)) {
    return artifact.content;
  }

  return undefined;
}

function extractPromptSpecs(
  payload: Record<string, unknown>,
  artifactContentRecord?: Record<string, unknown>
): Array<Record<string, unknown>> {
  if (Array.isArray(payload.questions)) {
    return payload.questions.filter(isRecord);
  }

  if (artifactContentRecord && Array.isArray(artifactContentRecord.items)) {
    return artifactContentRecord.items.filter(isRecord);
  }

  return [];
}

function extractAssessmentEvaluationItemRecords(
  payload: Record<string, unknown>
): Array<Record<string, unknown>> {
  const candidates = [
    payload.itemResults,
    payload.results,
    payload.questionResults,
    payload.items,
    payload.marking
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(isRecord);
    }
  }

  return [];
}

function normalizeAssessmentEvaluationItemResult(
  record: Record<string, unknown>,
  index: number,
  context: {
    assessmentItems: readonly AssessmentItem[];
    contextTopic: string;
    responseByItemId: Map<string, string>;
  }
): EvaluationItemResult | undefined {
  const assessmentItem =
    context.assessmentItems.find((item) =>
      item.id ===
      (stringOrUndefined(record.itemId) ??
        stringOrUndefined(record.id) ??
        stringOrUndefined(record.questionId))
    ) ?? context.assessmentItems[index];
  const itemId =
    stringOrUndefined(record.itemId) ??
    stringOrUndefined(record.id) ??
    stringOrUndefined(record.questionId) ??
    assessmentItem?.id;

  if (!itemId) {
    return undefined;
  }

  const answer = context.responseByItemId.get(itemId) ?? "";
  const correct = inferAssessmentEvaluationCorrectness(record, assessmentItem, answer);
  const topic =
    stringOrUndefined(record.topic) ??
    stringOrUndefined(record.focusArea) ??
    assessmentItem?.topic ??
    context.contextTopic;
  const feedback =
    stringOrUndefined(record.feedback) ??
    stringOrUndefined(record.commentary) ??
    stringOrUndefined(record.comment) ??
    stringOrUndefined(record.reasoning) ??
    stringOrUndefined(record.explanation) ??
    (correct
      ? `Secure response for ${topic}.`
      : `Review the underlying idea for ${topic} and revisit the missed method.`);

  return {
    itemId,
    correct,
    feedback,
    topic
  };
}

function inferAssessmentEvaluationCorrectness(
  record: Record<string, unknown>,
  assessmentItem: AssessmentItem | undefined,
  answer: string
): boolean {
  if (typeof record.correct === "boolean") {
    return record.correct;
  }

  if (typeof record.isCorrect === "boolean") {
    return record.isCorrect;
  }

  const verdict =
    stringOrUndefined(record.verdict) ??
    stringOrUndefined(record.outcome) ??
    stringOrUndefined(record.status);
  if (verdict) {
    const normalizedVerdict = normalize(verdict);
    if (normalizedVerdict.includes("partial")) {
      return false;
    }
    if (
      normalizedVerdict.includes("incorrect") ||
      normalizedVerdict.includes("wrong") ||
      normalizedVerdict.includes("missing")
    ) {
      return false;
    }
    if (
      normalizedVerdict.includes("correct") ||
      normalizedVerdict.includes("secure") ||
      normalizedVerdict.includes("right")
    ) {
      return true;
    }
  }

  const score =
    numberOrUndefined(record.score) ??
    numberOrUndefined(record.itemScore) ??
    numberOrUndefined(record.credit);
  if (score !== undefined) {
    return score >= 1;
  }

  return assessmentItem
    ? normalize(answer) === normalize(assessmentItem.canonicalAnswer)
    : false;
}

function normalizeAssessmentKnowledgeGaps(
  payload: Record<string, unknown>,
  context: {
    contextTopic: string;
    itemResults: readonly EvaluationItemResult[];
    score: number;
  }
): AssessmentAttemptEvaluationCandidate["knowledgeGaps"] {
  const rawGaps =
    normalizeRawGapArray(payload.knowledgeGaps) ??
    normalizeRawGapArray(payload.focusAreas) ??
    normalizeRawGapArray(payload.gaps) ??
    normalizeRawGapArray(payload.misconceptions) ??
    [];

  const normalizedGaps = rawGaps
    .map((gap, index) => normalizeAssessmentKnowledgeGap(gap, index, context))
    .filter((gap): gap is AssessmentAttemptEvaluationCandidate["knowledgeGaps"][number] => Boolean(gap));

  if (normalizedGaps.length > 0) {
    return normalizedGaps;
  }

  return context.itemResults
    .filter((result) => !result.correct)
    .map((result) => ({
      topic: result.topic,
      description: `Needs more support with ${result.topic}.`,
      evidence: `Missed assessment item ${result.itemId}.`,
      severity: context.score < 0.5 ? "high" : "medium"
    }));
}

function normalizeRawGapArray(value: unknown): Array<Record<string, unknown> | string> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter(
    (entry): entry is Record<string, unknown> | string =>
      typeof entry === "string" || isRecord(entry)
  );
}

function normalizeAssessmentKnowledgeGap(
  gap: Record<string, unknown> | string,
  index: number,
  context: {
    contextTopic: string;
    itemResults: readonly EvaluationItemResult[];
    score: number;
  }
): AssessmentAttemptEvaluationCandidate["knowledgeGaps"][number] | undefined {
  if (typeof gap === "string") {
    return {
      topic: context.contextTopic,
      description: gap,
      evidence:
        context.itemResults.find((result) => !result.correct)?.feedback ??
        `Assessment evidence identified focus area ${index + 1}.`,
      severity: context.score < 0.5 ? "high" : "medium"
    };
  }

  const topic =
    stringOrUndefined(gap.topic) ??
    stringOrUndefined(gap.focusArea) ??
    stringOrUndefined(gap.area) ??
    context.contextTopic;
  const description =
    stringOrUndefined(gap.description) ??
    stringOrUndefined(gap.title) ??
    stringOrUndefined(gap.focus) ??
    stringOrUndefined(gap.summary) ??
    stringOrUndefined(gap.misconception) ??
    topic;
  const evidence =
    stringOrUndefined(gap.evidence) ??
    stringOrUndefined(gap.reason) ??
    stringOrUndefined(gap.rationale) ??
    stringOrUndefined(gap.feedback) ??
    `Assessment evidence identified a gap in ${topic}.`;

  if (!description) {
    return undefined;
  }

  return {
    topic,
    description,
    evidence,
    severity: normalizeKnowledgeGapSeverity(gap.severity, context.score)
  };
}

function normalizeKnowledgeGapSeverity(
  value: unknown,
  score: number
): KnowledgeGapSeverity {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }

  return score < 0.5 ? "high" : "medium";
}

function deriveAssessmentEvaluationScore(
  itemResults: readonly EvaluationItemResult[]
): number {
  if (itemResults.length === 0) {
    return 0;
  }

  return itemResults.filter((result) => result.correct).length / itemResults.length;
}

function normalizeAssessmentItems(input: {
  contextTopic: string;
  evidenceByRef: Map<string, { content: string; excerpt: string; sourceRef: string; subtopic: string; topic: string }>;
  fallbackEvidence: readonly {
    content: string;
    excerpt: string;
    sourceRef: string;
    subtopic: string;
    topic: string;
  }[];
  promptSpecs: readonly Record<string, unknown>[];
  rawItems: unknown;
  sourceItemIdByRef: Map<string, string>;
}): AssessmentItem[] {
  const rawItems = Array.isArray(input.rawItems) ? input.rawItems.filter(isRecord) : [];
  const sourceRecords = rawItems.length > 0 ? rawItems : input.promptSpecs;

  return sourceRecords
    .map((record, index) => {
      const sourceRef =
        stringOrUndefined(record.sourceRef) ??
        extractSourceRefFromVisibleMaterial(stringOrUndefined(record.visibleMaterial)) ??
        input.fallbackEvidence[index]?.sourceRef;
      const evidence = sourceRef ? input.evidenceByRef.get(sourceRef) : input.fallbackEvidence[index];
      const sourceMasterDataItemId =
        stringOrUndefined(record.sourceMasterDataItemId) ??
        (sourceRef ? input.sourceItemIdByRef.get(sourceRef) : undefined) ??
        input.sourceItemIdByRef.get(input.fallbackEvidence[index]?.sourceRef ?? "");
      const prompt =
        stringOrUndefined(record.prompt) ??
        stringOrUndefined(record.question) ??
        stringOrUndefined(input.promptSpecs[index]?.prompt) ??
        stringOrUndefined(input.promptSpecs[index]?.question);
      const canonicalAnswer =
        stringOrUndefined(record.canonicalAnswer) ??
        stringOrUndefined(record.answer) ??
        evidence?.content ??
        evidence?.excerpt;

      if (!prompt || !canonicalAnswer || !sourceMasterDataItemId) {
        return undefined;
      }

      return {
        id: stringOrUndefined(record.id) ?? `assessment_item_${index + 1}`,
        topic:
          stringOrUndefined(record.topic) ??
          stringOrUndefined(input.promptSpecs[index]?.topic) ??
          evidence?.topic ??
          input.contextTopic,
        prompt,
        canonicalAnswer,
        visibleMaterial:
          stringOrUndefined(record.visibleMaterial) ??
          (sourceRef
            ? `Source ref: ${sourceRef} · ${evidence?.topic ?? input.contextTopic} · recall from notes`
            : `Topic: ${input.contextTopic} · recall from notes`),
        difficulty: normalizeAssessmentDifficulty(
          stringOrUndefined(record.difficulty) ??
            stringOrUndefined(input.promptSpecs[index]?.difficulty),
          index
        ),
        sourceMasterDataItemId: sourceMasterDataItemId as AssessmentItem["sourceMasterDataItemId"]
      } satisfies AssessmentItem;
    })
    .filter((item): item is AssessmentItem => Boolean(item));
}

function normalizeAssessmentArtifactContent(input: {
  artifactContent?: Record<string, unknown>;
  contextTopic: string;
  items: readonly AssessmentItem[];
  questionCount: number;
}) {
  const topic =
    stringOrUndefined(input.artifactContent?.topic) ??
    input.contextTopic;
  const questionCount =
    numberOrUndefined(input.artifactContent?.questionCount) ??
    input.items.length ??
    input.questionCount;
  const instructions =
    stringOrUndefined(input.artifactContent?.instructions) ??
    `Complete all ${questionCount} questions without notes.`;
  const itemSpecs = Array.isArray(input.artifactContent?.items)
    ? input.artifactContent.items.filter(isRecord)
    : [];

  return {
    topic,
    questionCount,
    instructions,
    items:
      itemSpecs.length > 0
        ? itemSpecs.map((record, index) => ({
            id: stringOrUndefined(record.id) ?? input.items[index]?.id ?? `assessment_item_${index + 1}`,
            prompt:
              stringOrUndefined(record.prompt) ??
              stringOrUndefined(record.question) ??
              input.items[index]?.prompt ??
              `Question ${index + 1}`,
            difficulty: normalizeAssessmentDifficulty(
              stringOrUndefined(record.difficulty) ?? input.items[index]?.difficulty,
              index
            )
          }))
        : input.items.map((item) => ({
            id: item.id,
            prompt: item.prompt,
            difficulty: item.difficulty
          }))
  };
}

function normalizeAssessmentDifficulty(
  value: string | undefined,
  index: number
): "easy" | "medium" | "stretch" {
  if (value === "easy" || value === "medium" || value === "stretch") {
    return value;
  }

  if (index < 2) {
    return "easy";
  }
  if (index < 4) {
    return "medium";
  }
  return "stretch";
}

function extractSourceRefFromVisibleMaterial(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.match(/Source ref:\s*([^·]+?)(?:\s*·|$)/i);
  return match?.[1]?.trim();
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function createRelayIdempotencyKey(input: {
  learningLoopId: string;
  operation: string;
  payload: unknown;
}): string {
  const serialized = JSON.stringify(input.payload);
  let hash = 0;

  for (let index = 0; index < serialized.length; index += 1) {
    hash = (hash * 31 + serialized.charCodeAt(index)) >>> 0;
  }

  return `loop-study:${input.learningLoopId}:${input.operation}:${hash.toString(16)}`;
}

function unique(values: readonly string[]): string[] {
  return values.filter((value, index) => Boolean(value) && values.indexOf(value) === index);
}

function stageForOperation(operation: string): string {
  switch (operation) {
    case "interpretMasterData":
      return "material-intake";
    case "generateInitialAssessment":
    case "evaluateAssessmentAttempt":
      return "diagnosis";
    case "generateLearningLoopBatch":
      return "loop-batching";
    case "generateStudyPlan":
      return "planning";
    case "generatePracticeActivity":
      return "practice";
    case "evaluateActiveReviewSession":
      return "review";
    default:
      return "loop";
  }
}

function relayCommandName(operation: string): string {
  return isEvaluationOperation(operation)
    ? "runtime.evaluate_structured_response"
    : "runtime.generate_structured_candidate";
}

function relayInputSchema(operation: string): string {
  return isEvaluationOperation(operation)
    ? "RuntimeEvaluateStructuredResponseInput.v1"
    : "RuntimeGenerateStructuredCandidateInput.v1";
}

function relayPreviewText(operation: string, payload: unknown): string {
  const packet = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;

  switch (operation) {
    case "interpretMasterData":
      return `loop.study requested material interpretation for ${String(packet.sourceName ?? "a study source")}.`;
    case "generateInitialAssessment":
      return `loop.study requested an initial assessment for ${String(packet.topic ?? "the current topic")}.`;
    case "evaluateAssessmentAttempt":
      return `loop.study requested assessment evaluation for ${String(packet.contextTopic ?? "the current topic")}.`;
    case "generateStudyPlan":
      return `loop.study requested a study plan for ${String((packet.context as Record<string, unknown> | undefined)?.focusTopics ?? "current focus topics")}.`;
    case "generateLearningLoopBatch":
      return `loop.study requested a short loop batch for ${String((packet.materialInterpretation as Record<string, unknown> | undefined)?.mainTopic ?? "the current topic")}.`;
    case "generatePracticeActivity":
      return `loop.study requested a practice activity for ${String(packet.topic ?? "the current topic")}.`;
    case "evaluateActiveReviewSession":
      return "loop.study requested review evaluation for a practice session.";
    default:
      return "loop.study requested a structured runtime operation.";
  }
}

function buildRelayCommandInput(input: {
  expectedOutputSchema: string;
  operation: string;
  payload: unknown;
}): Record<string, unknown> {
  const payload = isRecord(input.payload) ? input.payload : {};

  return {
    candidateKind: candidateKindForOperation(input.operation),
    purpose: purposeForOperation(input.operation),
    expectedOutputSchema: input.expectedOutputSchema,
    outputContract: outputContractForOperation(input.operation, input.expectedOutputSchema),
    qualityRules: qualityRulesForOperation(input.operation),
    ...payload
  };
}

function candidateKindForOperation(operation: string): string {
  switch (operation) {
    case "interpretMasterData":
      return "master_data_interpretation";
    case "generateInitialAssessment":
      return "initial_assessment";
    case "evaluateAssessmentAttempt":
      return "assessment_attempt_evaluation";
    case "generateStudyPlan":
      return "study_plan";
    case "generateLearningLoopBatch":
      return "learning_loop_batch";
    case "generatePracticeActivity":
      return "practice_activity";
    case "evaluateActiveReviewSession":
      return "active_review_evaluation";
    default:
      return "structured_candidate";
  }
}

function purposeForOperation(operation: string): string {
  switch (operation) {
    case "interpretMasterData":
      return "Interpret uploaded study material into a validated structured study summary for loop.study.";
    case "generateInitialAssessment":
      return "Generate a diagnostic check-up grounded in the accepted material interpretation and source evidence.";
    case "evaluateAssessmentAttempt":
      return "Evaluate a learner's submitted assessment attempt against the generated check-up and accepted study context.";
    case "generateStudyPlan":
      return "Generate a structured study plan from the learner context and accepted material interpretations.";
    case "generateLearningLoopBatch":
      return "Generate a short batch of source-grounded learning loops from diagnosed gaps and the accepted study interpretation.";
    case "generatePracticeActivity":
      return "Generate an active-recall practice activity grounded in selected evidence and accepted objectives.";
    case "evaluateActiveReviewSession":
      return "Evaluate structured evidence from an active review session and return learner-safe guidance.";
    default:
      return "Generate a structured candidate for the current loop.study runtime operation.";
  }
}

function outputContractForOperation(
  operation: string,
  expectedOutputSchema: string
): Record<string, unknown> {
  if (operation === "interpretMasterData") {
    return {
      schema: "MasterDataInterpretationCandidate.v1",
      fields: {
        schema: '"MasterDataInterpretationCandidate.v1"',
        detectedSubject: "string",
        detectedYearGroup: "string",
        mainTopic: "string",
        subtopics: ["string"],
        keyPeople: ["string"],
        keyTerms: ["string"],
        importantDates: ["string"],
        processes: ["string"],
        learnerFacingMaterialSummary: "string",
        learningObjectives: [
          {
            id: "string",
            objective: "string",
            sourceRefs: ["string"]
          }
        ],
        sourceMap: [
          {
            sourceRef: "string",
            excerpt: "string"
          }
        ],
        items: [
          {
            subject: "string",
            yearGroup: "string",
            topic: "string",
            subtopic: "string",
            itemType: "fact|person|key_term|date|cause|event|consequence|legacy",
            content: "string",
            sourceRef: "string",
            term: "string?",
            definition: "string?",
            person: "string?",
            date: "string?"
          }
        ]
      },
      example: {
        schema: "MasterDataInterpretationCandidate.v1",
        detectedSubject: "Geography",
        detectedYearGroup: "Year 7",
        mainTopic: "Coasts",
        subtopics: ["Erosion", "Coastal Defences"],
        keyPeople: [],
        keyTerms: ["erosion", "sea wall"],
        importantDates: [],
        processes: ["erosion", "transportation", "deposition"],
        learnerFacingMaterialSummary:
          "Coasts explains how erosion, transportation, and deposition shape coastlines and how hard and soft engineering protect them.",
        learningObjectives: [
          {
            id: "objective_1",
            objective: "Explain how erosion, transportation, and deposition change coastlines.",
            sourceRefs: ["Coasts > Erosion > fact-1"]
          }
        ],
        sourceMap: [
          {
            sourceRef: "Coasts > Erosion > fact-1",
            excerpt: "Waves force air and water into cracks so pressure breaks rock off the cliff."
          }
        ],
        items: [
          {
            subject: "Geography",
            yearGroup: "Year 7",
            topic: "Coasts",
            subtopic: "Erosion",
            itemType: "fact",
            content: "Waves force air and water into cracks so pressure breaks rock off the cliff.",
            sourceRef: "Coasts > Erosion > fact-1"
          }
        ]
      }
    };
  }

  if (operation === "generateLearningLoopBatch") {
    return {
      schema: "LearningLoopBatchCandidate.v1",
      fields: {
        schema: '"LearningLoopBatchCandidate.v1"',
        overview: "string",
        targetDurationMinutes: "number",
        units: [
          {
            focus: "string",
            reason: "string",
            objectiveRefs: ["string"],
            sourceRefs: ["string"],
            targetKnowledgeGapIds: ["string"],
            shortExplanation: "string",
            learnerTask: "string",
            quickCheckQuestions: [{ prompt: "string" }],
            reviewItems: [{ prompt: "string", answer: "string" }],
            state: "locked|ready|in_progress|completed"
          }
        ]
      },
      example: {
        schema: "LearningLoopBatchCandidate.v1",
        overview: "Start with a short loop on coastal processes before moving into retrieval review.",
        targetDurationMinutes: 5,
        units: [
          {
            focus: "Coastal processes",
            reason: "This gap was identified in the diagnostic check-up.",
            objectiveRefs: ["objective_1"],
            sourceRefs: ["Coasts > Erosion > fact-1"],
            targetKnowledgeGapIds: ["gap_1"],
            shortExplanation:
              "Erosion, transportation, and deposition change coastlines over time.",
            learnerTask:
              "Spend 5 minutes explaining the three processes in your own words, then write one example from memory.",
            quickCheckQuestions: [
              {
                prompt: "How would you explain erosion without copying the notes?"
              }
            ],
            reviewItems: [
              {
                prompt: "What should you remember about coastal erosion?",
                answer: "Waves wear away rock and move sediment along the coast."
              }
            ],
            state: "ready"
          }
        ]
      }
    };
  }

  return {
    schema: expectedOutputSchema
  };
}

function qualityRulesForOperation(operation: string): string[] {
  switch (operation) {
    case "interpretMasterData":
      return [
        "Return schema exactly as MasterDataInterpretationCandidate.v1.",
        "learningObjectives must be objects with id, objective, and sourceRefs; do not return strings.",
        "Use empty arrays, not null or omitted fields, when keyPeople, importantDates, or processes are absent.",
        "Every learning objective and structured item must include source refs that point to sourceMap entries."
      ];
    case "generateInitialAssessment":
      return [
        "Ground every generated question in the accepted interpretation and provided source evidence.",
        "Include objective refs and source refs where the assessment schema allows them.",
        "Do not leak answers in prompts or copy source bullets verbatim as the learner task."
      ];
    case "generatePracticeActivity":
      return [
        "Generate active-recall prompts rather than copying source text directly.",
        "Reject flashcards with identical front and back text.",
        "Keep source grounding available through the provided evidence."
      ];
    case "generateStudyPlan":
      return [
        "Base the plan on the learner context and accepted interpretation objectives.",
        "Return a structured plan rather than free-form coaching prose."
      ];
    case "generateLearningLoopBatch":
      return [
        "Every loop unit must target one or more diagnosed gaps and reference accepted objectives and source refs.",
        "Each learnerTask must name one clear action and must not be a vague instruction like revise the topic.",
        "Quick checks must not leak answers, and review items must use active recall."
      ];
    case "evaluateAssessmentAttempt":
    case "evaluateActiveReviewSession":
      return [
        "Evaluate only against the supplied structured evidence.",
        "Return learner-safe feedback without leaking hidden scoring internals."
      ];
    default:
      return [];
  }
}

function isEvaluationOperation(operation: string): boolean {
  return (
    operation === "evaluateAssessmentAttempt" ||
    operation === "evaluateActiveReviewSession"
  );
}
