import { PracticeActivity } from "../../domain/learning/PracticeActivity.js";
import type { MasterDataItem } from "../../domain/learning/MasterData.js";
import type { QuestionSeed, QuestionVariant } from "../../domain/learning/QuestionBank.js";
import type { PracticeActivityContext } from "../../domain/primitives/Context.js";
import type { DomainEventRecorder } from "../../domain/primitives/Event.js";
import type { Task } from "../../domain/primitives/Task.js";
import type { Workspace } from "../../domain/primitives/Workspace.js";
import type { LearningLoop } from "../../domain/learning/LearningLoop.js";
import type { FlashcardSet } from "../../domain/learning/PracticeActivity.js";
import type { MasterDataInterpretationCandidate } from "../masterData/MasterDataInterpretation.js";
import { selectInterpretationObjectives } from "../masterData/MasterDataInterpretation.js";
import { err, ok, type Result } from "../../domain/primitives/result.js";
import { createPracticeActivityAgent, validatePracticeActivity } from "./PracticeActivityAgent.js";
import { PracticeActivityQualityValidator } from "./PracticeActivityQualityValidator.js";
import type { PracticeActivitySelection } from "./PracticeSourceSelector.js";
import type { AgentRuntime } from "../runtime/AgentRuntime.js";
import { FixtureAgentRuntime } from "../runtime/FixtureAgentRuntime.js";
import { OpenAIStudyIntelligence } from "../runtime/OpenAIStudyIntelligence.js";
import type { RuntimeTraceSeed } from "../runtime/RuntimeTrace.js";
import type { RuntimeConversationBinding } from "../runtime/RuntimeConversationBinding.js";

export interface FlashcardSetAssembly {
  agent: ReturnType<typeof createPracticeActivityAgent>;
  practiceActivity: PracticeActivity;
  runtimeConversationBinding?: RuntimeConversationBinding;
  runtimeTrace?: RuntimeTraceSeed;
}

export class FlashcardSetAssembler {
  private readonly preferSeedVariants: boolean;

  constructor(
    private readonly runtime: AgentRuntime = new FixtureAgentRuntime(),
    private readonly qualityValidator = new PracticeActivityQualityValidator()
  ) {
    this.preferSeedVariants =
      runtime instanceof FixtureAgentRuntime ||
      runtime instanceof OpenAIStudyIntelligence;
  }

  async assemble(input: {
    context: PracticeActivityContext;
    events: DomainEventRecorder;
    learningLoop: LearningLoop;
    materialInterpretation?: MasterDataInterpretationCandidate;
    runtimeConversationBinding?: RuntimeConversationBinding;
    selections: readonly PracticeActivitySelection[];
    task: Task;
    workspace: Workspace;
  }): Promise<Result<FlashcardSetAssembly>> {
    const seededFlashcardSet = this.preferSeedVariants
      ? buildSeededFlashcardSet(input.selections)
      : undefined;
    const validatedSeededFlashcardSet = seededFlashcardSet
      ? this.validateSeededFlashcardSet(seededFlashcardSet)
      : undefined;
    const generated = seededFlashcardSet
      ? validatedSeededFlashcardSet
        ? undefined
        : await this.runtime.generatePracticeActivity({
            context: input.context,
            learningLoopId: input.learningLoop.id,
            materialInterpretation: input.materialInterpretation,
            selections: input.selections.map(({ gap, item }) => ({
              gap: {
                id: gap.id,
                description: gap.toSnapshot().description
              },
              item
            })),
            runtimeConversationBinding: input.runtimeConversationBinding
          })
      : await this.runtime.generatePracticeActivity({
          context: input.context,
          learningLoopId: input.learningLoop.id,
          materialInterpretation: input.materialInterpretation,
          selections: input.selections.map(({ gap, item }) => ({
            gap: {
              id: gap.id,
              description: gap.toSnapshot().description
            },
            item
          })),
          runtimeConversationBinding: input.runtimeConversationBinding
        });
    if (generated && !generated.ok) {
      return generated;
    }

    const flashcardSet = validatedSeededFlashcardSet
      ? ok(validatedSeededFlashcardSet)
      : normalizeFlashcardSet(generated?.value as unknown, input.selections);
    if (!flashcardSet.ok) {
      return flashcardSet;
    }

    const validatedCards = this.qualityValidator.validate(flashcardSet.value.cards);
    if (!validatedCards.ok) {
      return validatedCards;
    }

    const normalizedFlashcardSet = {
      instructions: flashcardSet.value.instructions,
      cards: validatedCards.value
    };
    const learningObjectives = selectInterpretationObjectives({
      interpretation: input.materialInterpretation,
      sourceRefs: input.selections.map(({ item }) => item.sourceRef ?? item.id),
      fallbackObjectives: input.selections.map(({ gap }) => gap.toSnapshot().description)
    });
    const agent = createPracticeActivityAgent();
    const policyEvaluation = validatePracticeActivity(
      agent,
      input.context,
      normalizedFlashcardSet,
      input.events
    );
    if (!policyEvaluation.ok) {
      return policyEvaluation;
    }

    return ok({
      agent,
      practiceActivity: PracticeActivity.create({
        workspaceId: input.workspace.id,
        learningLoopId: input.learningLoop.id,
        title: `Flashcard practice for ${input.context.topic}`,
        taskId: input.task.id,
        targetKnowledgeGapIds: input.selections.map(({ gap }) => gap.id),
        learningObjectives,
        sourceMasterDataItemIds: input.selections.map(({ item }) => item.id),
        flashcardSet: normalizedFlashcardSet
      }),
      runtimeConversationBinding: generated?.value.runtimeConversationBinding,
      runtimeTrace: generated?.value.runtimeTrace
    });
  }

  private validateSeededFlashcardSet(flashcardSet: FlashcardSet): FlashcardSet | undefined {
    const validatedCards = this.qualityValidator.validate(flashcardSet.cards);
    if (!validatedCards.ok) {
      return undefined;
    }

    return {
      instructions: flashcardSet.instructions,
      cards: validatedCards.value
    };
  }
}

function buildSeededFlashcardSet(
  selections: readonly PracticeActivitySelection[]
): FlashcardSet | undefined {
  const seededSelections = selections.filter(
    (selection): selection is PracticeActivitySelection & {
      questionSeed: QuestionSeed;
      reviewVariant: QuestionVariant;
    } => Boolean(selection.questionSeed && selection.reviewVariant)
  );

  if (seededSelections.length === 0 || seededSelections.length !== selections.length) {
    return undefined;
  }

  return {
    instructions:
      "Answer each card from memory first, then flip to compare with the model answer and explanation.",
    cards: seededSelections.map(({ gap, item, questionSeed, reviewVariant }, index) => {
      const seedSnapshot = questionSeed.toSnapshot();
      const variantSnapshot = reviewVariant.toSnapshot();

      return {
        id: `${variantSnapshot.id}::${index + 1}`,
        front: variantSnapshot.prompt,
        back: variantSnapshot.expectedAnswer ?? seedSnapshot.answerModel,
        topic: item.topic,
        knowledgeGapId: gap.id,
        learningObjective: seedSnapshot.objectiveRefs[0] ?? gap.toSnapshot().description,
        sourceMasterDataItemId: item.id,
        sourceVisibleSentence:
          item.visibleMaterial || item.content || seedSnapshot.explanation || `Review ${seedSnapshot.focus}.`
      };
    })
  };
}

function normalizeFlashcardSet(
  candidate: unknown,
  selections: readonly PracticeActivitySelection[]
): Result<FlashcardSet> {
  const record = isRecord(candidate) ? candidate : {};
  const direct = toFlashcardSet(record.flashcardSet, selections);
  if (direct) {
    return ok(direct);
  }

  const artifactContent = isRecord(record.artifactContent) ? record.artifactContent : undefined;
  const nested =
    toFlashcardSet(artifactContent?.flashcardSet, selections) ??
    toFlashcardSet(artifactContent, selections);
  if (nested) {
    return ok(nested);
  }

  const topLevelCards = Array.isArray(record.cards) ? record.cards : undefined;
  if (topLevelCards) {
    return ok({
      instructions:
        typeof record.instructions === "string"
          ? record.instructions
          : "Work through each flashcard and answer from memory before flipping it.",
      cards: topLevelCards.map((card, index) => normalizeFlashcard(card, selections[index]))
    });
  }

  return err({
    code: "VALIDATION_ERROR",
    message: "Practice activity candidate did not include a valid flashcard set."
  });
}

function toFlashcardSet(
  value: unknown,
  selections: readonly PracticeActivitySelection[]
): FlashcardSet | undefined {
  if (!isRecord(value) || !Array.isArray(value.cards)) {
    return undefined;
  }

  return {
    instructions:
      typeof value.instructions === "string"
        ? value.instructions
        : "Work through each flashcard and answer from memory before flipping it.",
    cards: value.cards.map((card, index) => normalizeFlashcard(card, selections[index]))
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeFlashcard(
  value: unknown,
  selection: PracticeActivitySelection | undefined
): FlashcardSet["cards"][number] {
  const record = isRecord(value) ? value : {};
  const fallbackItem = selection?.item;
  const fallbackGap = selection?.gap;

  const sourceRef = firstString(
    record.sourceRef,
    record.source_id,
    record.sourceReference
  );
  const sourceMasterDataItemId = firstString(
    record.sourceMasterDataItemId,
    record.sourceItemId,
    record.masterDataItemId,
    record.itemId,
    resolveSourceItemIdFromRef(selection, sourceRef),
    fallbackItem?.id
  );
  const knowledgeGapId =
    (firstString(record.knowledgeGapId, record.gapId, fallbackGap?.id, "") ??
      "") as FlashcardSet["cards"][number]["knowledgeGapId"];

  return {
    id:
      firstString(
        record.id,
        record.cardId,
        record.practiceItemId,
        `flashcard_${sourceMasterDataItemId ?? "generated"}`
      ) ?? `flashcard_${sourceMasterDataItemId ?? "generated"}`,
    front:
      firstString(
        record.front,
        record.prompt,
        record.question,
        record.clue,
        fallbackItem?.prompt,
        ""
      ) ?? "",
    back:
      firstString(
      record.back,
      record.answer,
      record.expectedResponse,
      record.response,
      fallbackItem?.content,
      fallbackItem?.canonicalAnswer,
      ""
    ) ?? "",
    topic: firstString(record.topic, record.focus, fallbackItem?.topic, "") ?? "",
    knowledgeGapId,
    learningObjective:
      firstString(
      record.learningObjective,
      record.objective,
      record.focus,
      record.reason,
      fallbackGap?.toSnapshot().description,
      ""
    ) ?? "",
    sourceMasterDataItemId:
      (sourceMasterDataItemId ?? "") as FlashcardSet["cards"][number]["sourceMasterDataItemId"],
    sourceVisibleSentence:
      firstString(
      record.sourceVisibleSentence,
      record.sourceSentence,
      record.excerpt,
      record.evidence,
      record.sourceText,
      fallbackItem?.visibleMaterial,
      fallbackItem?.content,
      fallbackItem?.canonicalAnswer,
      ""
    ) ?? ""
  };
}

function resolveSourceItemIdFromRef(
  selection: PracticeActivitySelection | undefined,
  sourceRef: string | undefined
): string | undefined {
  if (!selection || !sourceRef) {
    return undefined;
  }

  return selection.item.sourceRef === sourceRef ? selection.item.id : undefined;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}
