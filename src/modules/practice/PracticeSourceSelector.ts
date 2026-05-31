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
  constructor(
    private readonly repository: Pick<LearningLoopRepository, "findMasterDataByTopic" | "findMasterDataBySourceIds">
  ) {}

  select(
    record: LearningLoopRecord,
    learningLoop: LearningLoop,
    cardCount: number
  ): Result<PracticeSourceSelection> {
    const activeLoopUnit = record.loopBatches
      .find((candidate) => candidate.learningLoopId === learningLoop.id)
      ?.firstActionableUnit();

    if (!learningLoop.isDiagnosed()) {
      if (activeLoopUnit && learningLoop.knowledgeGapIds.length > 0) {
        const knowledgeGaps = record.knowledgeGaps.filter((gap) =>
          learningLoop.knowledgeGapIds.includes(gap.id)
        );
        return this.selectFromLoopUnit(record, learningLoop, knowledgeGaps, activeLoopUnit, cardCount);
      }

      if (learningLoop.evaluationIds.length > 0 && learningLoop.knowledgeGapIds.length === 0) {
        return err({
          code: "VALIDATION_ERROR",
          message: `Learning loop ${learningLoop.id} has no diagnosed gaps to practise. This round is already secure.`
        });
      }

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

    if (activeLoopUnit) {
      return this.selectFromLoopUnit(record, learningLoop, knowledgeGaps, activeLoopUnit, cardCount);
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

  private selectFromLoopUnit(
    record: LearningLoopRecord,
    learningLoop: LearningLoop,
    knowledgeGaps: readonly KnowledgeGap[],
    activeLoopUnit: {
      focus: string;
      sourceRefs: readonly string[];
      targetKnowledgeGapIds: readonly string[];
    },
    cardCount: number
  ): Result<PracticeSourceSelection> {
    const rows = this.repository.findMasterDataBySourceIds(learningLoop.toSnapshot().sourceIds);
    const matchingGapIds = new Set(activeLoopUnit.targetKnowledgeGapIds);
    const unitGaps = knowledgeGaps.filter((gap) => matchingGapIds.has(gap.id));
    const candidates = rows.flatMap(({ source, items }) =>
      items.map((item) => ({
        source,
        item
      }))
    );
    const preferredCandidates = candidates.filter(({ item }) =>
      activeLoopUnit.sourceRefs.includes(item.sourceRef ?? item.id)
    );
    const rankedCandidates =
      preferredCandidates.length > 0
        ? preferredCandidates
        : candidates.filter(
            ({ item }) =>
              tokenize(item.subtopic ?? "").some((token) => tokenize(activeLoopUnit.focus).includes(token)) ||
              tokenize(item.topic).some((token) => tokenize(activeLoopUnit.focus).includes(token))
          );
    const fallbackCandidates = rankedCandidates.length > 0 ? rankedCandidates : candidates;

    if (fallbackCandidates.length === 0 || unitGaps.length === 0) {
      return err({
        code: "NOT_FOUND",
        message: `No source-grounded material could be selected for loop unit ${activeLoopUnit.focus}.`
      });
    }

    const selections: PracticeActivitySelection[] = [];
    for (let index = 0; index < cardCount; index += 1) {
      const chosenGap = unitGaps[index % unitGaps.length];
      const chosenCandidate = fallbackCandidates[index % fallbackCandidates.length];
      if (!chosenGap || !chosenCandidate) {
        continue;
      }

      selections.push({
        gap: chosenGap,
        item: chosenCandidate.item,
        source: chosenCandidate.source
      });
    }

    return ok({
      knowledgeGaps: unitGaps,
      selections,
      sourceNames: [...new Set(selections.map((selection) => selection.source.name))]
    });
  }
}
