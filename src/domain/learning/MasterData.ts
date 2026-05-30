import type { MasterDataItemId, MasterDataSourceId } from "../primitives/ids.js";
import { createMasterDataItemId, createMasterDataSourceId } from "../primitives/ids.js";
import type { StructuredMasterDataFields } from "../../modules/masterData/structuredRevision.js";
import { decodeStructuredMetadataKeywords } from "../../modules/masterData/structuredRevision.js";

export interface PublicMasterDataItemSnapshot {
  id: MasterDataItemId;
  sourceId: MasterDataSourceId;
  topic: string;
  prompt: string;
  canonicalAnswer: string;
  visibleMaterial: string;
  keywords: readonly string[];
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

  toRuntimePayload(): PublicMasterDataItemSnapshot {
    return this.toPublicSnapshot();
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

export class MasterDataSource {
  private constructor(private readonly snapshot: MasterDataSourceSnapshot) {}

  static create(name: string, itemIds: readonly MasterDataItemId[]): MasterDataSource {
    return new MasterDataSource({
      id: createMasterDataSourceId(),
      name,
      uploadedAt: new Date().toISOString(),
      itemIds: [...itemIds]
    });
  }

  static rehydrate(snapshot: MasterDataSourceSnapshot): MasterDataSource {
    return new MasterDataSource({
      ...snapshot,
      itemIds: [...snapshot.itemIds]
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

  toSnapshot(): MasterDataSourceSnapshot {
    return {
      ...this.snapshot,
      itemIds: [...this.snapshot.itemIds]
    };
  }
}
