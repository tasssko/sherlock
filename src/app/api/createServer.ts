import Fastify from "fastify";
import { AssessmentAttemptController } from "../../modules/assessment/AssessmentAttemptController.js";
import { InitialAssessmentController } from "../../modules/assessment/InitialAssessmentController.js";
import { MasterDataUploadController } from "../../modules/assessment/MasterDataUploadController.js";
import { LearningLoopController } from "../../modules/learning/LearningLoopController.js";
import { StudyPlanController } from "../../modules/planning/StudyPlanController.js";
import { SqliteLearningLoopRepository } from "../../modules/planning/SqliteLearningLoopRepository.js";
import { PracticeActivityController } from "../../modules/practice/PracticeActivityController.js";
import { loadLoopStudyRuntimeConfig } from "../../modules/runtime/LoopStudyRuntimeConfig.js";
import type { AgentRuntime } from "../../modules/runtime/AgentRuntime.js";
import { FixtureAgentRuntime } from "../../modules/runtime/FixtureAgentRuntime.js";
import { RelayAgentRuntime } from "../../modules/runtime/RelayAgentRuntime.js";
import { RelayWorkspaceBinding } from "../../modules/runtime/RelayWorkspaceBinding.js";
import { RelayWorkspaceProvisioner } from "../../modules/runtime/RelayWorkspaceProvisioner.js";
import { registerAssessmentRoutes } from "./routes/assessments.js";
import { registerLearningLoopRoutes } from "./routes/learningLoops.js";
import { registerMasterDataRoutes } from "./routes/masterData.js";
import { registerPracticeActivityRoutes } from "./routes/practiceActivities.js";
import { registerStudyPlanRoutes } from "./routes/studyPlans.js";

type RuntimeMode = "fixture" | "relay";

interface RuntimeBootstrap {
  agentRuntime: AgentRuntime;
  compatibilityWarnings: readonly string[];
  controllerId?: string;
  defaultAgentHandle?: string;
  relayWorkspaceId?: string;
  runtimeMode: RuntimeMode;
  runtimeName: "FixtureAgentRuntime" | "RelayAgentRuntime";
}

export interface RuntimeBootLogger {
  info(bindings: Record<string, unknown>, message: string): void;
  warn?(bindings: Record<string, unknown>, message: string): void;
}

export interface CreateServerControllers {
  agentRuntime?: AgentRuntime;
  assessmentAttemptController?: AssessmentAttemptController;
  initialAssessmentController?: InitialAssessmentController;
  learningLoopController?: LearningLoopController;
  masterDataUploadController?: MasterDataUploadController;
  practiceActivityController?: PracticeActivityController;
  relayWorkspaceProvisioner?: Pick<RelayWorkspaceProvisioner, "ensureProvisionedBinding">;
  runtimeBootLogger?: RuntimeBootLogger;
  studyPlanController?: StudyPlanController;
}

async function createAgentRuntime(
  provisioner?: Pick<RelayWorkspaceProvisioner, "ensureProvisionedBinding">,
  diagnosticsLogger?: RuntimeBootLogger
): Promise<RuntimeBootstrap> {
  const runtimeConfig = loadLoopStudyRuntimeConfig(process.env);
  if (runtimeConfig.runtimeMode === "relay" && runtimeConfig.relay) {
    const binding = provisioner
      ? await provisioner.ensureProvisionedBinding()
      : await new RelayWorkspaceProvisioner({
          binding: RelayWorkspaceBinding.create({
            baseUrl: runtimeConfig.relay.baseUrl,
            profile: runtimeConfig.relay.profile
          })
        }).ensureProvisionedBinding();

    return {
      agentRuntime: new RelayAgentRuntime({
        binding,
        diagnosticsLogger
      }),
      compatibilityWarnings: runtimeConfig.compatibilityWarnings,
      runtimeMode: "relay",
      runtimeName: "RelayAgentRuntime",
      relayWorkspaceId: binding.workspaceId,
      defaultAgentHandle: binding.defaultAgentHandle,
      controllerId: binding.controllerId
    };
  }

  return {
    agentRuntime: new FixtureAgentRuntime(),
    compatibilityWarnings: runtimeConfig.compatibilityWarnings,
    runtimeMode: "fixture",
    runtimeName: "FixtureAgentRuntime"
  };
}

function describeInjectedRuntime(agentRuntime: AgentRuntime): RuntimeBootstrap {
  if (agentRuntime instanceof RelayAgentRuntime) {
    const binding = agentRuntime.describeBinding();

    return {
      agentRuntime,
      compatibilityWarnings: [],
      runtimeMode: "relay",
      runtimeName: "RelayAgentRuntime",
      relayWorkspaceId: binding.workspaceId,
      defaultAgentHandle: binding.defaultAgentHandle,
      controllerId: binding.controllerId
    };
  }

  return {
    agentRuntime,
    compatibilityWarnings: [],
    runtimeMode: "fixture",
    runtimeName: "FixtureAgentRuntime"
  };
}

export function logRuntimeBootstrap(
  logger: RuntimeBootLogger,
  bootstrap: RuntimeBootstrap
): void {
  const bindings: Record<string, unknown> = {
    runtimeMode: bootstrap.runtimeMode
  };

  if (bootstrap.relayWorkspaceId) {
    bindings.relayWorkspaceId = bootstrap.relayWorkspaceId;
  }

  if (bootstrap.defaultAgentHandle) {
    bindings.defaultAgentHandle = bootstrap.defaultAgentHandle;
  }

  if (bootstrap.controllerId) {
    bindings.controllerId = bootstrap.controllerId;
  }

  const message =
    bootstrap.runtimeMode === "relay"
      ? "loop.study booted with RelayAgentRuntime and provisioned the Relay workspace binding."
      : "loop.study booted with FixtureAgentRuntime.";

  logger.info(bindings, message);

  if (logger.warn) {
    for (const warning of bootstrap.compatibilityWarnings) {
      logger.warn({ runtimeMode: bootstrap.runtimeMode }, warning);
    }
  }
}

export async function createServer(controllers: CreateServerControllers = {}) {
  const server = Fastify({
    logger: true
  });

  server.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin ?? "*";

    reply.header("access-control-allow-origin", origin);
    reply.header("vary", "Origin");
    reply.header("access-control-allow-methods", "GET, POST, OPTIONS");
    reply.header("access-control-allow-headers", "content-type");

    if (request.method === "OPTIONS") {
      return reply.code(204).send();
    }
  });

  const repository = new SqliteLearningLoopRepository(
    process.env.VITEST ? ":memory:" : process.env.SHERLOCK_DB_PATH
  );
  const runtimeBootstrap = controllers.agentRuntime
    ? describeInjectedRuntime(controllers.agentRuntime)
    : await createAgentRuntime(controllers.relayWorkspaceProvisioner, server.log);
  const agentRuntime = runtimeBootstrap.agentRuntime;
  logRuntimeBootstrap(controllers.runtimeBootLogger ?? server.log, runtimeBootstrap);
  const studyPlanController =
    controllers.studyPlanController ?? new StudyPlanController(repository, undefined, undefined, agentRuntime);
  const initialAssessmentController =
    controllers.initialAssessmentController ??
    new InitialAssessmentController(repository, undefined, undefined, agentRuntime);
  const assessmentAttemptController =
    controllers.assessmentAttemptController ?? new AssessmentAttemptController(repository, agentRuntime);
  const masterDataUploadController =
    controllers.masterDataUploadController ?? new MasterDataUploadController(repository, agentRuntime);
  const learningLoopController =
    controllers.learningLoopController ?? new LearningLoopController(repository);
  const practiceActivityController =
    controllers.practiceActivityController ??
    new PracticeActivityController(repository, undefined, undefined, agentRuntime);

  server.get("/health", async () => ({
    status: "ok"
  }));

  await registerStudyPlanRoutes(server, studyPlanController);
  await registerAssessmentRoutes(server, initialAssessmentController, assessmentAttemptController);
  await registerLearningLoopRoutes(server, learningLoopController);
  await registerMasterDataRoutes(server, masterDataUploadController);
  await registerPracticeActivityRoutes(server, practiceActivityController);

  return server;
}
