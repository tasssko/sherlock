import { PracticeActivity } from "../../domain/learning/PracticeActivity.js";
import type { MasterDataItem } from "../../domain/learning/MasterData.js";
import type { PracticeActivityContext } from "../../domain/primitives/Context.js";
import type { DomainEventRecorder } from "../../domain/primitives/Event.js";
import type { Task } from "../../domain/primitives/Task.js";
import type { Workspace } from "../../domain/primitives/Workspace.js";
import type { LearningLoop } from "../../domain/learning/LearningLoop.js";
import { ok, type Result } from "../../domain/primitives/result.js";
import { createPracticeActivityAgent, validatePracticeActivity } from "./PracticeActivityAgent.js";
import { PracticeActivityQualityValidator } from "./PracticeActivityQualityValidator.js";
import type { PracticeActivitySelection } from "./PracticeSourceSelector.js";

function pickSourceSentence(item: MasterDataItem): string {
  const sentences = item.visibleMaterial
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const normalizedAnswer = item.canonicalAnswer.toLowerCase();

  return (
    sentences.find((sentence) => sentence.toLowerCase().includes(normalizedAnswer)) ??
    sentences[0] ??
    item.visibleMaterial
  );
}

export interface FlashcardSetAssembly {
  agent: ReturnType<typeof createPracticeActivityAgent>;
  practiceActivity: PracticeActivity;
}

export class FlashcardSetAssembler {
  constructor(private readonly qualityValidator = new PracticeActivityQualityValidator()) {}

  assemble(input: {
    context: PracticeActivityContext;
    events: DomainEventRecorder;
    learningLoop: LearningLoop;
    selections: readonly PracticeActivitySelection[];
    task: Task;
    workspace: Workspace;
  }): Result<FlashcardSetAssembly> {
    const cards = input.selections.map(({ gap, item }, index) => ({
      id: `flashcard_${index + 1}`,
      front: item.prompt,
      back: item.canonicalAnswer,
      topic: item.topic,
      knowledgeGapId: gap.id,
      learningObjective: gap.toSnapshot().description,
      sourceMasterDataItemId: item.id,
      sourceVisibleSentence: pickSourceSentence(item)
    }));

    const validatedCards = this.qualityValidator.validate(cards);
    if (!validatedCards.ok) {
      return validatedCards;
    }

    const flashcardSet = {
      instructions: `Review each card, attempt an answer from memory, then flip to check accuracy for ${input.context.topic}.`,
      cards: validatedCards.value
    };
    const agent = createPracticeActivityAgent();
    const policyEvaluation = validatePracticeActivity(agent, input.context, flashcardSet, input.events);
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
        learningObjectives: input.selections.map(({ gap }) => gap.toSnapshot().description),
        sourceMasterDataItemIds: input.selections.map(({ item }) => item.id),
        flashcardSet
      })
    });
  }
}
