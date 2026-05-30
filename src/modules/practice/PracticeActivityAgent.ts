import type { FlashcardSet } from "../../domain/learning/PracticeActivity.js";
import { Agent } from "../../domain/primitives/Agent.js";
import { capabilityCatalog } from "../../domain/primitives/Capability.js";
import type { PracticeActivityContext } from "../../domain/primitives/Context.js";
import type { DomainEventRecorder } from "../../domain/primitives/Event.js";
import { evaluatePolicies, policies } from "../../domain/primitives/Policy.js";
import { err, type Result } from "../../domain/primitives/result.js";

export function createPracticeActivityAgent(): Agent {
  return Agent.create({
    role: "tutor",
    purpose: "Generate focused practice activities from diagnosed gaps and approved study material.",
    capabilities: [capabilityCatalog.generatePracticeActivity.id],
    policies: policies.map((policy) => policy.id)
  });
}

export function validatePracticeActivity(
  agent: Agent,
  context: PracticeActivityContext,
  flashcardSet: FlashcardSet,
  events: DomainEventRecorder
): Result<void> {
  events.recordAgentInvoked(agent.id, agent.role);

  if (!agent.canUseCapability(capabilityCatalog.generatePracticeActivity.id)) {
    return err({
      code: "POLICY_VIOLATION",
      message: `Agent ${agent.id} cannot use capability ${capabilityCatalog.generatePracticeActivity.id}.`
    });
  }

  return evaluatePolicies(
    agent.policies,
    {
      kind: "practice-activity",
      context,
      artifactContent: flashcardSet
    },
    events
  );
}
