import type { Controller } from "../../domain/primitives/Controller.js";
import { ok, type Result } from "../../domain/primitives/result.js";
import type { CreateStudyPlanCommand, StudyPlanResponse } from "../../domain/study/StudyPlanning.js";
import {
  createLearningLoopRecord,
  type LearningLoopRepository
} from "./LearningLoopRepository.js";
import { LearnerWorkspaceKey } from "./LearnerWorkspaceKey.js";
import { StudyPlanProjector } from "./StudyPlanProjector.js";
import { StudyPlanGenerationService } from "./StudyPlanGenerationService.js";
import type { AgentRuntime } from "../runtime/AgentRuntime.js";
import { FixtureAgentRuntime } from "../runtime/FixtureAgentRuntime.js";
import { appendSucceededRuntimeTrace } from "../runtime/RuntimeTraceLedger.js";
import { upsertRuntimeConversationBinding } from "../runtime/RuntimeConversationBinding.js";

export class StudyPlanController
  implements Controller<CreateStudyPlanCommand, StudyPlanResponse>
{
  private readonly service: StudyPlanGenerationService;

  constructor(
    private readonly repository: LearningLoopRepository,
    service?: StudyPlanGenerationService,
    private readonly projector = new StudyPlanProjector(),
    runtime: AgentRuntime = new FixtureAgentRuntime()
  ) {
    this.service = service ?? new StudyPlanGenerationService(undefined, undefined, undefined, undefined, undefined, runtime);
  }

  async execute(command: CreateStudyPlanCommand): Promise<Result<StudyPlanResponse>> {
    const repositoryKey = LearnerWorkspaceKey.fromCommand(command);
    const existingRecord = this.repository.findRecord(repositoryKey);
    const aggregate = await this.service.run({
      command,
      existingRecord,
      materialInterpretations: existingRecord?.learningLoops
        .find((candidate) => candidate.topic === (command.focusTopics[0] ?? "study"))
        ?.toSnapshot()
        .sourceIds.flatMap((sourceId) => {
          const source = this.repository.findMasterDataSourcesByIds([sourceId])[0];
          return source?.acceptedInterpretation ? [source.acceptedInterpretation] : [];
        })
    });

    if (!aggregate.ok) {
      return aggregate;
    }

    this.repository.saveRecord(
      repositoryKey,
      appendSucceededRuntimeTrace(
        createLearningLoopRecord({
        workspace: aggregate.value.workspace,
        tasks: [...(existingRecord?.tasks ?? []), ...aggregate.value.tasks],
        workPlans: [
          ...(existingRecord?.workPlans.filter(
            (candidate) => candidate.id !== aggregate.value.workPlan.id
          ) ?? []),
          aggregate.value.workPlan
        ],
        artifacts: [...(existingRecord?.artifacts ?? []), aggregate.value.artifact],
        events: [...(existingRecord?.events ?? []), ...aggregate.value.events],
        learningLoops: [
          ...(existingRecord?.learningLoops.filter(
            (candidate) => candidate.id !== aggregate.value.learningLoop.id
          ) ?? []),
          aggregate.value.learningLoop
        ],
        assessments: [...(existingRecord?.assessments ?? [])],
        attempts: [...(existingRecord?.attempts ?? [])],
        evaluations: [...(existingRecord?.evaluations ?? [])],
        knowledgeGaps: [...(existingRecord?.knowledgeGaps ?? [])],
        masteryProfiles: aggregate.value.masteryProfile
          ? [
              ...(existingRecord?.masteryProfiles.filter(
                (candidate) => candidate.id !== aggregate.value.masteryProfile?.id
              ) ?? []),
              aggregate.value.masteryProfile
            ]
          : [...(existingRecord?.masteryProfiles ?? [])]
        ,
        practiceActivities: [...(existingRecord?.practiceActivities ?? [])],
        activeReviewSessions: [...(existingRecord?.activeReviewSessions ?? [])],
        runtimeConversationBindings: upsertRuntimeConversationBinding(
          existingRecord?.runtimeConversationBindings ?? [],
          aggregate.value.runtimeConversationBinding
        ),
        runtimeTraces: [...(existingRecord?.runtimeTraces ?? [])]
      }),
        {
          seed: aggregate.value.runtimeTrace,
          producedDomainIds: [
            ...aggregate.value.tasks.map((task) => task.id),
            aggregate.value.workPlan.id,
            aggregate.value.artifact.id
          ]
        }
      )
    );

    return ok(this.projector.project(aggregate.value));
  }
}
