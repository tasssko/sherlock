import type { MasterDataItem, MasterDataSource } from "../../domain/learning/MasterData.js";
import { err, ok, type Result } from "../../domain/primitives/result.js";
import type { LearningLoopRepository } from "../planning/LearningLoopRepository.js";

export interface SelectedMasterData {
  source: MasterDataSource;
  items: readonly MasterDataItem[];
}

export class MasterDataSourceSelector {
  constructor(private readonly repository: Pick<LearningLoopRepository, "findMasterDataByTopic">) {}

  select(topic: string, questionCount: number): Result<SelectedMasterData> {
    const sources = this.repository.findMasterDataByTopic(topic);
    const first = sources.find((candidate) => candidate.items.length >= questionCount) ?? sources[0];

    if (!first) {
      return err({
        code: "NOT_FOUND",
        message: `No master data was found for topic ${topic}.`
      });
    }

    const items = first.items.slice(0, questionCount);
    if (items.length < questionCount) {
      return err({
        code: "VALIDATION_ERROR",
        message: `Master data for ${topic} does not contain enough items for ${questionCount} questions.`
      });
    }

    return ok({
      source: first.source,
      items
    });
  }
}
