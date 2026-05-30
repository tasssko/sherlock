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
  createAssessmentArtifactContent,
  createInitialAssessmentAgent,
  validateAssessmentArtifact
} from "./InitialAssessmentAgent.js";
import { AssessmentQualityValidator } from "./AssessmentQualityValidator.js";

const difficultyScale: readonly ("easy" | "medium" | "stretch")[] = [
  "easy",
  "easy",
  "medium",
  "medium",
  "stretch"
];

export interface InitialAssessmentAssembly {
  agent: ReturnType<typeof createInitialAssessmentAgent>;
  assessment: Assessment;
  artifact: Artifact<AssessmentArtifactContent, "assessment">;
}

export class InitialAssessmentAssembler {
  constructor(private readonly qualityValidator = new AssessmentQualityValidator()) {}

  assemble(input: {
    context: InitialAssessmentContext;
    events: DomainEventRecorder;
    learningLoop: LearningLoop;
    source: MasterDataSource;
    sourceItems: readonly MasterDataItem[];
    task: Task;
    workspace: Workspace;
  }): Result<InitialAssessmentAssembly> {
    const assessmentItems = input.sourceItems.map((item, index) => ({
      id: `assessment_item_${index + 1}`,
      topic: item.topic,
      prompt: item.prompt,
      canonicalAnswer: item.canonicalAnswer,
      visibleMaterial: item.visibleMaterial,
      difficulty: difficultyScale[index] ?? "stretch",
      sourceMasterDataItemId: item.id
    }));

    const validatedItems = this.qualityValidator.validate(assessmentItems);
    if (!validatedItems.ok) {
      return validatedItems;
    }

    const artifactContent = createAssessmentArtifactContent({
      topic: input.context.topic,
      questionCount: input.context.questionCount,
      items: validatedItems.value.map((item) => ({
        id: item.id,
        prompt: item.prompt,
        difficulty: item.difficulty
      }))
    });
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
            `Built ${input.context.questionCount} diagnostic items for ${input.context.topic}.`
          ]
        })
      },
      input.events
    );

    return ok({
      agent,
      assessment: assessment.attachArtifact(artifact.id, input.events),
      artifact
    });
  }
}
