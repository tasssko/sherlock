export type LoopStudyRelayCapability =
  | "evaluateActiveReviewSession"
  | "evaluateAssessmentAttempt"
  | "interpretMasterData"
  | "generateInitialAssessment"
  | "generatePracticeActivity"
  | "generateStudyPlan";

export interface RelayWorkspacePolicy {
  allowAgentToAgentDelegation: boolean;
  allowMessageOnlyResponses: boolean;
  allowSupervisorDelegation: boolean;
  allowTaskCreationFromConversation: boolean;
  requireApprovalForSideEffects: string[];
}

export interface LoopStudyRelayCapabilityRoute {
  agentHandle: string;
  controllerId?: string;
  requiredSkillIds?: string[];
}

export interface LoopStudyRelayRuntimeProfile {
  capabilityRoutes: Record<LoopStudyRelayCapability, LoopStudyRelayCapabilityRoute>;
  defaultAgentHandle: string;
  defaultControllerId?: string;
  defaultPolicy: RelayWorkspacePolicy;
  id: string;
  operatingInstructions: string[];
  requiredAgentHandles: string[];
  requiredControllerIds: string[];
  requiredSkillIds: string[];
  workspace: {
    id: string;
    name: string;
    slug: string;
  };
}

const loopStudyCapabilityNames: readonly LoopStudyRelayCapability[] = [
  "interpretMasterData",
  "generateInitialAssessment",
  "evaluateAssessmentAttempt",
  "evaluateActiveReviewSession",
  "generateStudyPlan",
  "generatePracticeActivity"
] as const;

export const defaultLoopStudyRelayRuntimeProfile: LoopStudyRelayRuntimeProfile =
  createLoopStudyRelayRuntimeProfile({
    id: "default",
    workspace: {
      id: "workspace_study_advisor",
      name: "Study Advisor Workspace",
      slug: "study-advisor-workspace"
    },
    defaultAgentHandle: "tutor",
    capabilityRoutes: {
      interpretMasterData: {
        agentHandle: "tutor"
      },
      generateInitialAssessment: {
        agentHandle: "tutor"
      },
      evaluateAssessmentAttempt: {
        agentHandle: "tutor"
      },
      evaluateActiveReviewSession: {
        agentHandle: "tutor"
      },
      generateStudyPlan: {
        agentHandle: "tutor"
      },
      generatePracticeActivity: {
        agentHandle: "tutor"
      }
    },
    requiredAgentHandles: ["tutor"],
    requiredControllerIds: [],
    requiredSkillIds: [],
    operatingInstructions: [],
    defaultPolicy: {
      requireApprovalForSideEffects: [],
      allowTaskCreationFromConversation: true,
      allowMessageOnlyResponses: true,
      allowSupervisorDelegation: false,
      allowAgentToAgentDelegation: false
    }
  });

export function createLoopStudyRelayRuntimeProfile(
  input: LoopStudyRelayRuntimeProfile
): LoopStudyRelayRuntimeProfile {
  const defaultAgentHandle = normalizeRequiredValue(
    input.defaultAgentHandle,
    "defaultAgentHandle"
  );
  const defaultControllerId = normalizeOptionalValue(input.defaultControllerId);
  const capabilityRoutes = createCapabilityRoutes(
    input.capabilityRoutes,
    defaultAgentHandle
  );

  return {
    id: normalizeRequiredValue(input.id, "id"),
    workspace: {
      id: normalizeRequiredValue(input.workspace.id, "workspace.id"),
      name: normalizeRequiredValue(input.workspace.name, "workspace.name"),
      slug: normalizeRequiredValue(input.workspace.slug, "workspace.slug")
    },
    defaultAgentHandle,
    defaultControllerId,
    capabilityRoutes,
    requiredAgentHandles: uniqueStrings([
      defaultAgentHandle,
      ...input.requiredAgentHandles,
      ...Object.values(capabilityRoutes).map((route) => route.agentHandle)
    ]),
    requiredControllerIds: uniqueStrings([
      ...input.requiredControllerIds,
      defaultControllerId,
      ...Object.values(capabilityRoutes).map((route) => route.controllerId)
    ]),
    requiredSkillIds: uniqueStrings([
      ...input.requiredSkillIds,
      ...Object.values(capabilityRoutes).flatMap((route) => route.requiredSkillIds)
    ]),
    operatingInstructions: input.operatingInstructions.map((instruction) =>
      normalizeRequiredValue(instruction, "operatingInstructions")
    ),
    defaultPolicy: {
      requireApprovalForSideEffects: [...input.defaultPolicy.requireApprovalForSideEffects],
      allowTaskCreationFromConversation: input.defaultPolicy.allowTaskCreationFromConversation,
      allowMessageOnlyResponses: input.defaultPolicy.allowMessageOnlyResponses,
      allowSupervisorDelegation: input.defaultPolicy.allowSupervisorDelegation,
      allowAgentToAgentDelegation: input.defaultPolicy.allowAgentToAgentDelegation
    }
  };
}

export function createLoopStudyRelayRuntimeProfileFromUnknown(
  value: unknown
): LoopStudyRelayRuntimeProfile {
  if (!value || typeof value !== "object") {
    throw new Error("Loop study Relay runtime profile must be an object.");
  }

  const profile = value as Partial<LoopStudyRelayRuntimeProfile>;

  if (!profile.workspace || typeof profile.workspace !== "object") {
    throw new Error("Loop study Relay runtime profile must define workspace.");
  }

  if (!profile.capabilityRoutes || typeof profile.capabilityRoutes !== "object") {
    throw new Error("Loop study Relay runtime profile must define capabilityRoutes.");
  }

  if (!profile.defaultPolicy || typeof profile.defaultPolicy !== "object") {
    throw new Error("Loop study Relay runtime profile must define defaultPolicy.");
  }

  return createLoopStudyRelayRuntimeProfile({
    id: String(profile.id ?? "custom"),
    workspace: {
      id: String((profile.workspace as { id?: unknown }).id ?? ""),
      name: String((profile.workspace as { name?: unknown }).name ?? ""),
      slug: String((profile.workspace as { slug?: unknown }).slug ?? "")
    },
    defaultAgentHandle: String(profile.defaultAgentHandle ?? ""),
    defaultControllerId:
      typeof profile.defaultControllerId === "string"
        ? profile.defaultControllerId
        : undefined,
    capabilityRoutes: profile.capabilityRoutes as Record<
      LoopStudyRelayCapability,
      LoopStudyRelayCapabilityRoute
    >,
    requiredAgentHandles: Array.isArray(profile.requiredAgentHandles)
      ? profile.requiredAgentHandles.map(String)
      : [],
    requiredControllerIds: Array.isArray(profile.requiredControllerIds)
      ? profile.requiredControllerIds.map(String)
      : [],
    requiredSkillIds: Array.isArray(profile.requiredSkillIds)
      ? profile.requiredSkillIds.map(String)
      : [],
    operatingInstructions: Array.isArray(profile.operatingInstructions)
      ? profile.operatingInstructions.map(String)
      : [],
    defaultPolicy: {
      allowAgentToAgentDelegation: Boolean(
        profile.defaultPolicy.allowAgentToAgentDelegation
      ),
      allowMessageOnlyResponses: Boolean(
        profile.defaultPolicy.allowMessageOnlyResponses
      ),
      allowSupervisorDelegation: Boolean(
        profile.defaultPolicy.allowSupervisorDelegation
      ),
      allowTaskCreationFromConversation: Boolean(
        profile.defaultPolicy.allowTaskCreationFromConversation
      ),
      requireApprovalForSideEffects: Array.isArray(
        profile.defaultPolicy.requireApprovalForSideEffects
      )
        ? profile.defaultPolicy.requireApprovalForSideEffects.map(String)
        : []
    }
  });
}

export function withWorkspaceIdOverride(
  profile: LoopStudyRelayRuntimeProfile,
  workspaceId: string
): LoopStudyRelayRuntimeProfile {
  const normalizedWorkspaceId = normalizeRequiredValue(
    workspaceId,
    "workspace.id override"
  );

  return createLoopStudyRelayRuntimeProfile({
    ...profile,
    workspace: {
      ...profile.workspace,
      id: normalizedWorkspaceId
    }
  });
}

export function withLegacyRelayCompatibilityOverrides(
  profile: LoopStudyRelayRuntimeProfile,
  overrides: {
    assessmentAgentHandle?: string;
    controllerId?: string;
    defaultAgentHandle?: string;
    practiceAgentHandle?: string;
    reviewAgentHandle?: string;
    studyPlanAgentHandle?: string;
  }
): LoopStudyRelayRuntimeProfile {
  const nextDefaultAgentHandle =
    normalizeOptionalValue(overrides.defaultAgentHandle) ?? profile.defaultAgentHandle;
  const nextDefaultControllerId =
    normalizeOptionalValue(overrides.controllerId) ?? profile.defaultControllerId;

  return createLoopStudyRelayRuntimeProfile({
    ...profile,
    defaultAgentHandle: nextDefaultAgentHandle,
    defaultControllerId: nextDefaultControllerId,
    capabilityRoutes: {
      ...profile.capabilityRoutes,
      interpretMasterData: {
        ...profile.capabilityRoutes.interpretMasterData,
        agentHandle:
          normalizeOptionalValue(overrides.assessmentAgentHandle) ??
          (profile.capabilityRoutes.interpretMasterData.agentHandle ===
          profile.defaultAgentHandle
            ? nextDefaultAgentHandle
            : profile.capabilityRoutes.interpretMasterData.agentHandle)
      },
      generateInitialAssessment: {
        ...profile.capabilityRoutes.generateInitialAssessment,
        agentHandle:
          normalizeOptionalValue(overrides.assessmentAgentHandle) ??
          (profile.capabilityRoutes.generateInitialAssessment.agentHandle ===
          profile.defaultAgentHandle
            ? nextDefaultAgentHandle
            : profile.capabilityRoutes.generateInitialAssessment.agentHandle)
      },
      evaluateAssessmentAttempt: {
        ...profile.capabilityRoutes.evaluateAssessmentAttempt,
        agentHandle:
          normalizeOptionalValue(overrides.reviewAgentHandle) ??
          (profile.capabilityRoutes.evaluateAssessmentAttempt.agentHandle ===
          profile.defaultAgentHandle
            ? nextDefaultAgentHandle
            : profile.capabilityRoutes.evaluateAssessmentAttempt.agentHandle)
      },
      evaluateActiveReviewSession: {
        ...profile.capabilityRoutes.evaluateActiveReviewSession,
        agentHandle:
          normalizeOptionalValue(overrides.reviewAgentHandle) ??
          (profile.capabilityRoutes.evaluateActiveReviewSession.agentHandle ===
          profile.defaultAgentHandle
            ? nextDefaultAgentHandle
            : profile.capabilityRoutes.evaluateActiveReviewSession.agentHandle)
      },
      generateStudyPlan: {
        ...profile.capabilityRoutes.generateStudyPlan,
        agentHandle:
          normalizeOptionalValue(overrides.studyPlanAgentHandle) ??
          (profile.capabilityRoutes.generateStudyPlan.agentHandle ===
          profile.defaultAgentHandle
            ? nextDefaultAgentHandle
            : profile.capabilityRoutes.generateStudyPlan.agentHandle)
      },
      generatePracticeActivity: {
        ...profile.capabilityRoutes.generatePracticeActivity,
        agentHandle:
          normalizeOptionalValue(overrides.practiceAgentHandle) ??
          (profile.capabilityRoutes.generatePracticeActivity.agentHandle ===
          profile.defaultAgentHandle
            ? nextDefaultAgentHandle
            : profile.capabilityRoutes.generatePracticeActivity.agentHandle)
      }
    }
  });
}

function createCapabilityRoutes(
  input: Record<LoopStudyRelayCapability, LoopStudyRelayCapabilityRoute>,
  defaultAgentHandle: string
): Record<LoopStudyRelayCapability, LoopStudyRelayCapabilityRoute> {
  const routes = {} as Record<LoopStudyRelayCapability, LoopStudyRelayCapabilityRoute>;

  for (const capability of loopStudyCapabilityNames) {
    const route = input[capability];
    if (!route) {
      throw new Error(
        `Loop study Relay runtime profile must define capability route ${capability}.`
      );
    }

    routes[capability] = {
      agentHandle:
        normalizeOptionalValue(route.agentHandle) ?? defaultAgentHandle,
      controllerId: normalizeOptionalValue(route.controllerId),
      requiredSkillIds: uniqueStrings(route.requiredSkillIds ?? [])
    };
  }

  return routes;
}

function uniqueStrings(values: readonly (string | undefined)[]): string[] {
  return values
    .map((value) => normalizeOptionalValue(value))
    .filter(
      (value, index, normalized): value is string =>
        value !== undefined && normalized.indexOf(value) === index
    );
}

function normalizeOptionalValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeRequiredValue(value: string | undefined, key: string): string {
  const trimmed = normalizeOptionalValue(value);
  if (!trimmed) {
    throw new Error(`Loop study Relay runtime profile requires ${key}.`);
  }

  return trimmed;
}
