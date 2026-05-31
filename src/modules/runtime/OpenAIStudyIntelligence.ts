import type {
  AssessmentItem,
  AssessmentQuestionType,
  EvaluationItemResult
} from "../../domain/learning/Assessment.js";
import type { MasterDataItem, MasterDataSource } from "../../domain/learning/MasterData.js";
import type {
  PracticeItem,
  PracticeItemResponse
} from "../../domain/learning/PracticeActivity.js";
import type {
  InitialAssessmentContext,
  PracticeActivityContext,
  StudyPlanningContext
} from "../../domain/primitives/Context.js";
import { err, ok, type Result } from "../../domain/primitives/result.js";
import type {
  ActiveReviewEvaluationCandidate,
  AgentRuntime,
  AssessmentBlueprintCandidate,
  AssessmentAttemptEvaluationCandidate,
  InitialAssessmentGenerationCandidate,
  LearningLoopBatchGenerationCandidate,
  MasterDataInterpretationResultCandidate,
  PracticeActivityGenerationCandidate,
  StudyPlanGenerationCandidate
} from "./AgentRuntime.js";
import { FixtureAgentRuntime } from "./FixtureAgentRuntime.js";
import type {
  MasterDataInterpretationCandidate
} from "../masterData/MasterDataInterpretation.js";
import {
  normalizeCompatibleMasterDataInterpretationCandidate,
  validateMasterDataInterpretationCandidate
} from "../masterData/MasterDataInterpretation.js";
import type { RuntimeOperation, RuntimeTraceSeed } from "./RuntimeTrace.js";
import { createAssessmentArtifactContent } from "../assessment/InitialAssessmentAgent.js";

interface OpenAIStudyIntelligenceConfig {
  apiKey: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
  logger?: {
    info?(bindings: Record<string, unknown>, message: string): void;
    warn?(bindings: Record<string, unknown>, message: string): void;
  };
  model?: string;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ text?: string; type?: string }>;
    };
  }>;
  id?: string;
  model?: string;
}

export class OpenAIStudyIntelligence implements AgentRuntime {
  private readonly baseUrl: string;
  private readonly fallback = new FixtureAgentRuntime();
  private readonly fetcher: typeof fetch;
  private readonly model: string;

  constructor(private readonly config: OpenAIStudyIntelligenceConfig) {
    this.baseUrl = config.baseUrl ?? "https://api.openai.com/v1";
    this.fetcher = config.fetcher ?? fetch;
    this.model = config.model ?? "gpt-4.1-mini";
  }

  evaluateActiveReviewSession(input: {
    learningLoopId: string;
    practiceItems: readonly PracticeItem[];
    responses: readonly PracticeItemResponse[];
    runtimeConversationBinding?: never;
  }): Promise<Result<ActiveReviewEvaluationCandidate>> | Result<ActiveReviewEvaluationCandidate> {
    return this.withFallback<ActiveReviewEvaluationCandidate>(
      "evaluateActiveReviewSession",
      async () => {
        const generated = await this.requestJson<{
          itemResults: ActiveReviewEvaluationCandidate["itemResults"];
        }>({
          operation: "evaluateActiveReviewSession",
          outputContract:
            "Return JSON with itemResults[]. Each result must include practiceItemId, confidence, correct, overconfidence, and feedback.",
          qualityRules: [
            "Judge correctness from the learner response against the expected response.",
            "Do not omit any submitted practice item.",
            "Keep feedback concise and learner-safe."
          ],
          payload: {
            learningLoopId: input.learningLoopId,
            practiceItems: input.practiceItems,
            responses: input.responses
          }
        });
        if (!generated.ok) {
          return generated;
        }

        return ok({
          itemResults: generated.value.result.itemResults,
          runtimeTrace: generated.value.trace
        });
      },
      () => this.fallback.evaluateActiveReviewSession(input)
    );
  }

  evaluateAssessmentAttempt(input: {
    assessment: {
      items: readonly AssessmentItem[];
      topic: string;
    };
    contextTopic: string;
    learningLoopId: string;
    materialInterpretation?: MasterDataInterpretationCandidate;
    responses: readonly {
      answer: string;
      itemId: string;
    }[];
    runtimeConversationBinding?: never;
    sourceEvidence?: readonly {
      content: string;
      excerpt: string;
      sourceMasterDataItemId?: string;
      sourceRef: string;
      subtopic: string;
      topic: string;
    }[];
  }): Promise<Result<AssessmentAttemptEvaluationCandidate>> | Result<AssessmentAttemptEvaluationCandidate> {
    return this.withFallback<AssessmentAttemptEvaluationCandidate>(
      "evaluateAssessmentAttempt",
      async () => {
        const generated = await this.requestJson<{
          itemResults: readonly EvaluationItemResult[];
          knowledgeGaps: AssessmentAttemptEvaluationCandidate["knowledgeGaps"];
          score: number;
        }>({
          operation: "evaluateAssessmentAttempt",
          outputContract:
            "Return JSON with score (0..1), itemResults[], and knowledgeGaps[]. itemResults[] must include itemId, correct, feedback, and topic. knowledgeGaps[] must include topic, description, evidence, and severity.",
          qualityRules: [
            "Evaluate each assessment item separately.",
            "Use the accepted material interpretation and source evidence when available.",
            "Knowledge gaps must be grounded in the missed responses."
          ],
          payload: {
            learningLoopId: input.learningLoopId,
            assessment: input.assessment,
            contextTopic: input.contextTopic,
            materialInterpretation: input.materialInterpretation,
            responses: input.responses,
            sourceEvidence: input.sourceEvidence
          }
        });
        if (!generated.ok) {
          return generated;
        }

        return ok({
          itemResults: generated.value.result.itemResults,
          knowledgeGaps: generated.value.result.knowledgeGaps,
          score: generated.value.result.score,
          runtimeTrace: generated.value.trace
        });
      },
      () => this.fallback.evaluateAssessmentAttempt(input)
    );
  }

  interpretMasterData(input: {
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
  }): Promise<Result<MasterDataInterpretationResultCandidate>> | Result<MasterDataInterpretationResultCandidate> {
    return this.withFallback<MasterDataInterpretationResultCandidate>(
      "interpretMasterData",
      async () => {
        const generated = await this.requestJson<MasterDataInterpretationCandidate>({
          operation: "interpretMasterData",
          outputContract:
            "Return a MasterDataInterpretationCandidate.v1 object with detectedSubject, detectedYearGroup, mainTopic, subtopics, learnerFacingMaterialSummary, learningObjectives as objects, sourceMap, and items. Empty arrays are required when people, dates, or processes are absent.",
          qualityRules: [
            "Use the raw source content as the primary evidence.",
            "Every learning objective must include sourceRefs.",
            "Every item must include a sourceRef."
          ],
          payload: input
        });
        if (!generated.ok) {
          return generated;
        }

        try {
          const normalizedCandidate = normalizeCompatibleMasterDataInterpretationCandidate(
            generated.value.result,
            {
              sourceName: input.sourceName,
              rawSourceContent: input.rawSourceContent,
              learnerYearGroup: input.learnerYearGroup,
              userHints: input.userHints
            }
          );
          const interpretation = validateMasterDataInterpretationCandidate(normalizedCandidate);

          return ok({
            interpretation,
            runtimeTrace: generated.value.trace
          });
        } catch (error) {
          return err({
            code: "VALIDATION_ERROR",
            message:
              error instanceof Error
                ? `OpenAI returned a master-data interpretation that did not match the required loop.study structure. ${error.message}`
                : "OpenAI returned a master-data interpretation that did not match the required loop.study structure."
          });
        }
      },
      () => this.fallback.interpretMasterData(input)
    );
  }

  generateInitialAssessment(input: {
    context: InitialAssessmentContext;
    learningLoopId: string;
    runtimeConversationBinding?: never;
    source: MasterDataSource;
    sourceItems: readonly MasterDataItem[];
  }): Promise<Result<InitialAssessmentGenerationCandidate>> | Result<InitialAssessmentGenerationCandidate> {
    return this.withFallback<InitialAssessmentGenerationCandidate>(
      "generateInitialAssessment",
      async () => {
        const generated = await this.requestJson<{
          assessmentBlueprint?: AssessmentBlueprintCandidate;
          items: InitialAssessmentGenerationCandidate["items"];
        }>({
          operation: "generateInitialAssessment",
          outputContract:
            "Return JSON with assessmentBlueprint and items[]. assessmentBlueprint must include questionCount, maxQuestionCount, targetDurationMinutes, questionTypeMix, coveredSubtopics, objectiveRefs, sourceRefs, difficultyProfile, and rationale. Each item must include id, topic, prompt, canonicalAnswer, visibleMaterial, difficulty, sourceMasterDataItemId, questionType, hint, and sourceFact. If questionType is multiple_choice or multiple_select, include options[] and correctOptionIds[]. learningLoop must decide the actual question count inside assessmentBlueprint.questionCount and items[].length; do not echo the request blindly.",
          qualityRules: [
            "Questions must be answerable from the source material.",
            "Do not leak the answer in the prompt.",
            "Do not repeat the same question in different wording.",
            "Do not place the answer to one question inside another question.",
            "Cover distinct subtopics or objectives before doubling up on one narrow fact.",
            "Avoid vague prompts such as 'What should you remember about ...'.",
            "Prefer multiple-choice and multiple-select questions when the source supports fair distractors.",
            "Use free-form questions sparingly, only when a fair choice-based question would be forced or misleading.",
            "Choose the actual number of questions based on source breadth and learner age, up to the provided maximum question count.",
            "Hints must include a short source-grounded fact without giving away the whole final answer unless the item is already very direct.",
            "Preserve source grounding through sourceMasterDataItemId and visibleMaterial."
          ],
          payload: {
            learningLoopId: input.learningLoopId,
            context: input.context,
            assessmentPlanRequest: {
              maxQuestionCount: input.context.questionCount,
              targetDurationMinutes: deriveAssessmentTargetDurationMinutes(input.context.questionCount),
              allowedQuestionTypes: ["free_form", "multiple_choice", "multiple_select"],
              coverageGoal: "span major subtopics and objectives before repeating a narrow fact",
              learnerExperienceGoal: "short diagnostic with a game-like mix of difficulty and question styles"
            },
            source: input.source.toStorageSnapshot(),
            sourceItems: input.sourceItems.map((item) => item.toRuntimePayload())
          }
        });
        if (!generated.ok) {
          return generated;
        }

        const enrichedItems = enrichAssessmentItemsFromSource(
          generated.value.result.items,
          input.sourceItems
        );
        if (enrichedItems.length === 0) {
          return err({
            code: "VALIDATION_ERROR",
            message: "OpenAI returned an assessment without any diagnostic items."
          });
        }

        if (enrichedItems.length > input.context.questionCount) {
          return err({
            code: "VALIDATION_ERROR",
            message:
              "OpenAI returned an assessment that exceeded the requested assessment limit."
          });
        }

        const blueprint = normalizeAssessmentBlueprint(
          generated.value.result.assessmentBlueprint,
          enrichedItems,
          input.sourceItems,
          input.context.questionCount
        );

        return ok({
          artifactContent: createAssessmentArtifactContent({
            topic: input.context.topic,
            questionCount: enrichedItems.length,
            items: enrichedItems.map((item) => ({
              id: item.id,
              prompt: item.prompt,
              difficulty: item.difficulty,
              questionType: item.questionType,
              hint: item.hint
            }))
          }),
          blueprint,
          items: enrichedItems,
          runtimeTrace: generated.value.trace
        });
      },
      () => this.fallback.generateInitialAssessment(input)
    );
  }

  generatePracticeActivity(input: {
    context: PracticeActivityContext;
    learningLoopId: string;
    materialInterpretation?: MasterDataInterpretationCandidate;
    runtimeConversationBinding?: never;
    selections: readonly {
      gap: {
        description: string;
        id: string;
      };
      item: MasterDataItem;
    }[];
  }): Promise<Result<PracticeActivityGenerationCandidate>> | Result<PracticeActivityGenerationCandidate> {
    return this.withFallback<PracticeActivityGenerationCandidate>(
      "generatePracticeActivity",
      async () => {
        const generated = await this.requestJson<{
          flashcardSet: PracticeActivityGenerationCandidate["flashcardSet"];
        }>({
          operation: "generatePracticeActivity",
          outputContract:
            "Return JSON with flashcardSet.instructions and flashcardSet.cards[]. Each card must include id, front, back, topic, knowledgeGapId, learningObjective, sourceMasterDataItemId, and sourceVisibleSentence.",
          qualityRules: [
            "Use active recall prompts on card fronts.",
            "Do not copy source bullets verbatim as the front of the card.",
            "Do not use vague prompts such as 'What should you remember about ...'.",
            "Vary card fronts across subtopics instead of repeating the same pattern.",
            "Every card must stay tied to the selected source item and knowledge gap."
          ],
          payload: {
            learningLoopId: input.learningLoopId,
            context: input.context,
            materialInterpretation: input.materialInterpretation,
            selections: input.selections.map(({ gap, item }) => ({
              gap,
              item: item.toRuntimePayload()
            }))
          }
        });
        if (!generated.ok) {
          return generated;
        }

        return ok({
          flashcardSet: generated.value.result.flashcardSet,
          runtimeTrace: generated.value.trace
        });
      },
      () => this.fallback.generatePracticeActivity(input)
    );
  }

  generateLearningLoopBatch(input: {
    desiredLoopCount: number;
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
    learningLoopId: string;
    materialInterpretation: MasterDataInterpretationCandidate;
    runtimeConversationBinding?: never;
    targetLoopDurationMinutes: number;
  }): Promise<Result<LearningLoopBatchGenerationCandidate>> | Result<LearningLoopBatchGenerationCandidate> {
    return this.withFallback<LearningLoopBatchGenerationCandidate>(
      "generateLearningLoopBatch",
      async () => {
        const generated = await this.requestJson<{
          overview: string;
          targetDurationMinutes: number;
          units: LearningLoopBatchGenerationCandidate["units"];
        }>({
          operation: "generateLearningLoopBatch",
          outputContract:
            "Return JSON with overview, targetDurationMinutes, and units[]. Each unit must include focus, reason, objectiveRefs, sourceRefs, shortExplanation, learnerTask, quickCheckQuestions, optional reviewItems, targetKnowledgeGapIds, and state. Each quickCheckQuestion must include prompt, questionType, hint, and sourceFact. If questionType is multiple_choice or multiple_select, include options[] and correctOptionIds[].",
          qualityRules: [
            "Each loop unit must target at least one diagnosed gap.",
            "Each learner task must be a clear 3-5 minute action.",
            "Quick checks must not leak answers.",
            "Default quick checks to multiple-choice or multiple-select when the source supports fair distractors.",
            "Only use free-form quick checks when the source is too thin for a fair choice question.",
            "Review items must use specific active recall prompts, not vague reminders."
          ],
          payload: input
        });
        if (!generated.ok) {
          return generated;
        }

        return ok({
          overview: generated.value.result.overview,
          targetDurationMinutes: generated.value.result.targetDurationMinutes,
          units: generated.value.result.units,
          runtimeTrace: generated.value.trace
        });
      },
      () => this.fallback.generateLearningLoopBatch(input)
    );
  }

  generateStudyPlan(input: {
    context: StudyPlanningContext;
    learningLoopId: string;
    materialInterpretations?: readonly MasterDataInterpretationCandidate[];
    runtimeConversationBinding?: never;
  }): Promise<Result<StudyPlanGenerationCandidate>> | Result<StudyPlanGenerationCandidate> {
    return this.withFallback<StudyPlanGenerationCandidate>(
      "generateStudyPlan",
      async () => {
        const generated = await this.requestJson<{
          artifactContent: StudyPlanGenerationCandidate["artifactContent"];
          assumptions: readonly { id: string; statement: string }[];
          childTaskSummaries: readonly string[];
          decisions: readonly string[];
        }>({
          operation: "generateStudyPlan",
          outputContract:
            "Return JSON with artifactContent, assumptions, childTaskSummaries, and decisions.",
          qualityRules: [
            "Keep sessions concrete and age-appropriate.",
            "Use the accepted material interpretations when provided."
          ],
          payload: input
        });
        if (!generated.ok) {
          return generated;
        }

        return ok({
          artifactContent: generated.value.result.artifactContent,
          assumptions: generated.value.result.assumptions,
          childTaskSummaries: generated.value.result.childTaskSummaries,
          decisions: generated.value.result.decisions,
          runtimeTrace: generated.value.trace
        });
      },
      () => this.fallback.generateStudyPlan(input)
    );
  }

  private async requestJson<T>(input: {
    operation: RuntimeOperation;
    outputContract: string;
    payload: unknown;
    qualityRules: readonly string[];
  }): Promise<Result<{ result: T; trace: RuntimeTraceSeed }>> {
    try {
      const response = await this.fetcher(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "authorization": `Bearer ${this.config.apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: "developer",
              content: [
                "You are loop.study, a structured study intelligence runtime.",
                "Return valid JSON only.",
                input.outputContract,
                `Quality rules: ${input.qualityRules.join(" ")}`
              ].join("\n")
            },
            {
              role: "user",
              content: JSON.stringify({
                operation: input.operation,
                payload: input.payload
              })
            }
          ],
          response_format: {
            type: "json_object"
          }
        })
      });

      if (!response.ok) {
        const body = await response.text();
        return err({
          code: "VALIDATION_ERROR",
          message: `OpenAI request failed with status ${response.status}. ${body}`
        });
      }

      const body = (await response.json()) as ChatCompletionResponse;
      const content = extractContent(body);
      if (!content) {
        return err({
          code: "VALIDATION_ERROR",
          message: "OpenAI response did not include message content."
        });
      }

      const parsed = JSON.parse(content) as T;
      return ok({
        result: parsed,
        trace: {
          provider: "openai",
          operation: input.operation,
          runtimeArtifacts: body.id
            ? [
                {
                  id: body.id,
                  kind: body.model ?? "chat_completion"
                }
              ]
            : []
        }
      });
    } catch (error) {
      return err({
        code: "VALIDATION_ERROR",
        message:
          error instanceof Error ? error.message : "OpenAI runtime returned an invalid response."
      });
    }
  }

  private async withFallback<T>(
    operation: RuntimeOperation,
    primary: () => Promise<Result<T>>,
    fallback: () => Result<T> | Promise<Result<T>>
  ): Promise<Result<T>> {
    let result: Result<T>;
    try {
      result = await primary();
    } catch (error) {
      this.config.logger?.warn?.(
        {
          operation,
          provider: "openai",
          fallbackProvider: "fixture"
        },
        `OpenAIStudyIntelligence primary operation threw before returning a Result for ${operation}: ${
          error instanceof Error ? error.message : "unknown error"
        }`
      );
      return await fallback();
    }

    if (result.ok) {
      return result;
    }

    this.config.logger?.warn?.(
      {
        operation,
        provider: "openai",
        fallbackProvider: "fixture"
      },
      `OpenAIStudyIntelligence fell back to FixtureAgentRuntime for ${operation}: ${result.error.message}`
    );
    return await fallback();
  }
}

function extractContent(response: ChatCompletionResponse): string | undefined {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return stripJsonFences(content);
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim();
    return text ? stripJsonFences(text) : undefined;
  }

  return undefined;
}

function stripJsonFences(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }

  return trimmed;
}

function buildAssessmentHint(item: MasterDataItem): string {
  const fact = item.content ?? item.canonicalAnswer;
  const sourceRef = item.sourceRef ? ` (${item.sourceRef})` : "";
  return `Hint${sourceRef}: ${fact}`;
}

function buildAssessmentSourceFact(item: MasterDataItem): string {
  return item.content ?? item.canonicalAnswer;
}

function deriveAssessmentTargetDurationMinutes(maxQuestionCount: number): number {
  return Math.max(5, Math.min(10, maxQuestionCount));
}

function normalizeAssessmentBlueprint(
  blueprint: AssessmentBlueprintCandidate | undefined,
  items: InitialAssessmentGenerationCandidate["items"],
  sourceItems: readonly MasterDataItem[],
  maxQuestionCount: number
): AssessmentBlueprintCandidate {
  const sourceRefs = unique(
    sourceItems.map((item) => item.sourceRef).filter((value): value is string => Boolean(value))
  );
  const coveredSubtopics = unique(
    sourceItems.map((item) => item.subtopic?.trim() || item.topic.trim()).filter(Boolean)
  );
  const questionTypeMix = uniqueQuestionTypes(
    items.map((item) => item.questionType ?? "free_form")
  );
  const difficultyProfile = {
    easy: proportionOf(items, "easy"),
    medium: proportionOf(items, "medium"),
    stretch: proportionOf(items, "stretch")
  };

  return {
    questionCount: items.length,
    maxQuestionCount,
    targetDurationMinutes:
      clampPositiveInteger(blueprint?.targetDurationMinutes) ?? deriveAssessmentTargetDurationMinutes(items.length),
    questionTypeMix,
    coveredSubtopics:
      blueprint?.coveredSubtopics?.filter(Boolean).length
        ? unique(blueprint.coveredSubtopics.filter(Boolean))
        : coveredSubtopics,
    objectiveRefs: blueprint?.objectiveRefs?.filter(Boolean) ?? [],
    sourceRefs: blueprint?.sourceRefs?.filter(Boolean)?.length
      ? unique(blueprint.sourceRefs.filter(Boolean))
      : sourceRefs,
    difficultyProfile,
    rationale:
      typeof blueprint?.rationale === "string" && blueprint.rationale.trim().length > 0
        ? blueprint.rationale.trim()
        : "Use a short source-grounded diagnostic that spans major subtopics before narrowing in."
  };
}

function enrichAssessmentItemsFromSource(
  items: InitialAssessmentGenerationCandidate["items"],
  sourceItems: readonly MasterDataItem[]
): InitialAssessmentGenerationCandidate["items"] {
  return items.map((item, index) => {
    const sourceItem =
      sourceItems.find((candidate) => candidate.id === item.sourceMasterDataItemId) ??
      sourceItems[index];

    const inferredQuestionType =
      item.questionType ??
      (Array.isArray(item.correctOptionIds) && item.correctOptionIds.length > 1
        ? "multiple_select"
        : Array.isArray(item.options) && item.options.length > 1
          ? "multiple_choice"
          : "free_form");
    const normalizedQuestionType =
      inferredQuestionType === "multiple_choice" || inferredQuestionType === "multiple_select"
        ? Array.isArray(item.options) && item.options.length > 1
          ? inferredQuestionType
          : "free_form"
        : "free_form";

    return {
      ...item,
      questionType: normalizedQuestionType,
      hint: item.hint ?? (sourceItem ? buildAssessmentHint(sourceItem) : item.visibleMaterial),
      sourceFact:
        item.sourceFact ?? (sourceItem ? buildAssessmentSourceFact(sourceItem) : item.canonicalAnswer),
      options: normalizedQuestionType === "free_form" ? undefined : item.options,
      correctOptionIds:
        normalizedQuestionType !== "free_form" &&
        Array.isArray(item.correctOptionIds) &&
        item.correctOptionIds.length > 0
          ? item.correctOptionIds
          : undefined
    };
  });
}

function clampPositiveInteger(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  const rounded = Math.round(value);
  return rounded > 0 ? rounded : undefined;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function proportionOf(
  items: readonly { difficulty: "easy" | "medium" | "stretch" }[],
  difficulty: "easy" | "medium" | "stretch"
) {
  if (items.length === 0) {
    return 0;
  }

  return Number(
    (items.filter((item) => item.difficulty === difficulty).length / items.length).toFixed(2)
  );
}

function uniqueQuestionTypes(values: readonly AssessmentQuestionType[]): AssessmentQuestionType[] {
  return [...new Set(values)];
}
