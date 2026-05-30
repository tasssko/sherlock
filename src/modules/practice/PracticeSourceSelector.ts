import type { KnowledgeGap, LearningLoop } from "../../domain/learning/LearningLoop.js";
import type { MasterDataItem, MasterDataSource } from "../../domain/learning/MasterData.js";
import type { LearningLoopRecord, LearningLoopRepository } from "../planning/LearningLoopRepository.js";
import { err, ok, type Result } from "../../domain/primitives/result.js";

export interface PracticeActivitySelection {
  gap: KnowledgeGap;
  item: MasterDataItem;
  source: MasterDataSource;
}

export interface PracticeSourceSelection {
  knowledgeGaps: readonly KnowledgeGap[];
  selections: readonly PracticeActivitySelection[];
  sourceNames: readonly string[];
}

function tokenize(value: string): readonly string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

export class PracticeSourceSelector {
  constructor(private readonly repository: Pick<LearningLoopRepository, "findMasterDataByTopic">) {}

  select(
    record: LearningLoopRecord,
    learningLoop: LearningLoop,
    cardCount: number
  ): Result<PracticeSourceSelection> {
    if (!learningLoop.isDiagnosed()) {
      return err({
        code: "VALIDATION_ERROR",
        message: `Learning loop ${learningLoop.id} must be diagnosed before practice can be generated.`
      });
    }

    const knowledgeGaps = record.knowledgeGaps.filter((gap) =>
      learningLoop.knowledgeGapIds.includes(gap.id)
    );
    if (knowledgeGaps.length === 0) {
      return err({
        code: "VALIDATION_ERROR",
        message: `Learning loop ${learningLoop.id} has no diagnosed knowledge gaps to target.`
      });
    }

    const selections: PracticeActivitySelection[] = [];
    const sourceNames = new Set<string>();
    const usedItemIds = new Set<string>();

    for (let index = 0; index < cardCount; index += 1) {
      const gap = knowledgeGaps[index % knowledgeGaps.length];
      if (!gap) {
        return err({
          code: "NOT_FOUND",
          message: `No knowledge gap could be selected for learning loop ${learningLoop.id}.`
        });
      }
      const rows = this.repository.findMasterDataByTopic(gap.topic);
      const candidates = rows.flatMap(({ source, items }) =>
        items.map((item) => ({
          source,
          item
        }))
      );
      const gapTokens = new Set(tokenize(gap.toSnapshot().description).concat(tokenize(gap.toSnapshot().evidence)));
      const chosen =
        candidates.find(({ item }) => {
          if (usedItemIds.has(item.id)) {
            return false;
          }

          const itemTokens = new Set(
            tokenize(item.prompt)
              .concat(tokenize(item.canonicalAnswer))
              .concat(tokenize(item.visibleMaterial))
              .concat(item.keywords)
          );
          for (const token of gapTokens) {
            if (itemTokens.has(token)) {
              return true;
            }
          }

          return item.topic === gap.topic;
        }) ?? candidates.find(({ item }) => !usedItemIds.has(item.id));

      if (!chosen) {
        return err({
          code: "NOT_FOUND",
          message: `No master data could be selected for knowledge gap ${gap.id}.`
        });
      }

      usedItemIds.add(chosen.item.id);
      sourceNames.add(chosen.source.name);
      selections.push({
        gap,
        item: chosen.item,
        source: chosen.source
      });
    }

    return ok({
      knowledgeGaps,
      selections,
      sourceNames: [...sourceNames]
    });
  }
}
