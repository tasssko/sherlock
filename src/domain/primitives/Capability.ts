export const capabilityCatalog = {
  createArtifact: {
    id: "artifact.create",
    description: "Create typed artifacts linked to tasks and provenance."
  },
  createChildTask: {
    id: "task.create-child",
    description: "Create child tasks under a parent task."
  },
  generateStudyPlan: {
    id: "study-plan.generate",
    description: "Generate a structured weekly study plan artifact."
  }
} as const;

export type CapabilityId =
  (typeof capabilityCatalog)[keyof typeof capabilityCatalog]["id"];

export interface Capability {
  id: CapabilityId;
  description: string;
}

export const capabilities: readonly Capability[] = Object.values(capabilityCatalog);

