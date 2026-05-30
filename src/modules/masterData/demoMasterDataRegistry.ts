export interface DemoMasterDataRegistryEntry {
  filePath: string;
  id: string;
  label: string;
  subject: string;
  topic: string;
  yearGroup: string;
}

export const demoMasterDataRegistry: readonly DemoMasterDataRegistryEntry[] = [
  {
    id: "geography-coasts-md",
    label: "Year 7 Geography: Coasts",
    subject: "Geography",
    yearGroup: "Year 7",
    topic: "Coasts",
    filePath: "docs/demo-master-data/@Y7 GEOGRAPHY COASTS – MASTER REVISION DOCUMENT.md"
  },
  {
    id: "history-edward-vi-md",
    label: "Year 7 History: Edward VI",
    subject: "History",
    yearGroup: "Year 7",
    topic: "Edward VI",
    filePath: "docs/demo-master-data/@Y7 HISTORY — EDWARD VI MASTER REVISION DOCUMENT.md"
  },
  {
    id: "history-elizabeth-i-md",
    label: "Year 7 History: Elizabeth I",
    subject: "History",
    yearGroup: "Year 7",
    topic: "Elizabeth I",
    filePath: "docs/demo-master-data/@Y7 HISTORY — ELIZABETH I MASTER REVISION DOCUMENT.md"
  },
  {
    id: "history-mary-i-md",
    label: "Year 7 History: Mary I",
    subject: "History",
    yearGroup: "Year 7",
    topic: "Mary I",
    filePath: "docs/demo-master-data/@Y7 HISTORY — MARY I MASTER REVISION DOCUMENT.md"
  },
  {
    id: "history-mary-i-txt",
    label: "Year 7 History: Mary I (Plain Text)",
    subject: "History",
    yearGroup: "Year 7",
    topic: "Mary I",
    filePath: "docs/demo-master-data/@Y7 HISTORY — MARY I MASTER REVISION DOCUMENT.txt"
  },
  {
    id: "science-biology-md",
    label: "Year 7 Science: Biology",
    subject: "Science",
    yearGroup: "Year 7",
    topic: "Biology",
    filePath: "docs/demo-master-data/@Y7 SCIENCE BIOLOGY – MASTER REVISION DOCUMENT.md"
  },
  {
    id: "science-chemistry-md",
    label: "Year 7 Science: Chemistry",
    subject: "Science",
    yearGroup: "Year 7",
    topic: "Chemistry",
    filePath: "docs/demo-master-data/@Y7 SCIENCE — CHEMISTRY MASTER CONTENT FILE V2.md"
  },
  {
    id: "science-physics-md",
    label: "Year 7 Science: Physics",
    subject: "Science",
    yearGroup: "Year 7",
    topic: "Physics",
    filePath: "docs/demo-master-data/@Y7 SCIENCE — PHYSICS MASTER CONTENT FILE V2.md"
  },
  {
    id: "geography-energy-md",
    label: "Year 7 Geography: Energy",
    subject: "Geography",
    yearGroup: "Year 7",
    topic: "Energy",
    filePath: "docs/demo-master-data/Y7 GEOGRAPHY ENERGY – MASTER REVISION DOCUMENT.md"
  },
  {
    id: "geography-weather-md",
    label: "Year 7 Geography: Weather",
    subject: "Geography",
    yearGroup: "Year 7",
    topic: "Weather",
    filePath: "docs/demo-master-data/Y7 GEOGRAPHY WEATHER – MASTER REVISION DOCUMENT.md"
  },
  {
    id: "latin-md",
    label: "Year 7 Latin",
    subject: "Latin",
    yearGroup: "Year 7",
    topic: "Latin",
    filePath: "docs/demo-master-data/Y7 LATIN – MASTER REVISION DOCUMENT.md"
  },
  {
    id: "tpr-md",
    label: "Year 7 TPR",
    subject: "TPR",
    yearGroup: "Year 7",
    topic: "TPR",
    filePath: "docs/demo-master-data/Y7 TPR – MASTER REVISION DOCUMENT.md"
  }
] as const;

export const demoMasterDataRegistryById = new Map(
  demoMasterDataRegistry.map((entry) => [entry.id, entry])
);
