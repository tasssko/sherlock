export const capabilityCatalog = {
  createArtifact: {
    id: "artifact.create",
    description: "Create typed artifacts linked to tasks and provenance."
  },
  evaluateAttempt: {
    id: "attempt.evaluate",
    description: "Evaluate submitted assessment answers and identify knowledge gaps."
  },
  generatePracticeActivity: {
    id: "practice-activity.generate",
    description: "Generate a targeted practice activity from diagnosed gaps and master data."
  },
  createChildTask: {
    id: "task.create-child",
    description: "Create child tasks under a parent task."
  },
  generateAssessment: {
    id: "assessment.generate",
    description: "Generate an initial diagnostic assessment from master data."
  },
  generateStudyPlan: {
    id: "study-plan.generate",
    description: "Generate a structured weekly study plan artifact."
  },
  uploadMasterData: {
    id: "master-data.upload",
    description: "Register uploaded master data for learning-loop assessment generation."
  }
} as const;

export type CapabilityId =
  (typeof capabilityCatalog)[keyof typeof capabilityCatalog]["id"];

export interface Capability {
  id: CapabilityId;
  description: string;
}

export const capabilities: readonly Capability[] = Object.values(capabilityCatalog);
