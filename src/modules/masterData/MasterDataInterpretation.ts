import { z } from "zod";
import type { PublicMasterDataItemSnapshot } from "../../domain/learning/MasterData.js";
import type {
  ParsedMasterDataInput,
  ParsedMasterDataSummary,
  StructuredMasterDataFields,
  StructuredMasterDataItemType
} from "./structuredRevision.js";
import { parseMasterDataInput } from "./structuredRevision.js";

const summaryMetadataPrefix = "__md_summary_";

const sourceRefSchema = z.string().min(1);

const learningObjectiveSchema = z.object({
  id: z.string().min(1),
  objective: z.string().min(1),
  sourceRefs: z.array(sourceRefSchema).min(1)
});

const sourceMapEntrySchema = z.object({
  sourceRef: sourceRefSchema,
  excerpt: z.string().min(1)
});

const structuredItemSchema = z.object({
  subject: z.string().min(1),
  yearGroup: z.string().min(1),
  topic: z.string().min(1),
  subtopic: z.string().min(1),
  itemType: z.enum([
    "fact",
    "person",
    "key_term",
    "date",
    "cause",
    "event",
    "consequence",
    "legacy"
  ]),
  content: z.string().min(1),
  sourceRef: sourceRefSchema,
  date: z.string().min(1).optional(),
  definition: z.string().min(1).optional(),
  person: z.string().min(1).optional(),
  term: z.string().min(1).optional()
});

const candidateSchema = z.object({
  schema: z.literal("MasterDataInterpretationCandidate.v1"),
  documentTitle: z.string().min(1).optional(),
  detectedSubject: z.string().min(1),
  detectedYearGroup: z.string().min(1),
  mainTopic: z.string().min(1),
  subtopics: z.array(z.string().min(1)),
  keyPeople: z.array(z.string().min(1)),
  keyTerms: z.array(z.string().min(1)),
  importantDates: z.array(z.string().min(1)),
  processes: z.array(z.string().min(1)),
  learnerFacingMaterialSummary: z.string().min(1),
  learningObjectives: z.array(learningObjectiveSchema).min(1),
  sourceMap: z.array(sourceMapEntrySchema).min(1),
  items: z.array(structuredItemSchema).min(1)
});

export type MasterDataInterpretationObjective = z.infer<typeof learningObjectiveSchema>;
export type MasterDataSourceMapEntry = z.infer<typeof sourceMapEntrySchema>;
export type MasterDataInterpretationCandidate = z.infer<typeof candidateSchema>;

export interface MasterDataInterpretationSummary extends ParsedMasterDataSummary {
  learnerFacingMaterialSummary?: string;
  learningObjectives: readonly string[];
  processes: readonly string[];
}

export interface CreateStructuredUploadItemInput extends StructuredMasterDataFields {
  prompt: string;
}

export interface MasterDataInterpretationCompatibilityContext {
  learnerYearGroup?: string;
  rawSourceContent: string;
  sourceName: string;
  userHints?: {
    subject?: string;
    topic?: string;
  };
}

export function normalizeCompatibleMasterDataInterpretationCandidate(
  value: unknown,
  context: MasterDataInterpretationCompatibilityContext
): unknown {
  if (candidateSchema.safeParse(value).success || !isRecord(value)) {
    return value;
  }

  if (!looksLikeRelayCompatibilityCandidate(value)) {
    return value;
  }

  const parsed = parseMasterDataInput({
    sourceName: context.sourceName,
    lines: context.rawSourceContent,
    fallbackTopic:
      firstNonEmptyString(
        asNonEmptyString(value.topic),
        context.userHints?.topic,
        context.sourceName
      ) ?? context.sourceName,
    fallbackSubject: context.userHints?.subject,
    fallbackYearGroup: context.learnerYearGroup
  });
  const relayTags = asStringArray(value.tags);
  const documentTitle = firstNonEmptyString(
    asNonEmptyString(value.documentTitle),
    asNonEmptyString(value.sourceName),
    parsed.summary.documentTitle,
    context.sourceName
  );
  const detectedSubject = firstNonEmptyString(
    asNonEmptyString(value.detectedSubject),
    context.userHints?.subject,
    inferSubjectFromText(asNonEmptyString(value.sourceName)),
    inferSubjectFromText(relayTags.join(" ")),
    parsed.summary.subject
  );
  const detectedYearGroup = firstNonEmptyString(
    asNonEmptyString(value.detectedYearGroup),
    asNonEmptyString(value.learnerYearGroup),
    context.learnerYearGroup,
    parsed.summary.yearGroup
  );
  const mainTopic = firstNonEmptyString(
    asNonEmptyString(value.mainTopic),
    asNonEmptyString(value.topic),
    context.userHints?.topic,
    parsed.summary.mainTopic
  );

  const sourceMap = dedupeSourceMap([
    ...normalizeSourceMapEntries(value.sourceMap),
    ...buildSourceMapFromParsedInput(parsed),
    ...buildFallbackSourceMap(context.rawSourceContent, mainTopic ?? context.sourceName)
  ]);
  const normalizedSourceMap =
    sourceMap.length > 0
      ? sourceMap
      : [
          {
            sourceRef: nextGeneratedRef(mainTopic ?? context.sourceName, "source"),
            excerpt: context.rawSourceContent.slice(0, 280).trim() || context.sourceName
          }
        ];

  const baseItems = normalizeStructuredItems(
    value.items,
    detectedSubject,
    detectedYearGroup,
    mainTopic
  );
  const parsedItems = parsed.structuredItems.map((item) => ({
    ...item,
    subject: detectedSubject ?? item.subject,
    yearGroup: detectedYearGroup ?? item.yearGroup,
    topic: mainTopic ?? item.topic
  }));
  const compatibleItems = buildCompatibleRelayItems({
    candidate: value,
    detectedSubject: detectedSubject ?? "Unknown",
    detectedYearGroup: detectedYearGroup ?? "Unknown",
    mainTopic: mainTopic ?? context.sourceName,
    parsed,
    sourceMap: normalizedSourceMap
  });
  const items = dedupeStructuredItems(
    [...baseItems, ...parsedItems, ...compatibleItems],
    detectedSubject,
    detectedYearGroup,
    mainTopic
  );
  const completeSourceMap = ensureSourceMapCoverageForItems(normalizedSourceMap, items);

  const keyPeople = uniqueStrings([
    ...asStringArray(value.keyPeople),
    ...parsed.summary.keyPeople,
    ...items
      .map((item) => item.person)
      .filter((entry): entry is string => Boolean(entry))
  ]);
  const keyTerms = uniqueStrings([
    ...asStringArray(value.keyTerms),
    ...asStringArray(value.vocabulary),
    ...parsed.summary.keyTerms,
    ...items
      .map((item) => item.term)
      .filter((entry): entry is string => Boolean(entry))
  ]);
  const importantDates = uniqueStrings([
    ...asStringArray(value.importantDates),
    ...parsed.summary.importantDates,
    ...items
      .map((item) => item.date)
      .filter((entry): entry is string => Boolean(entry))
  ]);
  const processes = uniqueStrings([
    ...asStringArray(value.processes),
    ...(parsed.summary.processes ?? []),
    ...items
      .filter((item) =>
        item.itemType === "cause" ||
        item.itemType === "event" ||
        item.itemType === "consequence" ||
        item.itemType === "legacy"
      )
      .map((item) => item.itemType)
  ]);
  const subtopics = uniqueStrings(
    [
      ...asStringArray(value.subtopics),
      ...parsed.summary.subtopics,
      ...deriveSubtopicsFromCompatibilityCandidate(value, relayTags),
      ...items.map((item) => item.subtopic)
    ]
      .map((entry) => cleanCompatText(entry))
      .filter(
        (entry): entry is string =>
          typeof entry === "string" && entry.length > 0 && !samePhrase(entry, mainTopic ?? "")
      )
  );

  const learnerFacingMaterialSummary = firstNonEmptyString(
    asNonEmptyString(value.learnerFacingMaterialSummary),
    asNonEmptyString(value.summary),
    parsed.summary.learnerFacingMaterialSummary,
    buildFallbackLearnerSummary({
      mainTopic: mainTopic ?? context.sourceName,
      subtopics,
      keyTerms,
      processes
    })
  );

  const learningObjectives = normalizeCompatibilityObjectives({
    rawObjectives: value.learningObjectives,
    sourceMap: completeSourceMap,
    items,
    fallbackObjectives: parsed.summary.learningObjectives,
    mainTopic: mainTopic ?? context.sourceName
  });

  return {
    schema: "MasterDataInterpretationCandidate.v1",
    documentTitle,
    detectedSubject,
    detectedYearGroup,
    mainTopic,
    subtopics,
    keyPeople,
    keyTerms,
    importantDates,
    processes,
    learnerFacingMaterialSummary,
    learningObjectives,
    sourceMap: completeSourceMap,
    items
  };
}

export function validateMasterDataInterpretationCandidate(
  value: unknown
): MasterDataInterpretationCandidate {
  const candidate = candidateSchema.parse(value);
  const sourceRefs = new Set(candidate.sourceMap.map((entry) => entry.sourceRef));
  const sourceMapByRef = new Map(candidate.sourceMap.map((entry) => [entry.sourceRef, entry.excerpt]));

  assertSpecificField(candidate.detectedSubject, "detected subject");
  assertSpecificField(candidate.detectedYearGroup, "detected year group");
  assertSpecificField(candidate.mainTopic, "main topic");

  const distinctSubtopics = uniqueStrings(
    candidate.subtopics.filter((subtopic) => !samePhrase(subtopic, candidate.mainTopic))
  );
  if (distinctSubtopics.length === 0) {
    throw new Error(
      "Master data interpretation candidate must include at least one specific subtopic."
    );
  }

  const summary = candidate.learnerFacingMaterialSummary.trim();
  if (summary.length < 48 || tokenize(summary).length < 8) {
    throw new Error(
      "Master data interpretation candidate must include a useful learner-facing material summary."
    );
  }
  if (!containsPhrase(summary, candidate.mainTopic)) {
    throw new Error(
      "Master data interpretation candidate summary must mention the detected main topic."
    );
  }
  if (!hasSpecificAnchor(summary, candidate, { includeMainTopic: false })) {
    throw new Error(
      "Master data interpretation candidate summary is too vague and must mention specific material details."
    );
  }

  for (const objective of candidate.learningObjectives) {
    if (objective.objective.trim().length < 20 || tokenize(objective.objective).length < 4) {
      throw new Error(
        `Learning objective ${objective.id} must be specific enough to guide study.`
      );
    }
    if (!hasSpecificAnchor(objective.objective, candidate)) {
      throw new Error(
        `Learning objective ${objective.id} must reference a specific topic, subtopic, term, person, date, or process.`
      );
    }

    for (const sourceRef of objective.sourceRefs) {
      if (!sourceRefs.has(sourceRef)) {
        throw new Error(
          `Learning objective ${objective.id} references unknown source ref ${sourceRef}.`
        );
      }

      const excerpt = sourceMapByRef.get(sourceRef)?.trim() ?? "";
      if (excerpt.length < 4 || tokenize(excerpt).length < 1) {
        throw new Error(
          `Learning objective ${objective.id} references source ref ${sourceRef} without a useful excerpt.`
        );
      }
    }
  }

  for (const item of candidate.items) {
    if (!sourceRefs.has(item.sourceRef)) {
      throw new Error(`Structured item references unknown source ref ${item.sourceRef}.`);
    }
  }

  requireTopLevelEvidenceCoverage(candidate);

  return candidate;
}

export function buildMasterDataInterpretationSummary(
  interpretation: MasterDataInterpretationCandidate
): MasterDataInterpretationSummary {
  return {
    documentTitle: interpretation.documentTitle,
    mainTopic: interpretation.mainTopic,
    subject: interpretation.detectedSubject,
    yearGroup: interpretation.detectedYearGroup,
    subtopics: [...interpretation.subtopics],
    keyPeople: [...interpretation.keyPeople],
    keyTerms: [...interpretation.keyTerms],
    importantDates: [...interpretation.importantDates],
    learnerFacingMaterialSummary: interpretation.learnerFacingMaterialSummary,
    learningObjectives: interpretation.learningObjectives.map((objective) => objective.objective),
    processes: [...interpretation.processes]
  };
}

export function buildInterpretationPrompt(item: StructuredMasterDataFields): string {
  const context = item.subtopic || item.topic;
  const anchor = item.person ?? item.term ?? item.date ?? findAnchor(item.content);

  switch (item.itemType) {
    case "person":
      return `Who was ${item.person ?? anchor ?? "this figure"}?`;
    case "key_term":
      return `What does ${item.term ?? anchor ?? "this term"} mean?`;
    case "date":
      return `What happened in ${item.date ?? anchor ?? "this date"}?`;
    case "cause":
      return `What was one cause linked to ${context}?`;
    case "event":
      return anchor
        ? `What happened to ${anchor} during ${context}?`
        : `What happened during ${context}?`;
    case "consequence":
      return `What was one consequence of ${context}?`;
    case "legacy":
      return `What was part of ${item.topic}'s legacy?`;
    case "fact":
    default:
      return anchor
        ? `What should you remember about ${anchor} in ${context}?`
        : `What is one key fact from ${context}?`;
  }
}

export function buildInterpretationVisibleMaterial(item: StructuredMasterDataFields): string {
  return [
    `${item.subject} ${item.yearGroup}`,
    `Topic: ${item.topic}`,
    `Subtopic: ${item.subtopic}`,
    `Source ref: ${item.sourceRef}`
  ].join(" · ");
}

export function createUploadItemsFromInterpretation(
  interpretation: MasterDataInterpretationCandidate
): Array<{
  topic: string;
  prompt: string;
  canonicalAnswer: string;
  visibleMaterial: string;
  keywords: readonly string[];
  structured: StructuredMasterDataFields;
}> {
  const summary = buildMasterDataInterpretationSummary(interpretation);
  const summaryKeywords = encodeInterpretationSummaryKeywords(summary);

  return interpretation.items.map((item) => ({
    topic: interpretation.mainTopic,
    prompt: buildInterpretationPrompt(item),
    canonicalAnswer: item.definition ?? item.content,
    visibleMaterial: buildInterpretationVisibleMaterial(item),
    structured: item,
    keywords: [
      item.subject,
      item.yearGroup,
      item.topic,
      item.subtopic,
      item.itemType,
      item.person,
      item.term,
      item.date,
      encodeStructuredItemKeyword("subject", item.subject),
      encodeStructuredItemKeyword("yearGroup", item.yearGroup),
      encodeStructuredItemKeyword("topic", item.topic),
      encodeStructuredItemKeyword("subtopic", item.subtopic),
      encodeStructuredItemKeyword("itemType", item.itemType),
      encodeStructuredItemKeyword("content", item.content),
      encodeStructuredItemKeyword("sourceRef", item.sourceRef),
      encodeStructuredItemKeyword("date", item.date),
      encodeStructuredItemKeyword("definition", item.definition),
      encodeStructuredItemKeyword("person", item.person),
      encodeStructuredItemKeyword("term", item.term),
      ...summaryKeywords
    ].filter((value): value is string => Boolean(value && value.trim()))
  }));
}

export function attachInterpretationSummaryToUploadItems(
  items: readonly {
    canonicalAnswer: string;
    keywords?: readonly string[];
    prompt: string;
    structured?: StructuredMasterDataFields;
    topic: string;
    visibleMaterial: string;
  }[],
  interpretation: MasterDataInterpretationCandidate
): Array<{
  canonicalAnswer: string;
  keywords: readonly string[];
  prompt: string;
  structured?: StructuredMasterDataFields;
  topic: string;
  visibleMaterial: string;
}> {
  const summaryKeywords = encodeInterpretationSummaryKeywords(
    buildMasterDataInterpretationSummary(interpretation)
  );

  return items.map((item) => ({
    ...item,
    keywords: [...(item.keywords ?? []), ...summaryKeywords]
  }));
}

export function decodeInterpretationSummaryFromItems(
  items: readonly Pick<PublicMasterDataItemSnapshot, "keywords">[]
): MasterDataInterpretationSummary | undefined {
  const metadata = new Map<string, string>();

  for (const item of items) {
    for (const keyword of item.keywords) {
      if (!keyword.startsWith(summaryMetadataPrefix)) {
        continue;
      }

      const separatorIndex = keyword.indexOf("=");
      if (separatorIndex === -1) {
        continue;
      }

      const key = keyword.slice(summaryMetadataPrefix.length, separatorIndex);
      metadata.set(key, decodeURIComponent(keyword.slice(separatorIndex + 1)));
    }
  }

  const mainTopic = metadata.get("mainTopic");
  if (!mainTopic) {
    return undefined;
  }

  return {
    documentTitle: metadata.get("documentTitle"),
    mainTopic,
    subject: metadata.get("subject"),
    yearGroup: metadata.get("yearGroup"),
    subtopics: decodeSummaryList(metadata.get("subtopics")),
    keyPeople: decodeSummaryList(metadata.get("keyPeople")),
    keyTerms: decodeSummaryList(metadata.get("keyTerms")),
    importantDates: decodeSummaryList(metadata.get("importantDates")),
    learnerFacingMaterialSummary: metadata.get("learnerFacingMaterialSummary"),
    learningObjectives: decodeSummaryList(metadata.get("learningObjectives")),
    processes: decodeSummaryList(metadata.get("processes"))
  };
}

export function buildSourceEvidenceFromInterpretation(input: {
  interpretation?: MasterDataInterpretationCandidate;
  items: readonly StructuredMasterDataFields[];
}): readonly {
  content: string;
  excerpt: string;
  itemType: StructuredMasterDataItemType;
  sourceRef: string;
  subtopic: string;
  topic: string;
}[] {
  const excerptsByRef = new Map(
    input.interpretation?.sourceMap.map((entry) => [entry.sourceRef, entry.excerpt]) ?? []
  );

  return input.items.map((item) => ({
    topic: item.topic,
    subtopic: item.subtopic,
    itemType: item.itemType,
    sourceRef: item.sourceRef,
    content: item.content,
    excerpt: excerptsByRef.get(item.sourceRef) ?? item.content
  }));
}

export function selectInterpretationObjectives(input: {
  fallbackObjectives?: readonly string[];
  interpretation?: MasterDataInterpretationCandidate;
  sourceRefs?: readonly string[];
}): readonly string[] {
  const interpretation = input.interpretation;
  if (!interpretation) {
    return uniqueStrings(input.fallbackObjectives ?? []);
  }

  const sourceRefs = new Set((input.sourceRefs ?? []).filter(Boolean));
  const matchedObjectives = interpretation.learningObjectives
    .filter((objective) =>
      sourceRefs.size > 0
        ? objective.sourceRefs.some((sourceRef) => sourceRefs.has(sourceRef))
        : true
    )
    .map((objective) => objective.objective);

  if (matchedObjectives.length > 0) {
    return uniqueStrings(matchedObjectives);
  }

  const interpretationObjectives = interpretation.learningObjectives.map(
    (objective) => objective.objective
  );
  if (interpretationObjectives.length > 0) {
    return uniqueStrings(interpretationObjectives);
  }

  return uniqueStrings(input.fallbackObjectives ?? []);
}

function decodeSummaryList(value: string | undefined): readonly string[] {
  if (!value) {
    return [];
  }

  return value
    .split("||")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function encodeInterpretationSummaryKeywords(
  summary: MasterDataInterpretationSummary
): readonly string[] {
  const list = [
    encodeSummaryKeyword("documentTitle", summary.documentTitle),
    encodeSummaryKeyword("mainTopic", summary.mainTopic),
    encodeSummaryKeyword("subject", summary.subject),
    encodeSummaryKeyword("yearGroup", summary.yearGroup),
    encodeSummaryKeyword("subtopics", summary.subtopics.join("||")),
    encodeSummaryKeyword("keyPeople", summary.keyPeople.join("||")),
    encodeSummaryKeyword("keyTerms", summary.keyTerms.join("||")),
    encodeSummaryKeyword("importantDates", summary.importantDates.join("||")),
    encodeSummaryKeyword(
      "learnerFacingMaterialSummary",
      summary.learnerFacingMaterialSummary
    ),
    encodeSummaryKeyword("learningObjectives", summary.learningObjectives.join("||")),
    encodeSummaryKeyword("processes", summary.processes.join("||"))
  ];

  return list.filter((value): value is string => Boolean(value));
}

function encodeStructuredItemKeyword(
  key:
    | "content"
    | "date"
    | "definition"
    | "itemType"
    | "person"
    | "sourceRef"
    | "subject"
    | "subtopic"
    | "term"
    | "topic"
    | "yearGroup",
  value: string | undefined
): string | undefined {
  if (!value) {
    return undefined;
  }

  return `__md_${key}=${encodeURIComponent(value)}`;
}

function encodeSummaryKeyword(key: string, value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return `${summaryMetadataPrefix}${key}=${encodeURIComponent(value)}`;
}

function findAnchor(content: string): string | undefined {
  const quoted = content.match(/[“"]([^”"]+)[”"]/);
  if (quoted?.[1]) {
    return quoted[1];
  }

  const dateMatch = content.match(/\b(?:\d{1,2}\s+[A-Z][a-z]+\s+\d{4}|\d{4}(?:[–-]\d{4})?)\b/);
  if (dateMatch?.[0]) {
    return dateMatch[0];
  }

  const properNouns = content.match(
    /\b(?:[A-Z][a-z]+|[A-Z][a-z]+(?:\s+(?:[IVX]+|of|the|and|[A-Z][a-z]+))+)\b/g
  );
  return properNouns?.find(
    (candidate) => candidate.length > 2 && !/^(?:The|A|An)$/i.test(candidate.trim())
  );
}

function assertSpecificField(value: string, label: string) {
  const normalized = normalizePhrase(value);
  if (!normalized || vagueFieldValues.has(normalized)) {
    throw new Error(`Master data interpretation candidate must include a specific ${label}.`);
  }
}

function requireTopLevelEvidenceCoverage(candidate: MasterDataInterpretationCandidate) {
  const people = uniqueStrings(
    candidate.items
      .map((item) => item.person)
      .filter((value): value is string => Boolean(value))
  );
  if (people.length > 0 && !hasIntersection(candidate.keyPeople, people)) {
    throw new Error(
      "Master data interpretation candidate must surface important people when person items are present."
    );
  }

  const terms = uniqueStrings(
    candidate.items
      .map((item) => item.term)
      .filter((value): value is string => Boolean(value))
  );
  if (terms.length > 0 && !hasIntersection(candidate.keyTerms, terms)) {
    throw new Error(
      "Master data interpretation candidate must surface key terms when key term items are present."
    );
  }

  const dates = uniqueStrings(
    candidate.items
      .map((item) => item.date)
      .filter((value): value is string => Boolean(value))
  );
  if (dates.length > 0 && !hasIntersection(candidate.importantDates, dates)) {
    throw new Error(
      "Master data interpretation candidate must surface important dates when date items are present."
    );
  }

  const processItems = candidate.items.filter((item) =>
    item.itemType === "cause" ||
    item.itemType === "event" ||
    item.itemType === "consequence" ||
    item.itemType === "legacy"
  );
  if (processItems.length > 0 && candidate.processes.length === 0) {
    throw new Error(
      "Master data interpretation candidate must surface processes when process items are present."
    );
  }
}

function hasSpecificAnchor(
  text: string,
  candidate: Pick<
    MasterDataInterpretationCandidate,
    | "importantDates"
    | "keyPeople"
    | "keyTerms"
    | "mainTopic"
    | "processes"
    | "subtopics"
  >,
  options: {
    includeMainTopic?: boolean;
  } = {}
): boolean {
  const anchors = [
    ...(options.includeMainTopic === false ? [] : [candidate.mainTopic]),
    ...candidate.subtopics,
    ...candidate.keyPeople,
    ...candidate.keyTerms,
    ...candidate.importantDates,
    ...candidate.processes
  ].filter((value) => !samePhrase(value, candidate.mainTopic));

  return anchors.some((anchor) => containsPhrase(text, anchor));
}

function hasIntersection(left: readonly string[], right: readonly string[]) {
  const rightSet = new Set(right.map(normalizePhrase));
  return left.some((value) => rightSet.has(normalizePhrase(value)));
}

function containsPhrase(text: string, phrase: string) {
  const normalizedText = normalizePhrase(text);
  const normalizedPhrase = normalizePhrase(phrase);
  return normalizedPhrase.length > 0 && normalizedText.includes(normalizedPhrase);
}

function samePhrase(left: string, right: string) {
  return normalizePhrase(left) === normalizePhrase(right);
}

function normalizePhrase(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string) {
  return normalizePhrase(value)
    .split(" ")
    .filter(Boolean);
}

function uniqueStrings(values: readonly string[]) {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function looksLikeRelayCompatibilityCandidate(value: Record<string, unknown>) {
  return (
    "summary" in value ||
    "topic" in value ||
    "vocabulary" in value ||
    "keyConcepts" in value ||
    "mustKnow" in value ||
    "commonMistakes" in value ||
    "caseStudy" in value ||
    ("learningObjectives" in value &&
      Array.isArray(value.learningObjectives) &&
      value.learningObjectives.some((entry) => typeof entry === "string"))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? cleanCompatText(entry) : undefined))
    .filter((entry): entry is string => Boolean(entry));
}

function firstNonEmptyString(...values: Array<string | undefined>): string | undefined {
  return values.find((value): value is string => Boolean(value && value.trim()));
}

function cleanCompatText(value: string | undefined): string | undefined {
  return value?.replace(/\s+/g, " ").trim() || undefined;
}

function inferSubjectFromText(value: string | undefined): string | undefined {
  const normalized = value?.toLowerCase() ?? "";
  if (!normalized) {
    return undefined;
  }

  if (normalized.includes("history")) {
    return "History";
  }
  if (normalized.includes("geography")) {
    return "Geography";
  }
  if (normalized.includes("science")) {
    return "Science";
  }
  if (normalized.includes("latin")) {
    return "Latin";
  }
  if (normalized.includes("tpr")) {
    return "TPR";
  }

  return undefined;
}

function normalizeSourceMapEntries(value: unknown): MasterDataSourceMapEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!isRecord(entry)) {
        return undefined;
      }

      const sourceRef = asNonEmptyString(entry.sourceRef);
      const excerpt = asNonEmptyString(entry.excerpt);
      if (!sourceRef || !excerpt) {
        return undefined;
      }

      return { sourceRef, excerpt };
    })
    .filter((entry): entry is MasterDataSourceMapEntry => Boolean(entry));
}

function buildSourceMapFromParsedInput(
  parsed: ParsedMasterDataInput
): MasterDataSourceMapEntry[] {
  const seen = new Set<string>();
  const entries: MasterDataSourceMapEntry[] = [];

  for (const item of parsed.structuredItems) {
    if (seen.has(item.sourceRef)) {
      continue;
    }
    seen.add(item.sourceRef);
    entries.push({
      sourceRef: item.sourceRef,
      excerpt: item.content
    });
  }

  return entries;
}

function buildFallbackSourceMap(
  rawSourceContent: string,
  mainTopic: string
): MasterDataSourceMapEntry[] {
  return rawSourceContent
    .split(/\n{2,}/)
    .map((entry) => entry.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((excerpt, index) => ({
      sourceRef: nextGeneratedRef(mainTopic, `source-${index + 1}`),
      excerpt
    }));
}

function dedupeSourceMap(entries: readonly MasterDataSourceMapEntry[]) {
  const seen = new Set<string>();
  const output: MasterDataSourceMapEntry[] = [];

  for (const entry of entries) {
    const key = `${entry.sourceRef}::${entry.excerpt}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(entry);
  }

  return output;
}

function ensureSourceMapCoverageForItems(
  sourceMap: readonly MasterDataSourceMapEntry[],
  items: readonly StructuredMasterDataFields[]
) {
  const existingRefs = new Set(sourceMap.map((entry) => entry.sourceRef));
  const additions = items
    .filter((item) => !existingRefs.has(item.sourceRef))
    .map((item) => ({
      sourceRef: item.sourceRef,
      excerpt: item.definition ?? item.content
    }));

  return dedupeSourceMap([...sourceMap, ...additions]);
}

function normalizeStructuredItems(
  value: unknown,
  detectedSubject?: string,
  detectedYearGroup?: string,
  mainTopic?: string
): StructuredMasterDataFields[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: StructuredMasterDataFields[] = [];

  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }

    const sourceRef = asNonEmptyString(entry.sourceRef);
    const content = asNonEmptyString(entry.content);
    const subtopic = asNonEmptyString(entry.subtopic);
    const itemType = asNonEmptyString(entry.itemType) as StructuredMasterDataItemType | undefined;
    if (!sourceRef || !content || !subtopic || !itemType) {
      continue;
    }

    normalized.push({
      subject:
        asNonEmptyString(entry.subject) ??
        detectedSubject ??
        "Unknown",
      yearGroup:
        asNonEmptyString(entry.yearGroup) ??
        detectedYearGroup ??
        "Unknown",
      topic:
        asNonEmptyString(entry.topic) ??
        mainTopic ??
        "Unknown",
      subtopic,
      itemType,
      content,
      sourceRef,
      date: asNonEmptyString(entry.date),
      definition: asNonEmptyString(entry.definition),
      person: asNonEmptyString(entry.person),
      term: asNonEmptyString(entry.term)
    });
  }

  return normalized;
}

function buildCompatibleRelayItems(input: {
  candidate: Record<string, unknown>;
  detectedSubject: string;
  detectedYearGroup: string;
  mainTopic: string;
  parsed: ParsedMasterDataInput;
  sourceMap: readonly MasterDataSourceMapEntry[];
}): StructuredMasterDataFields[] {
  const output: StructuredMasterDataFields[] = [];
  const addTextItems = (
    values: string[],
    subtopic: string,
    itemType: StructuredMasterDataItemType,
    mapper?: (value: string) => Partial<StructuredMasterDataFields>
  ) => {
    for (const value of values) {
      const sourceRef = matchSourceRefForText(value, input.sourceMap, subtopic, input.mainTopic);
      output.push({
        subject: input.detectedSubject,
        yearGroup: input.detectedYearGroup,
        topic: input.mainTopic,
        subtopic,
        itemType,
        content: matchedExcerptForRef(sourceRef, input.sourceMap) ?? value,
        sourceRef,
        ...mapper?.(value)
      });
    }
  };

  addTextItems(asStringArray(input.candidate.keyConcepts), "Key Concepts", "fact");
  addTextItems(asStringArray(input.candidate.mustKnow), "Must Know", "fact");
  addTextItems(asStringArray(input.candidate.commonMistakes), "Common Mistakes", "fact");
  addTextItems(asStringArray(input.candidate.vocabulary), "Vocabulary", "key_term", (value) => ({
    term: value,
    definition: matchedExcerptForRef(
      matchSourceRefForText(value, input.sourceMap, "Vocabulary", input.mainTopic),
      input.sourceMap
    ) ?? value
  }));

  const caseStudy = asNonEmptyString(input.candidate.caseStudy);
  if (caseStudy) {
    output.push({
      subject: input.detectedSubject,
      yearGroup: input.detectedYearGroup,
      topic: input.mainTopic,
      subtopic: "Case Study",
      itemType: "fact",
      content:
        matchedExcerptForRef(
          matchSourceRefForText(caseStudy, input.sourceMap, "Case Study", input.mainTopic),
          input.sourceMap
        ) ?? caseStudy,
      sourceRef: matchSourceRefForText(caseStudy, input.sourceMap, "Case Study", input.mainTopic)
    });
  }

  return output;
}

function matchSourceRefForText(
  text: string,
  sourceMap: readonly MasterDataSourceMapEntry[],
  subtopic: string,
  mainTopic: string
): string {
  const normalizedText = normalizePhrase(text);

  for (const entry of sourceMap) {
    const normalizedExcerpt = normalizePhrase(entry.excerpt);
    if (!normalizedExcerpt) {
      continue;
    }

    if (
      normalizedExcerpt.includes(normalizedText) ||
      normalizedText.split(" ").some((token) => token.length > 4 && normalizedExcerpt.includes(token))
    ) {
      return entry.sourceRef;
    }
  }

  return nextGeneratedRef(`${mainTopic} ${subtopic}`, "compat");
}

function matchedExcerptForRef(
  sourceRef: string,
  sourceMap: readonly MasterDataSourceMapEntry[]
): string | undefined {
  return sourceMap.find((entry) => entry.sourceRef === sourceRef)?.excerpt;
}

function dedupeStructuredItems(
  items: readonly StructuredMasterDataFields[],
  detectedSubject?: string,
  detectedYearGroup?: string,
  mainTopic?: string
): StructuredMasterDataFields[] {
  const seen = new Set<string>();
  const output: StructuredMasterDataFields[] = [];

  for (const item of items) {
    const normalized = {
      ...item,
      subject: detectedSubject ?? item.subject,
      yearGroup: detectedYearGroup ?? item.yearGroup,
      topic: mainTopic ?? item.topic
    };
    const key = [
      normalized.itemType,
      normalized.subtopic,
      normalized.sourceRef,
      normalizePhrase(normalized.content)
    ].join("::");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(normalized);
  }

  return output;
}

function deriveSubtopicsFromCompatibilityCandidate(
  candidate: Record<string, unknown>,
  tags: readonly string[]
): string[] {
  return uniqueStrings([
    ...asStringArray(candidate.keyConcepts),
    ...tags.filter((tag) => !/^year\s+\d+$/i.test(tag)),
    ...(asNonEmptyString(candidate.caseStudy) ? ["Case Study"] : []),
    ...((Array.isArray(candidate.mustKnow) && candidate.mustKnow.length > 0) ? ["Must Know"] : []),
    ...((Array.isArray(candidate.commonMistakes) && candidate.commonMistakes.length > 0)
      ? ["Common Mistakes"]
      : [])
  ]);
}

function normalizeCompatibilityObjectives(input: {
  fallbackObjectives?: readonly string[];
  items: readonly StructuredMasterDataFields[];
  mainTopic: string;
  rawObjectives: unknown;
  sourceMap: readonly MasterDataSourceMapEntry[];
}): MasterDataInterpretationObjective[] {
  if (Array.isArray(input.rawObjectives) && input.rawObjectives.every(isRecord)) {
    return input.rawObjectives
      .map((objective) => {
        const sourceRefs = Array.isArray(objective.sourceRefs)
          ? objective.sourceRefs
              .map((entry) => asNonEmptyString(entry))
              .filter((entry): entry is string => Boolean(entry))
          : [];
        const objectiveText =
          asNonEmptyString(objective.objective) ??
          asNonEmptyString(objective.title) ??
          asNonEmptyString(objective.description);
        if (!objectiveText) {
          return undefined;
        }

        return {
          id:
            asNonEmptyString(objective.id) ??
            nextGeneratedRef(input.mainTopic, "objective"),
          objective: objectiveText,
          sourceRefs:
            sourceRefs.length > 0
              ? sourceRefs
              : findSourceRefsForObjective(objectiveText, input.sourceMap, input.items)
        };
      })
      .filter((entry): entry is MasterDataInterpretationObjective => Boolean(entry));
  }

  const objectiveStrings = [
    ...asStringArray(input.rawObjectives),
    ...(input.fallbackObjectives ?? [])
  ];

  return uniqueStrings(objectiveStrings).map((objective, index) => ({
    id: `objective_${index + 1}`,
    objective,
    sourceRefs: findSourceRefsForObjective(objective, input.sourceMap, input.items)
  }));
}

function findSourceRefsForObjective(
  objective: string,
  sourceMap: readonly MasterDataSourceMapEntry[],
  items: readonly StructuredMasterDataFields[]
): string[] {
  const matched = uniqueStrings([
    ...items
      .filter(
        (item) =>
          containsPhrase(objective, item.subtopic) ||
          containsPhrase(objective, item.term ?? "") ||
          containsPhrase(objective, item.person ?? "") ||
          containsPhrase(objective, item.date ?? "")
      )
      .map((item) => item.sourceRef),
    ...sourceMap
      .filter((entry) => containsPhrase(entry.excerpt, objective) || containsPhrase(objective, entry.excerpt))
      .map((entry) => entry.sourceRef)
  ]);

  if (matched.length > 0) {
    return matched;
  }

  return sourceMap[0]?.sourceRef ? [sourceMap[0].sourceRef] : ["generated-objective-ref"];
}

function buildFallbackLearnerSummary(input: {
  keyTerms: readonly string[];
  mainTopic: string;
  processes: readonly string[];
  subtopics: readonly string[];
}) {
  const fragments = [
    `${input.mainTopic} covers ${input.subtopics.slice(0, 2).join(" and ") || "the main study themes"}.`,
    input.keyTerms.length > 0
      ? `Useful vocabulary includes ${input.keyTerms.slice(0, 3).join(", ")}.`
      : undefined,
    input.processes.length > 0
      ? `Important processes include ${input.processes.join(", ")}.`
      : undefined
  ].filter((entry): entry is string => Boolean(entry));

  return fragments.join(" ");
}

let generatedRefCounter = 0;

function nextGeneratedRef(scope: string, suffix: string) {
  generatedRefCounter += 1;
  return `${cleanCompatText(scope) ?? "source"} > ${suffix}-${generatedRefCounter}`;
}

const vagueFieldValues = new Set([
  "content",
  "general",
  "material",
  "study",
  "study material",
  "subject",
  "topic",
  "unknown"
]);
