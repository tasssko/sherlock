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
    const sources = rankSources(this.repository.findMasterDataByTopic(topic));
    const first =
      sources.find(
        (candidate) =>
          candidate.source.acceptedInterpretation && candidate.items.length > 0
      ) ??
      sources.find((candidate) => candidate.items.length > 0) ??
      sources.find((candidate) => candidate.source.acceptedInterpretation) ??
      sources[0];

    if (!first) {
      return err({
        code: "NOT_FOUND",
        message: `No master data was found for topic ${topic}.`
      });
    }

    const items = pickAssessmentItems(first.items, questionCount);
    if (items.length === 0) {
      return err({
        code: "VALIDATION_ERROR",
        message: `Master data for ${topic} does not contain enough source-grounded material for an assessment.`
      });
    }

    return ok({
      source: first.source,
      items
    });
  }
}

function rankSources(
  sources: readonly {
    source: MasterDataSource;
    items: readonly MasterDataItem[];
  }[]
): {
  source: MasterDataSource;
  items: readonly MasterDataItem[];
}[] {
  return [...sources].sort((left, right) => {
    const leftAccepted = Number(Boolean(left.source.acceptedInterpretation));
    const rightAccepted = Number(Boolean(right.source.acceptedInterpretation));
    if (leftAccepted !== rightAccepted) {
      return rightAccepted - leftAccepted;
    }

    const leftTime = Date.parse(left.source.toSnapshot().uploadedAt);
    const rightTime = Date.parse(right.source.toSnapshot().uploadedAt);
    return rightTime - leftTime;
  });
}

function pickAssessmentItems(
  items: readonly MasterDataItem[],
  questionCount: number
): readonly MasterDataItem[] {
  const targetPoolSize = Math.max(
    Math.min(items.length, questionCount + 2),
    Math.min(items.length, questionCount)
  );
  const groups = new Map<string, MasterDataItem[]>();
  const seenGroupOrder: string[] = [];

  for (const item of items) {
    const groupKey = normalize(
      item.subtopic?.trim() || item.topic.trim() || `group-${seenGroupOrder.length + 1}`
    );

    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
      seenGroupOrder.push(groupKey);
    }

    groups.get(groupKey)?.push(item);
  }

  for (const groupKey of seenGroupOrder) {
    groups.get(groupKey)?.sort(compareAssessmentItems);
  }

  const selected: MasterDataItem[] = [];
  const seenPromptSignatures = new Set<string>();
  let addedInRound = true;

  while (selected.length < targetPoolSize && addedInRound) {
    addedInRound = false;

    for (const groupKey of seenGroupOrder) {
      const group = groups.get(groupKey);
      if (!group || group.length === 0 || selected.length >= targetPoolSize) {
        continue;
      }

      const nextIndex = group.findIndex((item) => !seenPromptSignatures.has(promptSignature(item)));
      const item = nextIndex >= 0 ? group.splice(nextIndex, 1)[0] : group.shift();
      if (!item) {
        continue;
      }

      selected.push(item);
      seenPromptSignatures.add(promptSignature(item));
      addedInRound = true;
    }
  }

  if (selected.length >= targetPoolSize) {
    return selected.slice(0, targetPoolSize);
  }

  const remaining = [...items]
    .filter((item) => !selected.some((selectedItem) => selectedItem.id === item.id))
    .sort(compareAssessmentItems);

  for (const item of remaining) {
    if (selected.length >= targetPoolSize) {
      break;
    }

    selected.push(item);
  }

  return selected.slice(0, targetPoolSize);
}

function compareAssessmentItems(left: MasterDataItem, right: MasterDataItem): number {
  return scoreAssessmentItem(right) - scoreAssessmentItem(left);
}

function scoreAssessmentItem(item: MasterDataItem): number {
  let score = 0;

  if (item.itemType && item.itemType !== "fact") {
    score += 5;
  }
  if (item.term || item.person || item.date) {
    score += 3;
  }
  if (item.subtopic && normalize(item.subtopic) !== normalize(item.topic)) {
    score += 2;
  }
  if (!isGenericPrompt(item.prompt)) {
    score += 2;
  }
  score += Math.min(normalize(item.canonicalAnswer).length, 80) / 80;

  return score;
}

function promptSignature(item: MasterDataItem): string {
  return normalize(item.prompt)
    .replace(/\[source:\s*[^\]]+\]/g, "")
    .trim();
}

function isGenericPrompt(prompt: string): boolean {
  const normalizedPrompt = normalize(prompt);
  return (
    normalizedPrompt.startsWith("what should you remember about ") ||
    normalizedPrompt.startsWith("what is one key fact from ")
  );
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
