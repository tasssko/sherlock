import { firstActionableLoopUnit } from "../../domain/learning/LoopUnit.js";
import type { KnowledgeGap, LearningLoop } from "../../domain/learning/LearningLoop.js";
import type { MasterDataItem, MasterDataSource } from "../../domain/learning/MasterData.js";
import type { QuestionSeed, QuestionVariant } from "../../domain/learning/QuestionBank.js";
import type { LearningLoopRecord, LearningLoopRepository } from "../planning/LearningLoopRepository.js";
import { err, ok, type Result } from "../../domain/primitives/result.js";

export interface PracticeActivitySelection {
  gap: KnowledgeGap;
  item: MasterDataItem;
  questionSeed?: QuestionSeed;
  reviewVariant?: QuestionVariant;
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
    const activeLoopUnit =
      firstActionableLoopUnit(
        (record.loopUnits ?? []).filter((candidate) => candidate.learningLoopId === learningLoop.id)
      )?.toSnapshot() ??
      record.loopBatches
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
      id?: string;
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

    const variantSelections = buildVariantSelections({
      activeLoopUnit,
      fallbackCandidates,
      learningLoop,
      loopUnitAssignments: record.loopUnitQuestionAssignments ?? [],
      questionSeeds: record.questionSeeds ?? [],
      questionVariants: record.questionVariants ?? [],
      unitGaps
    });
    if (variantSelections.length > 0) {
      const repeatedSelections = Array.from({ length: cardCount }, (_, index) =>
        variantSelections[index % variantSelections.length]
      ).filter((selection): selection is PracticeActivitySelection => Boolean(selection));
      return ok({
        knowledgeGaps: unitGaps,
        selections: repeatedSelections,
        sourceNames: [...new Set(repeatedSelections.map((selection) => selection.source.name))]
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

function buildVariantSelections(input: {
  activeLoopUnit: {
    id?: string;
    focus: string;
    sourceRefs: readonly string[];
    targetKnowledgeGapIds: readonly string[];
  };
  fallbackCandidates: readonly {
    item: MasterDataItem;
    source: MasterDataSource;
  }[];
  learningLoop: LearningLoop;
  loopUnitAssignments: NonNullable<LearningLoopRecord["loopUnitQuestionAssignments"]>;
  questionSeeds: readonly QuestionSeed[];
  questionVariants: readonly QuestionVariant[];
  unitGaps: readonly KnowledgeGap[];
}): readonly PracticeActivitySelection[] {
  const unitId = input.activeLoopUnit.id;
  if (!unitId) {
    return [];
  }

  const reviewVariants = input.questionVariants
    .filter((candidate) => candidate.learningLoopId === input.learningLoop.id)
    .filter((candidate) => {
      const assignment = input.loopUnitAssignments.find(
        (entry) =>
          entry.learningLoopId === input.learningLoop.id &&
          entry.loopUnitId === (unitId as never) &&
          entry.variantId === candidate.id &&
          entry.purpose === "review"
      );
      return Boolean(assignment);
    })
    .sort((left, right) => {
      const leftAssignment = input.loopUnitAssignments.find(
        (entry) =>
          entry.learningLoopId === input.learningLoop.id &&
          entry.loopUnitId === (unitId as never) &&
          entry.variantId === left.id &&
          entry.purpose === "review"
      );
      const rightAssignment = input.loopUnitAssignments.find(
        (entry) =>
          entry.learningLoopId === input.learningLoop.id &&
          entry.loopUnitId === (unitId as never) &&
          entry.variantId === right.id &&
          entry.purpose === "review"
      );
      if (leftAssignment && rightAssignment) {
        return leftAssignment.sequence - rightAssignment.sequence;
      }

      return left.position - right.position;
    });

  if (reviewVariants.length === 0) {
    return buildLegacyVariantSelections(input);
  }

  const seedById = new Map(input.questionSeeds.map((seed) => [seed.id, seed]));
  const selections: PracticeActivitySelection[] = [];

  for (let index = 0; index < reviewVariants.length; index += 1) {
    const reviewVariant = reviewVariants[index];
    if (!reviewVariant) {
      continue;
    }
    const variantSnapshot = reviewVariant.toSnapshot();
    const questionSeed = seedById.get(variantSnapshot.seedId);
    if (!questionSeed) {
      continue;
    }

    const matchedCandidate =
      input.fallbackCandidates.find(({ item }) =>
        questionSeed.toSnapshot().sourceRefs.includes(item.sourceRef ?? item.id)
      ) ?? input.fallbackCandidates[index % input.fallbackCandidates.length];
    const gap =
      input.unitGaps.find((candidate) =>
        questionSeed
          .toSnapshot()
          .objectiveRefs.some((objectiveRef) =>
            sharesAnyToken(candidate.toSnapshot().description, objectiveRef)
          )
      ) ?? input.unitGaps[index % input.unitGaps.length];

    if (!matchedCandidate || !gap) {
      continue;
    }

    selections.push({
      gap,
      item: matchedCandidate.item,
      questionSeed,
      reviewVariant,
      source: matchedCandidate.source
    });
  }

  return selections;
}

function buildLegacyVariantSelections(input: {
  activeLoopUnit: {
    id?: string;
    focus: string;
    sourceRefs: readonly string[];
    targetKnowledgeGapIds: readonly string[];
  };
  fallbackCandidates: readonly {
    item: MasterDataItem;
    source: MasterDataSource;
  }[];
  learningLoop: LearningLoop;
  questionSeeds: readonly QuestionSeed[];
  questionVariants: readonly QuestionVariant[];
  unitGaps: readonly KnowledgeGap[];
}): readonly PracticeActivitySelection[] {
  const unitId = input.activeLoopUnit.id;
  if (!unitId) {
    return [];
  }

  const reviewVariants = input.questionVariants
    .filter(
      (candidate) =>
        candidate.learningLoopId === input.learningLoop.id &&
        candidate.ownerKind === "loop_review_item" &&
        candidate.ownerId === unitId
    )
    .sort((left, right) => left.position - right.position);

  if (reviewVariants.length === 0) {
    return [];
  }

  const seedById = new Map(input.questionSeeds.map((seed) => [seed.id, seed]));
  const selections: PracticeActivitySelection[] = [];

  for (let index = 0; index < reviewVariants.length; index += 1) {
    const reviewVariant = reviewVariants[index];
    if (!reviewVariant) {
      continue;
    }
    const variantSnapshot = reviewVariant.toSnapshot();
    const questionSeed = seedById.get(variantSnapshot.seedId);
    if (!questionSeed) {
      continue;
    }

    const matchedCandidate =
      input.fallbackCandidates.find(({ item }) =>
        questionSeed.toSnapshot().sourceRefs.includes(item.sourceRef ?? item.id)
      ) ?? input.fallbackCandidates[index % input.fallbackCandidates.length];
    const gap =
      input.unitGaps.find((candidate) =>
        questionSeed
          .toSnapshot()
          .objectiveRefs.some((objectiveRef) =>
            sharesAnyToken(candidate.toSnapshot().description, objectiveRef)
          )
      ) ?? input.unitGaps[index % input.unitGaps.length];

    if (!matchedCandidate || !gap) {
      continue;
    }

    selections.push({
      gap,
      item: matchedCandidate.item,
      questionSeed,
      reviewVariant,
      source: matchedCandidate.source
    });
  }

  return selections;
}

function sharesAnyToken(left: string, right: string): boolean {
  const leftTokens = new Set(tokenize(left));
  for (const token of tokenize(right)) {
    if (leftTokens.has(token)) {
      return true;
    }
  }

  return false;
}
