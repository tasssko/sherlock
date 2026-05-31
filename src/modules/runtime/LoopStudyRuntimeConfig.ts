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
  LOOP_STUDY_INTELLIGENCE?: string;
  LOOP_STUDY_OPENAI_API_KEY?: string;
  LOOP_STUDY_OPENAI_BASE_URL?: string;
  LOOP_STUDY_OPENAI_MODEL?: string;
  LOOP_STUDY_RELAY_API_URL?: string;
  LOOP_STUDY_RELAY_PROFILE?: string;
  LOOP_STUDY_RELAY_TEMPLATE_PATH?: string;
  LOOP_STUDY_RELAY_WORKSPACE_ID?: string;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  OPENAI_MODEL?: string;
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
  openai?: {
    apiKey: string;
    baseUrl: string;
    model: string;
  };
  relay?: {
    baseUrl: string;
    profile: LoopStudyRelayRuntimeProfile;
  };
  runtimeMode: "fixture" | "openai" | "relay";
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

  if (runtimeMode === "fixture") {
    return {
      runtimeMode: "fixture",
      compatibilityWarnings
    };
  }

  if (runtimeMode === "openai") {
    return {
      runtimeMode: "openai",
      compatibilityWarnings,
      openai: readOpenAIConfig(environment)
    };
  }

  const baseUrl = readRelayBaseUrl(environment, compatibilityWarnings);
  if (!baseUrl) {
    throw new Error("Experimental Relay mode requires LOOP_STUDY_RELAY_API_URL to be set.");
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

function readOpenAIConfig(environment: LoopStudyRuntimeEnvironment): {
  apiKey: string;
  baseUrl: string;
  model: string;
} {
  const apiKey =
    normalizeOptionalValue(environment.LOOP_STUDY_OPENAI_API_KEY) ??
    normalizeOptionalValue(environment.OPENAI_API_KEY);
  if (!apiKey) {
    throw new Error(
      "OpenAI intelligence requires OPENAI_API_KEY or LOOP_STUDY_OPENAI_API_KEY to be set."
    );
  }

  return {
    apiKey,
    baseUrl:
      normalizeOptionalValue(environment.LOOP_STUDY_OPENAI_BASE_URL) ??
      normalizeOptionalValue(environment.OPENAI_BASE_URL) ??
      "https://api.openai.com/v1",
    model:
      normalizeOptionalValue(environment.LOOP_STUDY_OPENAI_MODEL) ??
      normalizeOptionalValue(environment.OPENAI_MODEL) ??
      "gpt-4.1-mini"
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
    compatibilityWarnings.push("RELAY_API_URL is deprecated. Use LOOP_STUDY_RELAY_API_URL.");
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

  throw new Error(`Unknown experimental loop.study Relay runtime profile ${profileId}.`);
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
): "fixture" | "openai" | "relay" {
  const explicit = normalizeOptionalValue(environment.LOOP_STUDY_INTELLIGENCE);
  if (explicit === "fixture" || explicit === "openai" || explicit === "relay") {
    return explicit;
  }

  if (explicit) {
    throw new Error(`Unsupported LOOP_STUDY_INTELLIGENCE value ${explicit}.`);
  }

  const legacyLoopStudyValue = normalizeOptionalValue(environment.LOOP_STUDY_AGENT_RUNTIME);
  if (legacyLoopStudyValue) {
    compatibilityWarnings.push(
      "LOOP_STUDY_AGENT_RUNTIME is deprecated. Use LOOP_STUDY_INTELLIGENCE."
    );
    if (legacyLoopStudyValue === "fixture" || legacyLoopStudyValue === "relay") {
      return legacyLoopStudyValue;
    }

    throw new Error(`Unsupported LOOP_STUDY_AGENT_RUNTIME value ${legacyLoopStudyValue}.`);
  }

  const legacySherlockValue = normalizeOptionalValue(environment.SHERLOCK_AGENT_RUNTIME);
  if (legacySherlockValue === "relay") {
    compatibilityWarnings.push(
      "SHERLOCK_AGENT_RUNTIME is deprecated. Use LOOP_STUDY_INTELLIGENCE=relay."
    );
    return "relay";
  }

  return "fixture";
}

function normalizeOptionalValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
