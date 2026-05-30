export type PolicyId =
  | "age-appropriate-content"
  | "curriculum-alignment"
  | "no-direct-answer";

export interface Policy {
  id: PolicyId;
  description: string;
}

export const policies: readonly Policy[] = [
  {
    id: "age-appropriate-content",
    description: "Outputs must be appropriate for the learner year group."
  },
  {
    id: "curriculum-alignment",
    description: "Plans should stay aligned to the stated learning objective."
  },
  {
    id: "no-direct-answer",
    description: "The system should plan learning work rather than give away answers."
  }
];

