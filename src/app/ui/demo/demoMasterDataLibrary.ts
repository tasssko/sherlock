import {
  demoMasterDataRegistry,
  demoMasterDataRegistryById,
  type DemoMasterDataRegistryEntry
} from "../../../modules/masterData/demoMasterDataRegistry.js";

export interface DemoMasterDataDocument extends DemoMasterDataRegistryEntry {
  content: string;
  sourceName: string;
}

const demoFileContents = import.meta.glob("/docs/demo-master-data/*.{md,txt}", {
  eager: true,
  import: "default",
  query: "?raw"
}) as Record<string, string>;

export const demoMasterDataLibrary: readonly DemoMasterDataDocument[] = demoMasterDataRegistry.map(
  (entry) => {
    const content = demoFileContents[`/${entry.filePath}`];
    if (!content) {
      throw new Error(`Missing demo master-data file for ${entry.id}: ${entry.filePath}`);
    }

    return {
      ...entry,
      content,
      sourceName: entry.label
    };
  }
);

export function findDemoMasterDataDocument(
  id: string
): DemoMasterDataDocument | undefined {
  const registryEntry = demoMasterDataRegistryById.get(id);
  if (!registryEntry) {
    return undefined;
  }

  return demoMasterDataLibrary.find((entry) => entry.id === registryEntry.id);
}
