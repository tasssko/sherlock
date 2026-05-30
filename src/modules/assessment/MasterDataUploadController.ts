import type { Controller } from "../../domain/primitives/Controller.js";
import { ok, type Result } from "../../domain/primitives/result.js";
import type {
  MasterDataUploadResponse,
  UploadMasterDataCommand
} from "../../domain/study/MasterDataUpload.js";
import {
  SqliteStudyPlanRepository,
  type StudyPlanRepository
} from "../planning/StudyPlanRepository.js";

export class MasterDataUploadController
  implements Controller<UploadMasterDataCommand, MasterDataUploadResponse>
{
  constructor(private readonly repository: StudyPlanRepository = new SqliteStudyPlanRepository()) {}

  execute(command: UploadMasterDataCommand): Result<MasterDataUploadResponse> {
    return ok(this.repository.registerMasterData(command));
  }
}
