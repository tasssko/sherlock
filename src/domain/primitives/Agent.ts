import type { CapabilityId } from "./Capability.js";
import type { PolicyId } from "./Policy.js";
import type { AgentId } from "./ids.js";
import { createAgentId } from "./ids.js";

export type AgentRole =
  | "curriculum-mapper"
  | "reviewer"
  | "study-planner"
  | "tutor";

export interface AgentSnapshot {
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

export class Agent {
  private constructor(private readonly snapshot: AgentSnapshot) {}

  static create(input: CreateAgentInput): Agent {
    return new Agent({
      id: createAgentId(),
      role: input.role,
      purpose: input.purpose,
      capabilities: [...input.capabilities],
      policies: [...input.policies]
    });
  }

  get id(): AgentId {
    return this.snapshot.id;
  }

  get role(): AgentRole {
    return this.snapshot.role;
  }

  get policies(): readonly PolicyId[] {
    return this.snapshot.policies;
  }

  canUseCapability(capabilityId: CapabilityId): boolean {
    return this.snapshot.capabilities.includes(capabilityId);
  }

  toSnapshot(): AgentSnapshot {
    return {
      ...this.snapshot,
      capabilities: [...this.snapshot.capabilities],
      policies: [...this.snapshot.policies]
    };
  }
}
