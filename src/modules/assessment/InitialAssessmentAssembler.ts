import { Assessment } from "../../domain/learning/Assessment.js";
import type { MasterDataItem, MasterDataSource } from "../../domain/learning/MasterData.js";
import { Artifact, ArtifactProvenance } from "../../domain/primitives/Artifact.js";
import type { InitialAssessmentContext } from "../../domain/primitives/Context.js";
import type { DomainEventRecorder } from "../../domain/primitives/Event.js";
import type { Task } from "../../domain/primitives/Task.js";
import type { Workspace } from "../../domain/primitives/Workspace.js";
import type { LearningLoop } from "../../domain/learning/LearningLoop.js";
import { ok, type Result } from "../../domain/primitives/result.js";
import type { AssessmentArtifactContent } from "../../domain/study/AssessmentGeneration.js";
import {
  createInitialAssessmentAgent,
  validateAssessmentArtifact
} from "./InitialAssessmentAgent.js";
import { AssessmentQualityValidator } from "./AssessmentQualityValidator.js";
import type { AgentRuntime } from "../runtime/AgentRuntime.js";
import { FixtureAgentRuntime } from "../runtime/FixtureAgentRuntime.js";
import type { RuntimeTraceSeed } from "../runtime/RuntimeTrace.js";
import type { RuntimeConversationBinding } from "../runtime/RuntimeConversationBinding.js";

export interface InitialAssessmentAssembly {
  agent: ReturnType<typeof createInitialAssessmentAgent>;
  assessment: Assessment;
  artifact: Artifact<AssessmentArtifactContent, "assessment">;
  runtimeConversationBinding?: RuntimeConversationBinding;
  runtimeTrace?: RuntimeTraceSeed;
}

export class InitialAssessmentAssembler {
  constructor(
    private readonly runtime: AgentRuntime = new FixtureAgentRuntime(),
    private readonly qualityValidator = new AssessmentQualityValidator()
  ) {}

  async assemble(input: {
    context: InitialAssessmentContext;
    events: DomainEventRecorder;
    learningLoop: LearningLoop;
    runtimeConversationBinding?: RuntimeConversationBinding;
    source: MasterDataSource;
    sourceItems: readonly MasterDataItem[];
    task: Task;
    workspace: Workspace;
  }): Promise<Result<InitialAssessmentAssembly>> {
    const generated = await this.runtime.generateInitialAssessment({
      context: input.context,
      learningLoopId: input.learningLoop.id,
      source: input.source,
      sourceItems: input.sourceItems,
      runtimeConversationBinding: input.runtimeConversationBinding
    });
    if (!generated.ok) {
      return generated;
    }

    const validatedItems = this.qualityValidator.validate(generated.value.items);
    if (!validatedItems.ok) {
      return validatedItems;
    }

    const artifactContent = generated.value.artifactContent;
    const agent = createInitialAssessmentAgent();
    const policyEvaluation = validateAssessmentArtifact(
      agent,
      input.context,
      artifactContent,
      input.events
    );
    if (!policyEvaluation.ok) {
      return policyEvaluation;
    }

    const assessment = Assessment.create(
      {
        workspaceId: input.workspace.id,
        learningLoopId: input.learningLoop.id,
        topic: input.context.topic,
        items: validatedItems.value
      },
      input.events
    );
    const artifact = Artifact.create(
      {
        workspaceId: input.workspace.id,
        taskId: input.task.id,
        type: "assessment",
        content: artifactContent,
        provenance: ArtifactProvenance.create({
          controller: "InitialAssessmentController",
          taskId: input.task.id,
          agentId: agent.id,
          sourceTopics: [input.context.topic],
          facts: input.context.facts().map((fact) => `${fact.label}: ${fact.value}`),
          assumptions: [
            "Initial assessment items are selected from approved master data.",
            "Diagnostic items should surface method knowledge rather than recall only."
          ],
          decisions: [
            `Selected source ${input.source.name}.`,
            `Built ${artifactContent.questionCount} diagnostic items for ${input.context.topic}.`
          ]
        })
      },
      input.events
    );

    return ok({
      agent,
      assessment: assessment.attachArtifact(artifact.id, input.events),
      artifact,
      runtimeConversationBinding: generated.value.runtimeConversationBinding,
      runtimeTrace: generated.value.runtimeTrace
    });
  }
}
