import type { UploadMasterDataCommand } from "../../domain/study/MasterDataUpload.js";

export type StructuredMasterDataItemType =
  | "fact"
  | "person"
  | "key_term"
  | "date"
  | "cause"
  | "event"
  | "consequence"
  | "legacy";

export interface StructuredMasterDataFields {
  subject: string;
  yearGroup: string;
  topic: string;
  subtopic: string;
  itemType: StructuredMasterDataItemType;
  content: string;
  sourceRef: string;
  date?: string;
  definition?: string;
  person?: string;
  term?: string;
}

export interface ParsedMasterDataSummary {
  documentTitle?: string;
  mainTopic?: string;
  subject?: string;
  yearGroup?: string;
  subtopics: readonly string[];
  keyPeople: readonly string[];
  keyTerms: readonly string[];
  importantDates: readonly string[];
}

export interface ParsedMasterDataInput {
  items: UploadMasterDataCommand["items"];
  mode: "legacy" | "structured";
  structuredItems: readonly StructuredMasterDataFields[];
  summary: ParsedMasterDataSummary;
}

const knownSubjects = ["History", "Science", "Geography", "Latin", "TPR"] as const;

const metadataPrefix = "__md_";
const metadataKeys = [
  "subject",
  "yearGroup",
  "topic",
  "subtopic",
  "itemType",
  "content",
  "sourceRef",
  "date",
  "definition",
  "person",
  "term"
] as const;

type MetadataKey = (typeof metadataKeys)[number];

function isBulletLine(line: string | undefined): boolean {
  return Boolean(line && /^\s*-\s+/.test(line));
}

function isNumberedLine(line: string | undefined): boolean {
  return Boolean(line && /^\s*\d+\.\s+/.test(line));
}

function isListItemLine(line: string | undefined): boolean {
  return isBulletLine(line) || isNumberedLine(line);
}

function isSeparatorLine(line: string | undefined): boolean {
  return Boolean(line && /^[-=]{10,}$/.test(line.trim()));
}

function sanitizeLine(line: string): string {
  return line
    .replace(/\uFEFF/g, "")
    .replace(/^\s*@/, "")
    .replace(/\\([=().-])/g, "$1")
    .trimEnd();
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripBulletMarker(line: string): string {
  return cleanText(line.replace(/^\s*-\s+/, ""));
}

function stripListMarker(line: string): string {
  return cleanText(line.replace(/^\s*(?:-\s+|\d+\.\s+)/, ""));
}

function titleCaseWord(word: string): string {
  if (/^[ivxlcdm]+$/i.test(word)) {
    return word.toUpperCase();
  }

  if (word.length <= 2 && /^[a-z]$/i.test(word)) {
    return word.toUpperCase();
  }

  return word.replace(/^[a-z]/, (letter) => letter.toUpperCase());
}

function formatHeading(value: string): string {
  const trimmed = cleanText(value);
  if (!trimmed) {
    return trimmed;
  }

  const normalized = /[a-z]/.test(trimmed)
    ? trimmed
    : trimmed.toLowerCase();

  return normalized
    .split(" ")
    .map((token) =>
      token
        .split(/([’'])/)
        .map((part, index, parts) => {
          if (!/^[A-Za-z]+$/.test(part)) {
            return part;
          }

          const previous = parts[index - 1];
          if ((previous === "’" || previous === "'") && part.length === 1) {
            return part.toLowerCase();
          }

          return titleCaseWord(part);
        })
        .join("")
    )
    .join(" ");
}

function stripTopicDateSuffix(value: string): string {
  return cleanText(value.replace(/\s*\((?:\d{4}(?:[–-]\d{4})?)\)\s*$/, ""));
}

function buildBlocks(text: string): string[][] {
  const blocks: string[][] = [];
  let current: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = sanitizeLine(rawLine);
    const trimmed = line.trim();

    if (!trimmed || isSeparatorLine(trimmed)) {
      if (current.length > 0) {
        blocks.push(current);
        current = [];
      }
      continue;
    }

    current.push(trimmed);
  }

  if (current.length > 0) {
    blocks.push(current);
  }

  return blocks;
}

function stripMasterDocumentSuffix(value: string): string {
  return cleanText(
    value
      .replace(/^MASTER\b.*$/i, "")
      .replace(/^CONTENT FILE\b.*$/i, "")
      .replace(/^REVISION DOCUMENT\b.*$/i, "")
      .replace(/^DOCUMENT\b.*$/i, "")
      .replace(/^FILE\b.*$/i, "")
      .replace(/\s+[—–-]\s*MASTER\b.*$/i, "")
      .replace(/\s+MASTER\b.*$/i, "")
      .replace(/\s+CONTENT FILE\b.*$/i, "")
      .replace(/\s+REVISION DOCUMENT\b.*$/i, "")
      .replace(/\s+DOCUMENT\b.*$/i, "")
      .replace(/\s+FILE\b.*$/i, "")
  );
}

function parseYearGroupAndSubject(value: string | undefined): {
  subject?: string;
  titleTopic?: string;
  yearGroup?: string;
} {
  if (!value) {
    return {};
  }

  const cleaned = cleanText(value.replace(/^@/, ""));
  const yearMatch = cleaned.match(/\bY\s*([0-9]{1,2})\b/i);
  const yearGroup = yearMatch?.[1] ? `Year ${yearMatch[1]}` : undefined;
  const afterYear = yearMatch
    ? cleanText(cleaned.slice((yearMatch.index ?? 0) + yearMatch[0].length))
    : cleaned;
  const matchedSubject = knownSubjects.find((candidate) =>
    afterYear.toUpperCase().startsWith(candidate.toUpperCase())
  );

  if (matchedSubject) {
    const trailing = cleanText(
      afterYear
        .slice(matchedSubject.length)
        .trimStart()
        .replace(/^[—–-]\s*/, "")
    );
    const titleTopic = stripTopicDateSuffix(stripMasterDocumentSuffix(trailing || matchedSubject));

    return {
      subject: matchedSubject,
      titleTopic: titleTopic ? formatHeading(titleTopic) : matchedSubject,
      yearGroup
    };
  }

  const match = cleaned.match(/\bY\s*([0-9]{1,2})\s+([A-Z][A-Z ]+?)(?=\s+[—–-]|$)/i);
  if (!match) {
    return {
      yearGroup
    };
  }

  const [, , subjectToken] = match;
  const subject = subjectToken ? formatHeading(subjectToken) : undefined;

  return {
    subject,
    titleTopic: undefined,
    yearGroup
  };
}

function encodeMetadataKeyword(key: MetadataKey, value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return `${metadataPrefix}${key}=${encodeURIComponent(value)}`;
}

function buildKeywordList(item: StructuredMasterDataFields): readonly string[] {
  const naturalKeywords = [
    item.subject,
    item.yearGroup,
    item.topic,
    item.subtopic,
    item.itemType,
    item.person,
    item.term,
    item.date
  ].filter((value): value is string => Boolean(value && value.trim()));
  const metadataKeywords = metadataKeys
    .map((key) => encodeMetadataKeyword(key, item[key]))
    .filter((value): value is string => Boolean(value));

  return [...naturalKeywords, ...metadataKeywords];
}

export function decodeStructuredMetadataKeywords(keywords: readonly string[] | undefined): {
  keywords: readonly string[];
  structured?: StructuredMasterDataFields;
} {
  const metadata = new Map<MetadataKey, string>();
  const plainKeywords: string[] = [];

  for (const keyword of keywords ?? []) {
    if (!keyword.startsWith(metadataPrefix)) {
      plainKeywords.push(keyword);
      continue;
    }

    const separatorIndex = keyword.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = keyword.slice(metadataPrefix.length, separatorIndex) as MetadataKey;
    if (!metadataKeys.includes(key)) {
      continue;
    }

    metadata.set(key, decodeURIComponent(keyword.slice(separatorIndex + 1)));
  }

  const itemType = metadata.get("itemType");
  const subject = metadata.get("subject");
  const yearGroup = metadata.get("yearGroup");
  const topic = metadata.get("topic");
  const subtopic = metadata.get("subtopic");
  const content = metadata.get("content");
  const sourceRef = metadata.get("sourceRef");

  if (!itemType || !subject || !yearGroup || !topic || !subtopic || !content || !sourceRef) {
    return {
      keywords: plainKeywords
    };
  }

  return {
    keywords: plainKeywords,
    structured: {
      itemType: itemType as StructuredMasterDataItemType,
      subject,
      yearGroup,
      topic,
      subtopic,
      content,
      sourceRef,
      date: metadata.get("date"),
      definition: metadata.get("definition"),
      person: metadata.get("person"),
      term: metadata.get("term")
    }
  };
}

function splitLegacyKeywords(value: string): readonly string[] | undefined {
  if (!value) {
    return undefined;
  }

  const keywords = value
    .split(",")
    .map((keyword) => cleanText(keyword))
    .filter(Boolean);

  return keywords.length > 0 ? keywords : undefined;
}

function parseLegacyInput(
  lines: string,
  fallbackTopic: string,
  fallbackYearGroup?: string,
  fallbackSubject?: string
): ParsedMasterDataInput {
  const items = lines
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [prompt = "", canonicalAnswer = "", visibleMaterial = "", keywords = ""] = line
        .split("||")
        .map((part) => cleanText(part));

      return {
        topic: fallbackTopic,
        prompt,
        canonicalAnswer,
        visibleMaterial,
        keywords: splitLegacyKeywords(keywords)
      };
    });

  return {
    items,
    mode: "legacy",
    structuredItems: [],
    summary: {
      mainTopic: fallbackTopic,
      subject: fallbackSubject,
      yearGroup: fallbackYearGroup,
      subtopics: [],
      keyPeople: [],
      keyTerms: [],
      importantDates: []
    }
  };
}

function itemTypeFromHeading(value: string | undefined): StructuredMasterDataItemType | undefined {
  if (!value) {
    return undefined;
  }

  const heading = value.toLowerCase();
  if (heading.includes("cause")) {
    return "cause";
  }

  if (heading.includes("event")) {
    return "event";
  }

  if (heading.includes("consequence")) {
    return "consequence";
  }

  if (heading.includes("legacy")) {
    return "legacy";
  }

  return undefined;
}

function isCollectionHeading(value: string): value is "Important People" | "Key Terms" | "Important Dates" {
  return (
    value === "Important People" ||
    value === "Key Terms" ||
    value === "Important Dates"
  );
}

function extractAnchor(content: string): string | undefined {
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
  return properNouns?.find((candidate) => candidate.length > 2);
}

function buildPrompt(item: StructuredMasterDataFields): string {
  const context = item.subtopic || item.topic;
  const anchor = item.person ?? item.term ?? item.date ?? extractAnchor(item.content);

  switch (item.itemType) {
    case "person":
      return `Who was ${item.person ?? anchor ?? "this figure"}?`;
    case "key_term":
      return `What does ${item.term ?? anchor ?? "this term"} mean?`;
    case "date":
      return `What happened in ${item.date ?? anchor ?? "this year"}?`;
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

function buildVisibleMaterial(item: StructuredMasterDataFields): string {
  return [
    `${item.subject} ${item.yearGroup}`,
    `Topic: ${item.topic}`,
    `Subtopic: ${item.subtopic}`,
    `Source ref: ${item.sourceRef}`
  ].join(" · ");
}

function buildSourceRef(parts: readonly string[], itemType: StructuredMasterDataItemType, index: number): string {
  return `${parts.join(" > ")} > ${itemType}-${index}`;
}

function parseDateBullet(line: string): { date: string; detail: string } {
  const separatorMatch = line.match(/^(.+?)\s+[—-]\s+(.+)$/);
  if (separatorMatch?.[1] && separatorMatch[2]) {
    return {
      date: cleanText(separatorMatch[1]),
      detail: cleanText(separatorMatch[2])
    };
  }

  return {
    date: cleanText(line),
    detail: cleanText(line)
  };
}

function parseDefinitionLine(line: string): { definition: string; term: string } | undefined {
  const match = cleanText(line).match(/^(.+?)\s+=\s+(.+)$/);
  if (!match?.[1] || !match[2]) {
    return undefined;
  }

  return {
    term: cleanText(match[1]),
    definition: cleanText(match[2])
  };
}

function createStructuredUploadItem(item: StructuredMasterDataFields): UploadMasterDataCommand["items"][number] {
  return {
    topic: item.topic,
    prompt: buildPrompt(item),
    canonicalAnswer: item.definition ?? item.content,
    visibleMaterial: buildVisibleMaterial(item),
    keywords: buildKeywordList(item)
  };
}

function parseStructuredInput(
  sourceName: string,
  lines: string,
  fallbackTopic: string,
  fallbackYearGroup?: string,
  fallbackSubject?: string
): ParsedMasterDataInput {
  const blocks = buildBlocks(lines);
  if (blocks.length === 0) {
    return parseLegacyInput(lines, fallbackTopic, fallbackYearGroup, fallbackSubject);
  }

  const documentTitle = cleanText(blocks[0]?.join(" ") ?? sourceName);
  const { subject, titleTopic, yearGroup } = parseYearGroupAndSubject(documentTitle);
  const mainTopicBlock = blocks[1]?.[0] ?? fallbackTopic;
  const derivedMainTopic = titleTopic || formatHeading(stripTopicDateSuffix(mainTopicBlock));
  const mainTopic = derivedMainTopic || fallbackTopic;
  const structuredItems: StructuredMasterDataFields[] = [];
  const subtopics = new Set<string>();
  const keyPeople = new Set<string>();
  const keyTerms = new Set<string>();
  const importantDates = new Set<string>();
  const sourceRefCounters = new Map<string, number>();
  const detectedSubject = subject ?? fallbackSubject ?? "Unknown";
  const detectedYearGroup = yearGroup ?? fallbackYearGroup ?? "Unknown";

  let currentSection = mainTopic;
  let currentCollection: "Important Dates" | "Important People" | "Key Terms" | undefined;

  function nextSourceRef(parts: readonly string[], itemType: StructuredMasterDataItemType): string {
    const base = `${parts.join(" > ")} > ${itemType}`;
    const nextIndex = (sourceRefCounters.get(base) ?? 0) + 1;
    sourceRefCounters.set(base, nextIndex);
    return buildSourceRef(parts, itemType, nextIndex);
  }

  function pushItem(item: StructuredMasterDataFields) {
    structuredItems.push(item);

    if (item.itemType === "person" && item.person) {
      keyPeople.add(item.person);
    }

    if (item.itemType === "key_term" && item.term) {
      keyTerms.add(item.term);
    }

    if (item.itemType === "date" && item.date) {
      importantDates.add(item.date);
    }

    if (item.subtopic && !isCollectionHeading(item.subtopic)) {
      subtopics.add(item.subtopic);
    }
  }

  for (const block of blocks.slice(2)) {
    const firstLine = block[0];
    if (!firstLine) {
      continue;
    }

    const heading = formatHeading(firstLine);
    const bulletLines = block.filter((line) => isListItemLine(line)).map((line) => stripListMarker(line));
    const hasBullets = bulletLines.length > 0;
    const inlineDefinitions = block
      .slice(1)
      .map((line) => parseDefinitionLine(line))
      .filter((line): line is { definition: string; term: string } => Boolean(line));
    const plainContentLines = block
      .slice(1)
      .filter((line) => !isListItemLine(line) && !parseDefinitionLine(line))
      .map((line) => cleanText(line))
      .filter(Boolean);

    if (!hasBullets && inlineDefinitions.length === 0 && plainContentLines.length === 0) {
      if (isCollectionHeading(heading)) {
        currentCollection = heading;
        currentSection = heading;
        continue;
      }

      currentCollection = undefined;
      currentSection = heading;
      if (currentSection && currentSection !== mainTopic) {
        subtopics.add(currentSection);
      }
      continue;
    }

    if (!hasBullets && inlineDefinitions.length === 0 && plainContentLines.length > 0) {
      currentCollection = undefined;
      if (heading !== mainTopic) {
        subtopics.add(heading);
      }

      for (const content of plainContentLines) {
        pushItem({
          subject: detectedSubject,
          yearGroup: detectedYearGroup,
          topic: mainTopic,
          subtopic: heading,
          itemType: "fact",
          content,
          sourceRef: nextSourceRef([mainTopic, heading], "fact")
        });
      }
      continue;
    }

    if (!hasBullets && inlineDefinitions.length > 0) {
      currentCollection = undefined;
      if (heading !== mainTopic) {
        subtopics.add(heading);
      }

      for (const definitionLine of inlineDefinitions) {
        pushItem({
          subject: detectedSubject,
          yearGroup: detectedYearGroup,
          topic: mainTopic,
          subtopic: heading,
          itemType: "key_term",
          content: definitionLine.definition,
          definition: definitionLine.definition,
          term: definitionLine.term,
          sourceRef: nextSourceRef([mainTopic, heading, definitionLine.term], "key_term")
        });
      }
      continue;
    }

    if (currentCollection === "Important People") {
      const person = heading;
      const content = cleanText(bulletLines.join(" "));
      pushItem({
        subject: detectedSubject,
        yearGroup: detectedYearGroup,
        topic: mainTopic,
        subtopic: "Important People",
        itemType: "person",
        content,
        person,
        sourceRef: nextSourceRef([mainTopic, "Important People", person], "person")
      });
      continue;
    }

    if (currentCollection === "Key Terms") {
      const term = heading;
      const definition = cleanText(bulletLines.join(" "));
      pushItem({
        subject: detectedSubject,
        yearGroup: detectedYearGroup,
        topic: mainTopic,
        subtopic: "Key Terms",
        itemType: "key_term",
        content: definition,
        definition,
        term,
        sourceRef: nextSourceRef([mainTopic, "Key Terms", term], "key_term")
      });
      continue;
    }

    if (currentCollection === "Important Dates") {
      for (const bullet of bulletLines) {
        const parsedDate = parseDateBullet(bullet);
        pushItem({
          subject: detectedSubject,
          yearGroup: detectedYearGroup,
          topic: mainTopic,
          subtopic: "Important Dates",
          itemType: "date",
          content: parsedDate.detail,
          date: parsedDate.date,
          sourceRef: nextSourceRef([mainTopic, "Important Dates", parsedDate.date], "date")
        });
      }
      continue;
    }

    currentCollection = undefined;
    const localHeading = isListItemLine(firstLine) ? undefined : heading;
    const localItemType = itemTypeFromHeading(localHeading);
    const sectionItemType = itemTypeFromHeading(currentSection);
    const itemType = localItemType ?? sectionItemType ?? "fact";
    const subtopic =
      localHeading && localHeading !== currentSection
        ? currentSection === mainTopic
          ? localHeading
          : `${currentSection} > ${localHeading}`
        : currentSection;

    if (subtopic && subtopic !== mainTopic) {
      subtopics.add(subtopic);
    }

    for (const bullet of bulletLines) {
      pushItem({
        subject: detectedSubject,
        yearGroup: detectedYearGroup,
        topic: mainTopic,
        subtopic,
        itemType,
        content: bullet,
        sourceRef: nextSourceRef([mainTopic, subtopic], itemType)
      });
    }
  }

  return {
    items: structuredItems.map((item) => createStructuredUploadItem(item)),
    mode: "structured",
    structuredItems,
    summary: {
      documentTitle: documentTitle || undefined,
      mainTopic: mainTopic || undefined,
      subject: subject ?? fallbackSubject,
      yearGroup: yearGroup ?? fallbackYearGroup,
      subtopics: [...subtopics],
      keyPeople: [...keyPeople],
      keyTerms: [...keyTerms],
      importantDates: [...importantDates]
    }
  };
}

export function parseMasterDataInput(input: {
  fallbackSubject?: string;
  fallbackTopic: string;
  fallbackYearGroup?: string;
  lines: string;
  sourceName: string;
}): ParsedMasterDataInput {
  if (input.lines.includes("||")) {
    return parseLegacyInput(
      input.lines,
      input.fallbackTopic,
      input.fallbackYearGroup,
      input.fallbackSubject
    );
  }

  return parseStructuredInput(
    input.sourceName,
    input.lines,
    input.fallbackTopic,
    input.fallbackYearGroup,
    input.fallbackSubject
  );
}
