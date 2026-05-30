import type { MasterDataItemId, MasterDataSourceId } from "../primitives/ids.js";
import { createMasterDataItemId, createMasterDataSourceId } from "../primitives/ids.js";
import type { StructuredMasterDataFields } from "../../modules/masterData/structuredRevision.js";
import { decodeStructuredMetadataKeywords } from "../../modules/masterData/structuredRevision.js";
import type {
  MasterDataInterpretationCandidate
} from "../../modules/masterData/MasterDataInterpretation.js";

export interface PublicMasterDataItemSnapshot {
  id: MasterDataItemId;
  sourceId: MasterDataSourceId;
  topic: string;
  prompt: string;
  canonicalAnswer: string;
  visibleMaterial: string;
  keywords: readonly string[];
}

export interface RuntimeMasterDataItemPayload extends PublicMasterDataItemSnapshot {
  content?: string;
  date?: string;
  definition?: string;
  itemType?: StructuredMasterDataFields["itemType"];
  person?: string;
  sourceRef?: string;
  subject?: string;
  subtopic?: string;
  term?: string;
  yearGroup?: string;
}

export interface MasterDataItemSnapshot extends PublicMasterDataItemSnapshot {
  structured?: StructuredMasterDataFields;
}

export interface CreateMasterDataItemInput {
  topic: string;
  prompt: string;
  canonicalAnswer: string;
  visibleMaterial: string;
  keywords?: readonly string[];
  structured?: StructuredMasterDataFields;
}

export class MasterDataItem {
  private constructor(private readonly snapshot: MasterDataItemSnapshot) {}

  static create(sourceId: MasterDataSourceId, input: CreateMasterDataItemInput): MasterDataItem {
    const decoded = input.structured
      ? {
          keywords: [...(input.keywords ?? [])],
          structured: input.structured
        }
      : decodeStructuredMetadataKeywords(input.keywords);

    return new MasterDataItem({
      id: createMasterDataItemId(),
      sourceId,
      topic: input.topic,
      prompt: input.prompt,
      canonicalAnswer: input.canonicalAnswer,
      visibleMaterial: input.visibleMaterial,
      keywords: [...decoded.keywords],
      structured: decoded.structured
    });
  }

  static rehydrate(snapshot: MasterDataItemSnapshot): MasterDataItem {
    return new MasterDataItem({
      ...snapshot,
      keywords: [...snapshot.keywords],
      structured: snapshot.structured ? { ...snapshot.structured } : undefined
    });
  }

  get id(): MasterDataItemId {
    return this.snapshot.id;
  }

  get topic(): string {
    return this.snapshot.topic;
  }

  get prompt(): string {
    return this.snapshot.prompt;
  }

  get canonicalAnswer(): string {
    return this.snapshot.canonicalAnswer;
  }

  get visibleMaterial(): string {
    return this.snapshot.visibleMaterial;
  }

  get keywords(): readonly string[] {
    return this.snapshot.keywords;
  }

  get structured(): StructuredMasterDataFields | undefined {
    return this.snapshot.structured;
  }

  get itemType(): StructuredMasterDataFields["itemType"] | undefined {
    return this.snapshot.structured?.itemType;
  }

  get subject(): string | undefined {
    return this.snapshot.structured?.subject;
  }

  get yearGroup(): string | undefined {
    return this.snapshot.structured?.yearGroup;
  }

  get subtopic(): string | undefined {
    return this.snapshot.structured?.subtopic;
  }

  get content(): string | undefined {
    return this.snapshot.structured?.content;
  }

  get sourceRef(): string | undefined {
    return this.snapshot.structured?.sourceRef;
  }

  get term(): string | undefined {
    return this.snapshot.structured?.term;
  }

  get definition(): string | undefined {
    return this.snapshot.structured?.definition;
  }

  get date(): string | undefined {
    return this.snapshot.structured?.date;
  }

  get person(): string | undefined {
    return this.snapshot.structured?.person;
  }

  toPublicSnapshot(): PublicMasterDataItemSnapshot {
    return {
      id: this.snapshot.id,
      sourceId: this.snapshot.sourceId,
      topic: this.snapshot.topic,
      prompt: this.snapshot.prompt,
      canonicalAnswer: this.snapshot.canonicalAnswer,
      visibleMaterial: this.snapshot.visibleMaterial,
      keywords: [...this.snapshot.keywords]
    };
  }

  toRuntimePayload(): RuntimeMasterDataItemPayload {
    return {
      ...this.toPublicSnapshot(),
      itemType: this.snapshot.structured?.itemType,
      subject: this.snapshot.structured?.subject,
      yearGroup: this.snapshot.structured?.yearGroup,
      subtopic: this.snapshot.structured?.subtopic,
      content: this.snapshot.structured?.content,
      sourceRef: this.snapshot.structured?.sourceRef,
      term: this.snapshot.structured?.term,
      definition: this.snapshot.structured?.definition,
      date: this.snapshot.structured?.date,
      person: this.snapshot.structured?.person
    };
  }

  toSnapshot(): MasterDataItemSnapshot {
    return {
      ...this.snapshot,
      keywords: [...this.snapshot.keywords],
      structured: this.snapshot.structured ? { ...this.snapshot.structured } : undefined
    };
  }
}

export interface MasterDataSourceSnapshot {
  id: MasterDataSourceId;
  name: string;
  uploadedAt: string;
  itemIds: readonly MasterDataItemId[];
}

export interface MasterDataSourceInputHint {
  subject?: string;
  topic?: string;
}

export interface MasterDataSourceInternalSnapshot extends MasterDataSourceSnapshot {
  acceptedInterpretation?: MasterDataInterpretationCandidate;
  contentType?: string;
  learnerYearGroup?: string;
  rawSourceContent?: string;
  userHints?: MasterDataSourceInputHint;
}

export class MasterDataSource {
  private constructor(private readonly snapshot: MasterDataSourceInternalSnapshot) {}

  static create(
    name: string,
    itemIds: readonly MasterDataItemId[],
    details: {
      acceptedInterpretation?: MasterDataInterpretationCandidate;
      contentType?: string;
      learnerYearGroup?: string;
      rawSourceContent?: string;
      userHints?: MasterDataSourceInputHint;
    } = {}
  ): MasterDataSource {
    return new MasterDataSource({
      id: createMasterDataSourceId(),
      name,
      uploadedAt: new Date().toISOString(),
      itemIds: [...itemIds],
      rawSourceContent: details.rawSourceContent,
      contentType: details.contentType,
      learnerYearGroup: details.learnerYearGroup,
      userHints: details.userHints ? { ...details.userHints } : undefined,
      acceptedInterpretation: details.acceptedInterpretation
    });
  }

  static rehydrate(snapshot: MasterDataSourceInternalSnapshot): MasterDataSource {
    return new MasterDataSource({
      ...snapshot,
      itemIds: [...snapshot.itemIds],
      userHints: snapshot.userHints ? { ...snapshot.userHints } : undefined,
      acceptedInterpretation: snapshot.acceptedInterpretation
        ? {
            ...snapshot.acceptedInterpretation,
            subtopics: [...snapshot.acceptedInterpretation.subtopics],
            keyPeople: [...snapshot.acceptedInterpretation.keyPeople],
            keyTerms: [...snapshot.acceptedInterpretation.keyTerms],
            importantDates: [...snapshot.acceptedInterpretation.importantDates],
            processes: [...snapshot.acceptedInterpretation.processes],
            learningObjectives: snapshot.acceptedInterpretation.learningObjectives.map(
              (objective) => ({
                ...objective,
                sourceRefs: [...objective.sourceRefs]
              })
            ),
            sourceMap: snapshot.acceptedInterpretation.sourceMap.map((entry) => ({
              ...entry
            })),
            items: snapshot.acceptedInterpretation.items.map((item) => ({ ...item }))
          }
        : undefined
    });
  }

  get id(): MasterDataSourceId {
    return this.snapshot.id;
  }

  get name(): string {
    return this.snapshot.name;
  }

  get itemIds(): readonly MasterDataItemId[] {
    return this.snapshot.itemIds;
  }

  get rawSourceContent(): string | undefined {
    return this.snapshot.rawSourceContent;
  }

  get contentType(): string | undefined {
    return this.snapshot.contentType;
  }

  get learnerYearGroup(): string | undefined {
    return this.snapshot.learnerYearGroup;
  }

  get userHints(): MasterDataSourceInputHint | undefined {
    return this.snapshot.userHints;
  }

  get acceptedInterpretation(): MasterDataInterpretationCandidate | undefined {
    return this.snapshot.acceptedInterpretation;
  }

  toSnapshot(): MasterDataSourceSnapshot {
    return {
      id: this.snapshot.id,
      name: this.snapshot.name,
      uploadedAt: this.snapshot.uploadedAt,
      itemIds: [...this.snapshot.itemIds]
    };
  }

  toStorageSnapshot(): MasterDataSourceInternalSnapshot {
    return {
      ...this.toSnapshot(),
      rawSourceContent: this.snapshot.rawSourceContent,
      contentType: this.snapshot.contentType,
      learnerYearGroup: this.snapshot.learnerYearGroup,
      userHints: this.snapshot.userHints ? { ...this.snapshot.userHints } : undefined,
      acceptedInterpretation: this.snapshot.acceptedInterpretation
        ? {
            ...this.snapshot.acceptedInterpretation,
            subtopics: [...this.snapshot.acceptedInterpretation.subtopics],
            keyPeople: [...this.snapshot.acceptedInterpretation.keyPeople],
            keyTerms: [...this.snapshot.acceptedInterpretation.keyTerms],
            importantDates: [...this.snapshot.acceptedInterpretation.importantDates],
            processes: [...this.snapshot.acceptedInterpretation.processes],
            learningObjectives: this.snapshot.acceptedInterpretation.learningObjectives.map(
              (objective) => ({
                ...objective,
                sourceRefs: [...objective.sourceRefs]
              })
            ),
            sourceMap: this.snapshot.acceptedInterpretation.sourceMap.map((entry) => ({
              ...entry
            })),
            items: this.snapshot.acceptedInterpretation.items.map((item) => ({ ...item }))
          }
        : undefined
    };
  }
}
