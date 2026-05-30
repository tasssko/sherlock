import type {
  PublicMasterDataItemSnapshot,
  MasterDataSourceSnapshot
} from "../learning/MasterData.js";

export interface UploadMasterDataCommand {
  sourceName: string;
  items: readonly {
    topic: string;
    prompt: string;
    canonicalAnswer: string;
    visibleMaterial: string;
    keywords?: readonly string[];
  }[];
}

export interface MasterDataUploadResponse {
  source: MasterDataSourceSnapshot;
  items: readonly PublicMasterDataItemSnapshot[];
}
