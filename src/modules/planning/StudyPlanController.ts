import type { Controller } from "../../domain/primitives/Controller.js";
import { ok, type Result } from "../../domain/primitives/result.js";
import type { CreateStudyPlanCommand, StudyPlanResponse } from "../../domain/study/StudyPlanning.js";
import {
  createStudyWorkspaceRecord,
  SqliteStudyPlanRepository,
  type StudyPlanRepository
} from "./StudyPlanRepository.js";
import { StudyPlanRepositoryKey } from "./StudyPlanRepositoryKey.js";
import { StudyPlanProjector } from "./StudyPlanProjector.js";
import { StudyPlanWorkflow } from "./StudyPlanWorkflow.js";

export class StudyPlanController
  implements Controller<CreateStudyPlanCommand, StudyPlanResponse>
{
  constructor(
    private readonly repository: StudyPlanRepository = new SqliteStudyPlanRepository(),
    private readonly workflow = new StudyPlanWorkflow(),
    private readonly projector = new StudyPlanProjector()
  ) {}

  execute(command: CreateStudyPlanCommand): Result<StudyPlanResponse> {
    const repositoryKey = StudyPlanRepositoryKey.fromCommand(command);
    const existingRecord = this.repository.findRecord(repositoryKey);
    const aggregate = this.workflow.run({
      command,
      existingRecord
    });

    if (!aggregate.ok) {
      return aggregate;
    }

    this.repository.saveRecord(
      repositoryKey,
      createStudyWorkspaceRecord({
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
      })
    );

    return ok(this.projector.project(aggregate.value));
  }
}
