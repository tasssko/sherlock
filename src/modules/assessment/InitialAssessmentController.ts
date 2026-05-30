import type { Controller } from "../../domain/primitives/Controller.js";
import { ok, type Result } from "../../domain/primitives/result.js";
import type {
  CreateInitialAssessmentCommand,
  InitialAssessmentResponse
} from "../../domain/study/AssessmentGeneration.js";
import {
  type LearningLoopRepository
} from "../planning/LearningLoopRepository.js";
import { LearnerWorkspaceKey } from "../planning/LearnerWorkspaceKey.js";
import { AssessmentProjector } from "./AssessmentProjector.js";
import { InitialAssessmentAssembler } from "./InitialAssessmentAssembler.js";
import { InitialAssessmentService } from "./InitialAssessmentService.js";
import { MasterDataSourceSelector } from "./MasterDataSourceSelector.js";
import type { AgentRuntime } from "../runtime/AgentRuntime.js";
import { FixtureAgentRuntime } from "../runtime/FixtureAgentRuntime.js";

export class InitialAssessmentController
  implements Controller<CreateInitialAssessmentCommand, InitialAssessmentResponse>
{
  private readonly service: InitialAssessmentService;

  constructor(
    private readonly repository: LearningLoopRepository,
    service?: InitialAssessmentService,
    private readonly projector = new AssessmentProjector(),
    runtime: AgentRuntime = new FixtureAgentRuntime()
  ) {
    this.service =
      service ??
      new InitialAssessmentService(
        new MasterDataSourceSelector(repository),
        undefined,
        undefined,
        new InitialAssessmentAssembler(runtime)
      );
  }

  async execute(command: CreateInitialAssessmentCommand): Promise<Result<InitialAssessmentResponse>> {
    const key = LearnerWorkspaceKey.fromLearner(command.learnerName, command.yearGroup);
    const record = this.repository.findRecord(key);
    const result = await this.service.run(command, record);
    if (!result.ok) {
      return result;
    }

    this.repository.saveRecord(key, result.value.record);

    return ok(this.projector.project(result.value.aggregate));
  }
}
