import { readFileSync } from "node:fs";
import {
  createLoopStudyRelayRuntimeProfileFromUnknown,
  defaultLoopStudyRelayRuntimeProfile,
  type LoopStudyRelayRuntimeProfile,
  withLegacyRelayCompatibilityOverrides,
  withWorkspaceIdOverride
} from "./LoopStudyRelayRuntimeProfile.js";

export interface LoopStudyRuntimeEnvironment {
  LOOP_STUDY_AGENT_RUNTIME?: string;
  LOOP_STUDY_RELAY_API_URL?: string;
  LOOP_STUDY_RELAY_PROFILE?: string;
  LOOP_STUDY_RELAY_TEMPLATE_PATH?: string;
  LOOP_STUDY_RELAY_WORKSPACE_ID?: string;
  RELAY_API_URL?: string;
  RELAY_ASSESSMENT_AGENT_HANDLE?: string;
  RELAY_CONTROLLER_ID?: string;
  RELAY_DEFAULT_AGENT_HANDLE?: string;
  RELAY_PRACTICE_AGENT_HANDLE?: string;
  RELAY_REVIEW_AGENT_HANDLE?: string;
  RELAY_STUDY_PLAN_AGENT_HANDLE?: string;
  RELAY_WORKSPACE_ID?: string;
  SHERLOCK_AGENT_RUNTIME?: string;
}

export interface LoopStudyRuntimeConfig {
  compatibilityWarnings: readonly string[];
  relay?: {
    baseUrl: string;
    profile: LoopStudyRelayRuntimeProfile;
  };
  runtimeMode: "fixture" | "relay";
}

interface LoopStudyRuntimeConfigOptions {
  readTextFile?: (path: string) => string;
}

export function loadLoopStudyRuntimeConfig(
  environment: LoopStudyRuntimeEnvironment,
  options: LoopStudyRuntimeConfigOptions = {}
): LoopStudyRuntimeConfig {
  const compatibilityWarnings: string[] = [];
  const runtimeMode = readRuntimeMode(environment, compatibilityWarnings);

  if (runtimeMode !== "relay") {
    return {
      runtimeMode: "fixture",
      compatibilityWarnings
    };
  }

  const baseUrl = readRelayBaseUrl(environment, compatibilityWarnings);
  if (!baseUrl) {
    throw new Error(
      "Relay runtime requires LOOP_STUDY_RELAY_API_URL to be set."
    );
  }

  const profile = readRelayProfile(environment, options.readTextFile, compatibilityWarnings);

  return {
    runtimeMode: "relay",
    compatibilityWarnings,
    relay: {
      baseUrl,
      profile
    }
  };
}

function readRelayBaseUrl(
  environment: LoopStudyRuntimeEnvironment,
  compatibilityWarnings: string[]
): string | undefined {
  const nextValue = normalizeOptionalValue(environment.LOOP_STUDY_RELAY_API_URL);
  if (nextValue) {
    return nextValue;
  }

  const legacyValue = normalizeOptionalValue(environment.RELAY_API_URL);
  if (legacyValue) {
    compatibilityWarnings.push(
      "RELAY_API_URL is deprecated. Use LOOP_STUDY_RELAY_API_URL."
    );
  }

  return legacyValue;
}

function readRelayProfile(
  environment: LoopStudyRuntimeEnvironment,
  readTextFile: ((path: string) => string) | undefined,
  compatibilityWarnings: string[]
): LoopStudyRelayRuntimeProfile {
  const configuredProfileId =
    normalizeOptionalValue(environment.LOOP_STUDY_RELAY_PROFILE) ?? "default";
  const configuredTemplatePath = normalizeOptionalValue(
    environment.LOOP_STUDY_RELAY_TEMPLATE_PATH
  );

  let profile =
    configuredTemplatePath === undefined
      ? readBuiltinProfile(configuredProfileId)
      : createLoopStudyRelayRuntimeProfileFromUnknown(
          JSON.parse(
            readTextFile
              ? readTextFile(configuredTemplatePath)
              : readFileSync(configuredTemplatePath, "utf8")
          )
        );

  const workspaceIdOverride =
    normalizeOptionalValue(environment.LOOP_STUDY_RELAY_WORKSPACE_ID) ??
    readLegacyWorkspaceId(environment, compatibilityWarnings);
  if (workspaceIdOverride) {
    profile = withWorkspaceIdOverride(profile, workspaceIdOverride);
  }

  const legacyHandleOverrides = {
    defaultAgentHandle: readDeprecatedValue(
      environment.RELAY_DEFAULT_AGENT_HANDLE,
      "RELAY_DEFAULT_AGENT_HANDLE",
      compatibilityWarnings,
      "Use LOOP_STUDY_RELAY_TEMPLATE_PATH or a versioned profile instead."
    ),
    controllerId: readDeprecatedValue(
      environment.RELAY_CONTROLLER_ID,
      "RELAY_CONTROLLER_ID",
      compatibilityWarnings,
      "Use LOOP_STUDY_RELAY_TEMPLATE_PATH or a versioned profile instead."
    ),
    assessmentAgentHandle: readDeprecatedValue(
      environment.RELAY_ASSESSMENT_AGENT_HANDLE,
      "RELAY_ASSESSMENT_AGENT_HANDLE",
      compatibilityWarnings,
      "Use LOOP_STUDY_RELAY_TEMPLATE_PATH or a versioned profile instead."
    ),
    reviewAgentHandle: readDeprecatedValue(
      environment.RELAY_REVIEW_AGENT_HANDLE,
      "RELAY_REVIEW_AGENT_HANDLE",
      compatibilityWarnings,
      "Use LOOP_STUDY_RELAY_TEMPLATE_PATH or a versioned profile instead."
    ),
    practiceAgentHandle: readDeprecatedValue(
      environment.RELAY_PRACTICE_AGENT_HANDLE,
      "RELAY_PRACTICE_AGENT_HANDLE",
      compatibilityWarnings,
      "Use LOOP_STUDY_RELAY_TEMPLATE_PATH or a versioned profile instead."
    ),
    studyPlanAgentHandle: readDeprecatedValue(
      environment.RELAY_STUDY_PLAN_AGENT_HANDLE,
      "RELAY_STUDY_PLAN_AGENT_HANDLE",
      compatibilityWarnings,
      "Use LOOP_STUDY_RELAY_TEMPLATE_PATH or a versioned profile instead."
    )
  };

  if (Object.values(legacyHandleOverrides).some((value) => value !== undefined)) {
    profile = withLegacyRelayCompatibilityOverrides(profile, legacyHandleOverrides);
  }

  return profile;
}

function readBuiltinProfile(profileId: string): LoopStudyRelayRuntimeProfile {
  if (profileId === "default") {
    return defaultLoopStudyRelayRuntimeProfile;
  }

  throw new Error(
    `Unknown loop.study Relay runtime profile ${profileId}.`
  );
}

function readDeprecatedValue(
  value: string | undefined,
  legacyKey: string,
  compatibilityWarnings: string[],
  replacement: string
): string | undefined {
  const normalized = normalizeOptionalValue(value);
  if (!normalized) {
    return undefined;
  }

  compatibilityWarnings.push(`${legacyKey} is deprecated. ${replacement}`);
  return normalized;
}

function readLegacyWorkspaceId(
  environment: LoopStudyRuntimeEnvironment,
  compatibilityWarnings: string[]
): string | undefined {
  return readDeprecatedValue(
    environment.RELAY_WORKSPACE_ID,
    "RELAY_WORKSPACE_ID",
    compatibilityWarnings,
    "Use LOOP_STUDY_RELAY_WORKSPACE_ID."
  );
}

function readRuntimeMode(
  environment: LoopStudyRuntimeEnvironment,
  compatibilityWarnings: string[]
): "fixture" | "relay" {
  const loopStudyValue = normalizeOptionalValue(environment.LOOP_STUDY_AGENT_RUNTIME);
  if (loopStudyValue === "relay") {
    return "relay";
  }

  if (loopStudyValue === "fixture" || loopStudyValue === undefined) {
    const legacyValue = normalizeOptionalValue(environment.SHERLOCK_AGENT_RUNTIME);
    if (legacyValue === "relay") {
      compatibilityWarnings.push(
        "SHERLOCK_AGENT_RUNTIME is deprecated. Use LOOP_STUDY_AGENT_RUNTIME."
      );
      return "relay";
    }

    return "fixture";
  }

  throw new Error(
    `Unsupported LOOP_STUDY_AGENT_RUNTIME value ${loopStudyValue}.`
  );
}

function normalizeOptionalValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
