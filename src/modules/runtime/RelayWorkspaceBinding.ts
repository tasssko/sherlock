import type {
  LoopStudyRelayCapability,
  LoopStudyRelayCapabilityRoute,
  LoopStudyRelayRuntimeProfile,
  RelayWorkspacePolicy
} from "./LoopStudyRelayRuntimeProfile.js";

export interface RelayWorkspaceBindingInput {
  baseUrl: string;
  profile: LoopStudyRelayRuntimeProfile;
}

export class RelayWorkspaceBinding {
  private constructor(private readonly input: RelayWorkspaceBindingInput) {}

  static create(input: RelayWorkspaceBindingInput): RelayWorkspaceBinding {
    return new RelayWorkspaceBinding({
      baseUrl: normalizeRequiredValue(input.baseUrl, "baseUrl"),
      profile: input.profile
    });
  }

  get baseUrl(): string {
    return this.input.baseUrl;
  }

  get controllerId(): string | undefined {
    return this.input.profile.defaultControllerId;
  }

  get defaultAgentHandle(): string {
    return this.input.profile.defaultAgentHandle;
  }

  get defaultPolicy(): RelayWorkspacePolicy {
    return this.input.profile.defaultPolicy;
  }

  get operatingInstructions(): readonly string[] {
    return this.input.profile.operatingInstructions;
  }

  get profileId(): string {
    return this.input.profile.id;
  }

  get workspaceId(): string {
    return this.input.profile.workspace.id;
  }

  get workspaceName(): string {
    return this.input.profile.workspace.name;
  }

  get workspaceSlug(): string {
    return this.input.profile.workspace.slug;
  }

  requiredAgentHandles(): readonly string[] {
    return this.input.profile.requiredAgentHandles;
  }

  requiredControllerIds(): readonly string[] {
    return this.input.profile.requiredControllerIds;
  }

  requiredSkillIds(): readonly string[] {
    return this.input.profile.requiredSkillIds;
  }

  routeFor(capability: LoopStudyRelayCapability): LoopStudyRelayCapabilityRoute {
    return this.input.profile.capabilityRoutes[capability];
  }
}

function normalizeRequiredValue(value: string | undefined, key: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`Relay workspace binding requires ${key}.`);
  }

  return trimmed;
}
