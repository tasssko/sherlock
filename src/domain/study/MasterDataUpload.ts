import type {
  PublicMasterDataItemSnapshot,
  MasterDataSourceSnapshot
} from "../learning/MasterData.js";
import type { MasterDataInterpretationCandidate } from "../../modules/masterData/MasterDataInterpretation.js";

export interface UploadMasterDataCommand {
  acceptedInterpretation?: MasterDataInterpretationCandidate;
  contentType?: string;
  learnerYearGroup?: string;
  rawSourceContent?: string;
  sourceName: string;
  items: readonly {
    topic: string;
    prompt: string;
    canonicalAnswer: string;
    visibleMaterial: string;
    keywords?: readonly string[];
    structured?: {
      content: string;
      date?: string;
      definition?: string;
      itemType:
        | "cause"
        | "consequence"
        | "date"
        | "event"
        | "fact"
        | "key_term"
        | "legacy"
        | "person";
      person?: string;
      sourceRef: string;
      subject: string;
      subtopic: string;
      term?: string;
      topic: string;
      yearGroup: string;
    };
  }[];
  userHints?: {
    subject?: string;
    topic?: string;
  };
}

export interface MasterDataUploadResponse {
  source: MasterDataSourceSnapshot;
  items: readonly PublicMasterDataItemSnapshot[];
}
