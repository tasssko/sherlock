import type { MasterDataItemId, MasterDataSourceId } from "../primitives/ids.js";
import { createMasterDataItemId, createMasterDataSourceId } from "../primitives/ids.js";

export interface MasterDataItemSnapshot {
  id: MasterDataItemId;
  sourceId: MasterDataSourceId;
  topic: string;
  prompt: string;
  canonicalAnswer: string;
  visibleMaterial: string;
  keywords: readonly string[];
}

export interface CreateMasterDataItemInput {
  topic: string;
  prompt: string;
  canonicalAnswer: string;
  visibleMaterial: string;
  keywords?: readonly string[];
}

export class MasterDataItem {
  private constructor(private readonly snapshot: MasterDataItemSnapshot) {}

  static create(sourceId: MasterDataSourceId, input: CreateMasterDataItemInput): MasterDataItem {
    return new MasterDataItem({
      id: createMasterDataItemId(),
      sourceId,
      topic: input.topic,
      prompt: input.prompt,
      canonicalAnswer: input.canonicalAnswer,
      visibleMaterial: input.visibleMaterial,
      keywords: [...(input.keywords ?? [])]
    });
  }

  static rehydrate(snapshot: MasterDataItemSnapshot): MasterDataItem {
    return new MasterDataItem({
      ...snapshot,
      keywords: [...snapshot.keywords]
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

  toSnapshot(): MasterDataItemSnapshot {
    return {
      ...this.snapshot,
      keywords: [...this.snapshot.keywords]
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
