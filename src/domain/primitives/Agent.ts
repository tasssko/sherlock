import type { CapabilityId } from "./Capability.js";
import type { PolicyId } from "./Policy.js";
import type { AgentId } from "./ids.js";
import { createAgentId } from "./ids.js";

export type AgentRole =
  | "curriculum-mapper"
  | "reviewer"
  | "study-planner"
  | "tutor";

export interface Agent {
  id: AgentId;
  role: AgentRole;
  purpose: string;
  capabilities: readonly CapabilityId[];
  policies: readonly PolicyId[];
}

export interface CreateAgentInput {
  role: AgentRole;
  purpose: string;
  capabilities: readonly CapabilityId[];
  policies: readonly PolicyId[];
}

export function createAgent(input: CreateAgentInput): Agent {
  return {
    id: createAgentId(),
    role: input.role,
    purpose: input.purpose,
    capabilities: input.capabilities,
    policies: input.policies
  };
}

export function agentCanUseCapability(agent: Agent, capabilityId: CapabilityId): boolean {
  return agent.capabilities.includes(capabilityId);
}

