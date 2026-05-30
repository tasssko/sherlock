import type { Controller } from "../../domain/primitives/Controller.js";
import { err, ok, type Result } from "../../domain/primitives/result.js";
import type {
  MasterDataUploadResponse,
  UploadMasterDataCommand
} from "../../domain/study/MasterDataUpload.js";
import {
  attachInterpretationSummaryToUploadItems,
  createUploadItemsFromInterpretation,
  validateMasterDataInterpretationCandidate
} from "../masterData/MasterDataInterpretation.js";
import {
  type LearningLoopRepository
} from "../planning/LearningLoopRepository.js";
import type { AgentRuntime } from "../runtime/AgentRuntime.js";
import { FixtureAgentRuntime } from "../runtime/FixtureAgentRuntime.js";

export class MasterDataUploadController
  implements Controller<UploadMasterDataCommand, MasterDataUploadResponse>
{
  constructor(
    private readonly repository: LearningLoopRepository,
    private readonly runtime: AgentRuntime = new FixtureAgentRuntime()
  ) {}

  execute(
    command: UploadMasterDataCommand
  ): Promise<Result<MasterDataUploadResponse>> | Result<MasterDataUploadResponse> {
    const rawSourceContent =
      command.rawSourceContent ?? command.items.map((item) => item.visibleMaterial).join("\n");
    if (!rawSourceContent.trim()) {
      return err({
        code: "VALIDATION_ERROR",
        message: "Master data upload requires source content."
      });
    }

    const interpreted = this.runtime.interpretMasterData({
      sourceId: `upload:${command.sourceName}`,
      sourceName: command.sourceName,
      rawSourceContent,
      contentType: command.contentType ?? "text/plain",
      fallbackItems: command.items.map((item) => ({
        topic: item.topic,
        prompt: item.prompt,
        canonicalAnswer: item.canonicalAnswer,
        visibleMaterial: item.visibleMaterial
      })),
      learnerYearGroup: command.learnerYearGroup,
      userHints: command.userHints,
      expectedOutputSchema: "MasterDataInterpretationCandidate.v1"
    });
    if (interpreted instanceof Promise) {
      return interpreted.then((value) =>
        this.persistAcceptedInterpretation(command, rawSourceContent, value)
      );
    }

    return this.persistAcceptedInterpretation(command, rawSourceContent, interpreted);
  }

  private persistAcceptedInterpretation(
    command: UploadMasterDataCommand,
    rawSourceContent: string,
    interpreted: Result<{ interpretation: unknown }>
  ): Result<MasterDataUploadResponse> {
    if (!interpreted.ok) {
      return interpreted;
    }

    let acceptedInterpretation;
    try {
      acceptedInterpretation = validateMasterDataInterpretationCandidate(
        interpreted.value.interpretation
      );
    } catch (error) {
      return err({
        code: "VALIDATION_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Master data interpretation candidate failed validation."
      });
    }

    return ok(
      this.repository.registerMasterData({
        ...command,
        rawSourceContent,
        contentType: command.contentType ?? "text/plain",
        acceptedInterpretation,
        items:
          command.rawSourceContent === undefined
            ? attachInterpretationSummaryToUploadItems(command.items, acceptedInterpretation)
            : createUploadItemsFromInterpretation(acceptedInterpretation)
      })
    );
  }
}
