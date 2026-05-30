import type { RelayWorkspacePolicy } from "./LoopStudyRelayRuntimeProfile.js";
import { RelayWorkspaceBinding } from "./RelayWorkspaceBinding.js";

export interface RelayWorkspaceRecord {
  context: {
    availableAgentHandles: string[];
    defaultSupervisorAgentHandle: string;
    operatingInstructions?: string[];
  };
  createdAt: string;
  defaultControllerId?: string;
  defaultPolicy: RelayWorkspacePolicy;
  id: string;
  name: string;
  slug: string;
  status: string;
  updatedAt: string;
}

export interface RelayWorkspaceStatusRecord {
  agentHandles?: string[];
  controllerIds?: string[];
  defaultControllerId?: string;
  persistenceMode?: string;
  skillIds?: string[];
  toolIds?: string[];
  workspace: RelayWorkspaceRecord;
}

export class RelayWorkspaceTemplate {
  constructor(
    private readonly binding: RelayWorkspaceBinding,
    private readonly now: () => Date = () => new Date()
  ) {}

  buildWorkspace(existing?: RelayWorkspaceRecord): RelayWorkspaceRecord {
    const timestamp = this.now().toISOString();

    return {
      id: this.binding.workspaceId,
      name: this.binding.workspaceName,
      slug: this.binding.workspaceSlug,
      status: existing?.status ?? "active",
      defaultControllerId: this.binding.controllerId,
      context: {
        operatingInstructions: [...this.binding.operatingInstructions],
        defaultSupervisorAgentHandle: this.binding.defaultAgentHandle,
        availableAgentHandles: [...this.binding.requiredAgentHandles()]
      },
      defaultPolicy: {
        ...this.binding.defaultPolicy,
        requireApprovalForSideEffects: [
          ...this.binding.defaultPolicy.requireApprovalForSideEffects
        ]
      },
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp
    };
  }

  needsWorkspaceUpdate(workspace: RelayWorkspaceRecord): boolean {
    const desired = this.buildWorkspace(workspace);

    return (
      workspace.name !== desired.name ||
      workspace.slug !== desired.slug ||
      workspace.defaultControllerId !== desired.defaultControllerId ||
      workspace.context.defaultSupervisorAgentHandle !== desired.context.defaultSupervisorAgentHandle ||
      !sameValues(
        workspace.context.operatingInstructions ?? [],
        desired.context.operatingInstructions ?? []
      ) ||
      !sameValues(workspace.context.availableAgentHandles, desired.context.availableAgentHandles) ||
      JSON.stringify(workspace.defaultPolicy) !== JSON.stringify(desired.defaultPolicy)
    );
  }

  validateStatus(status: RelayWorkspaceStatusRecord): string | null {
    const knownAgentHandles = new Set(
      (status.agentHandles ?? []).map((handle) => handle.replace(/^@/, ""))
    );
    const missingAgentHandles = this.binding
      .requiredAgentHandles()
      .filter((handle) => !knownAgentHandles.has(handle));

    if (missingAgentHandles.length > 0) {
      return `Relay workspace ${this.binding.workspaceId} is missing required agent handles: ${missingAgentHandles.join(", ")}.`;
    }

    const knownControllerIds = new Set(status.controllerIds ?? []);
    const missingControllerIds = this.binding
      .requiredControllerIds()
      .filter((controllerId) => !knownControllerIds.has(controllerId));
    if (missingControllerIds.length > 0) {
      return `Relay workspace ${this.binding.workspaceId} is missing required controllers: ${missingControllerIds.join(", ")}.`;
    }

    const knownSkillIds = new Set(status.skillIds ?? []);
    const missingSkillIds = this.binding
      .requiredSkillIds()
      .filter((skillId) => !knownSkillIds.has(skillId));
    if (missingSkillIds.length > 0) {
      return `Relay workspace ${this.binding.workspaceId} is missing required skills: ${missingSkillIds.join(", ")}.`;
    }

    return null;
  }
}

function sameValues(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const normalizedLeft = [...left].sort();
  const normalizedRight = [...right].sort();

  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}
