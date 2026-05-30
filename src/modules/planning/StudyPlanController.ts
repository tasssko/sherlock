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

export class StudyPlanController
  implements Controller<CreateStudyPlanCommand, StudyPlanResponse>
{
  constructor(
    private readonly repository: LearningLoopRepository,
    private readonly service = new StudyPlanGenerationService(),
    private readonly projector = new StudyPlanProjector()
  ) {}

  execute(command: CreateStudyPlanCommand): Result<StudyPlanResponse> {
    const repositoryKey = LearnerWorkspaceKey.fromCommand(command);
    const existingRecord = this.repository.findRecord(repositoryKey);
    const aggregate = this.service.run({
      command,
      existingRecord
    });

    if (!aggregate.ok) {
      return aggregate;
    }

    this.repository.saveRecord(
      repositoryKey,
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
        activeReviewSessions: [...(existingRecord?.activeReviewSessions ?? [])]
      })
    );

    return ok(this.projector.project(aggregate.value));
  }
}
