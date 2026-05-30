import type { Controller } from "../../domain/primitives/Controller.js";
import { ok, type Result } from "../../domain/primitives/result.js";
import type {
  CreateInitialAssessmentCommand,
  InitialAssessmentResponse
} from "../../domain/study/AssessmentGeneration.js";
import {
  SqliteStudyPlanRepository,
  type StudyPlanRepository
} from "../planning/StudyPlanRepository.js";
import { StudyPlanRepositoryKey } from "../planning/StudyPlanRepositoryKey.js";
import { AssessmentProjector } from "./AssessmentProjector.js";
import { InitialAssessmentService } from "./InitialAssessmentService.js";
import { MasterDataSourceSelector } from "./MasterDataSourceSelector.js";

export class InitialAssessmentController
  implements Controller<CreateInitialAssessmentCommand, InitialAssessmentResponse>
{
  private readonly service: InitialAssessmentService;

  constructor(
    private readonly repository: StudyPlanRepository = new SqliteStudyPlanRepository(),
    service?: InitialAssessmentService,
    private readonly projector = new AssessmentProjector()
  ) {
    this.service = service ?? new InitialAssessmentService(new MasterDataSourceSelector(repository));
  }

  execute(command: CreateInitialAssessmentCommand): Result<InitialAssessmentResponse> {
    const key = StudyPlanRepositoryKey.fromLearner(command.learnerName, command.yearGroup);
    const record = this.repository.findRecord(key);
    const result = this.service.run(command, record);
    if (!result.ok) {
      return result;
    }

    this.repository.saveRecord(key, result.value.record);

    return ok(this.projector.project(result.value.aggregate));
  }
}
