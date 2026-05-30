import { Agent } from "../../domain/primitives/Agent.js";
import { capabilityCatalog } from "../../domain/primitives/Capability.js";
import type { InitialAssessmentContext } from "../../domain/primitives/Context.js";
import type { DomainEventRecorder } from "../../domain/primitives/Event.js";
import { evaluatePolicies, policies } from "../../domain/primitives/Policy.js";
import { err, ok, type Result } from "../../domain/primitives/result.js";
import type { AssessmentArtifactContent } from "../../domain/study/AssessmentGeneration.js";

export function createInitialAssessmentAgent(): Agent {
  return Agent.create({
    role: "curriculum-mapper",
    purpose: "Generate a short initial diagnostic assessment from approved master data.",
    capabilities: [capabilityCatalog.generateAssessment.id, capabilityCatalog.createArtifact.id],
    policies: policies.map((policy) => policy.id)
  });
}

export function validateAssessmentArtifact(
  agent: Agent,
  context: InitialAssessmentContext,
  artifactContent: AssessmentArtifactContent,
  events: DomainEventRecorder
): Result<void> {
  events.recordAgentInvoked(agent.id, agent.role);

  if (!agent.canUseCapability(capabilityCatalog.generateAssessment.id)) {
    return err({
      code: "POLICY_VIOLATION",
      message: `Agent ${agent.id} cannot use capability ${capabilityCatalog.generateAssessment.id}.`
    });
  }

  return evaluatePolicies(
    agent.policies,
    {
      kind: "assessment",
      context,
      artifactContent
    },
    events
  );
}

export function createAssessmentArtifactContent(input: {
  topic: string;
  questionCount: number;
  items: readonly { id: string; prompt: string; difficulty: "easy" | "medium" | "stretch" }[];
}): AssessmentArtifactContent {
  return {
    topic: input.topic,
    questionCount: input.questionCount,
    instructions: `Complete all ${input.questionCount} questions without notes. The goal is to diagnose current understanding in ${input.topic}.`,
    items: input.items.map((item) => ({ ...item }))
  };
}
