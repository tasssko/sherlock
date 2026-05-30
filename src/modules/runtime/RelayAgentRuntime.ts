import { err, ok, type Result } from "../../domain/primitives/result.js";
import type {
  ActiveReviewEvaluationCandidate,
  AgentRuntime,
  AssessmentAttemptEvaluationCandidate,
  InitialAssessmentGenerationCandidate,
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
import type { AssessmentItem } from "../../domain/learning/Assessment.js";
import type {
  PracticeItem,
  PracticeItemResponse
} from "../../domain/learning/PracticeActivity.js";
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

  evaluateAssessmentAttempt(input: {
    assessment: {
      items: readonly AssessmentItem[];
      topic: string;
    };
    contextTopic: string;
    learningLoopId: string;
    responses: readonly {
      answer: string;
      itemId: string;
    }[];
    runtimeConversationBinding?: RuntimeConversationBinding;
  }): Promise<Result<AssessmentAttemptEvaluationCandidate>> {
    return this.runStructuredConversation<AssessmentAttemptEvaluationCandidate>({
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
        responses: input.responses
      }
    });
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
    const relevantSourceExcerpts = buildSourceEvidenceFromInterpretation({
      interpretation: input.source.acceptedInterpretation,
      items: input.sourceItems.map((item) => ({
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
        materialInterpretation: input.source.acceptedInterpretation
          ? buildMasterDataInterpretationSummary(input.source.acceptedInterpretation)
          : {
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
              learnerFacingMaterialSummary: undefined
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

function extractInterpretationCandidatePayload(
  value: MasterDataInterpretationCandidate | { interpretation: MasterDataInterpretationCandidate }
): unknown {
  if (isRecord(value) && "interpretation" in value) {
    return value.interpretation;
  }

  return value;
}

function extractRelayStructuredValue(value: unknown): unknown {
  if (!isRecord(value)) {
    return undefined;
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

  return undefined;
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
    input: input.payload,
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
  switch (operation) {
    case "interpretMasterData":
      return "loop_study.interpret_master_data";
    case "generateInitialAssessment":
      return "loop_study.generate_initial_assessment";
    case "evaluateAssessmentAttempt":
      return "loop_study.evaluate_assessment_attempt";
    case "generateStudyPlan":
      return "loop_study.generate_study_plan";
    case "generatePracticeActivity":
      return "loop_study.generate_practice_activity";
    case "evaluateActiveReviewSession":
      return "loop_study.evaluate_active_review_session";
    default:
      return `loop_study.${operation}`;
  }
}

function relayInputSchema(operation: string): string {
  switch (operation) {
    case "interpretMasterData":
      return "LoopStudyInterpretMasterDataInput.v1";
    case "generateInitialAssessment":
      return "LoopStudyGenerateInitialAssessmentInput.v1";
    case "evaluateAssessmentAttempt":
      return "LoopStudyEvaluateAssessmentAttemptInput.v1";
    case "generateStudyPlan":
      return "LoopStudyGenerateStudyPlanInput.v1";
    case "generatePracticeActivity":
      return "LoopStudyGeneratePracticeActivityInput.v1";
    case "evaluateActiveReviewSession":
      return "LoopStudyEvaluateActiveReviewSessionInput.v1";
    default:
      return "LoopStudyCommandInput.v1";
  }
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
    case "generatePracticeActivity":
      return `loop.study requested a practice activity for ${String(packet.topic ?? "the current topic")}.`;
    case "evaluateActiveReviewSession":
      return "loop.study requested review evaluation for a practice session.";
    default:
      return "loop.study requested a structured runtime operation.";
  }
}
