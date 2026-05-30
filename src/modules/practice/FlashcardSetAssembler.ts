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
import type { AgentRuntime } from "../runtime/AgentRuntime.js";
import { FixtureAgentRuntime } from "../runtime/FixtureAgentRuntime.js";
import type { RuntimeTraceSeed } from "../runtime/RuntimeTrace.js";

export interface FlashcardSetAssembly {
  agent: ReturnType<typeof createPracticeActivityAgent>;
  practiceActivity: PracticeActivity;
  runtimeTrace?: RuntimeTraceSeed;
}

export class FlashcardSetAssembler {
  constructor(
    private readonly runtime: AgentRuntime = new FixtureAgentRuntime(),
    private readonly qualityValidator = new PracticeActivityQualityValidator()
  ) {}

  async assemble(input: {
    context: PracticeActivityContext;
    events: DomainEventRecorder;
    learningLoop: LearningLoop;
    selections: readonly PracticeActivitySelection[];
    task: Task;
    workspace: Workspace;
  }): Promise<Result<FlashcardSetAssembly>> {
    const generated = await this.runtime.generatePracticeActivity({
      context: input.context,
      selections: input.selections.map(({ gap, item }) => ({
        gap: {
          id: gap.id,
          description: gap.toSnapshot().description
        },
        item
      }))
    });
    if (!generated.ok) {
      return generated;
    }

    const validatedCards = this.qualityValidator.validate(generated.value.flashcardSet.cards);
    if (!validatedCards.ok) {
      return validatedCards;
    }

    const flashcardSet = {
      instructions: generated.value.flashcardSet.instructions,
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
      }),
      runtimeTrace: generated.value.runtimeTrace
    });
  }
}
