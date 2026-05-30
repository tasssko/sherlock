import type { Controller } from "../../domain/primitives/Controller.js";
import { ok, type Result } from "../../domain/primitives/result.js";
import type {
  MasterDataUploadResponse,
  UploadMasterDataCommand
} from "../../domain/study/MasterDataUpload.js";
import {
  type LearningLoopRepository
} from "../planning/LearningLoopRepository.js";

export class MasterDataUploadController
  implements Controller<UploadMasterDataCommand, MasterDataUploadResponse>
{
  constructor(private readonly repository: LearningLoopRepository) {}

  execute(command: UploadMasterDataCommand): Result<MasterDataUploadResponse> {
    return ok(this.repository.registerMasterData(command));
  }
}
