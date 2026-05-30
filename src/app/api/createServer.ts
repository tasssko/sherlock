import Fastify from "fastify";
import { AssessmentAttemptController } from "../../modules/assessment/AssessmentAttemptController.js";
import { InitialAssessmentController } from "../../modules/assessment/InitialAssessmentController.js";
import { MasterDataUploadController } from "../../modules/assessment/MasterDataUploadController.js";
import { LearningLoopController } from "../../modules/learning/LearningLoopController.js";
import { StudyPlanController } from "../../modules/planning/StudyPlanController.js";
import { SqliteLearningLoopRepository } from "../../modules/planning/SqliteLearningLoopRepository.js";
import { PracticeActivityController } from "../../modules/practice/PracticeActivityController.js";
import type { AgentRuntime } from "../../modules/runtime/AgentRuntime.js";
import { FixtureAgentRuntime } from "../../modules/runtime/FixtureAgentRuntime.js";
import { RelayAgentRuntime } from "../../modules/runtime/RelayAgentRuntime.js";
import { registerAssessmentRoutes } from "./routes/assessments.js";
import { registerLearningLoopRoutes } from "./routes/learningLoops.js";
import { registerMasterDataRoutes } from "./routes/masterData.js";
import { registerPracticeActivityRoutes } from "./routes/practiceActivities.js";
import { registerStudyPlanRoutes } from "./routes/studyPlans.js";

export interface CreateServerControllers {
  agentRuntime?: AgentRuntime;
  assessmentAttemptController?: AssessmentAttemptController;
  initialAssessmentController?: InitialAssessmentController;
  learningLoopController?: LearningLoopController;
  masterDataUploadController?: MasterDataUploadController;
  practiceActivityController?: PracticeActivityController;
  studyPlanController?: StudyPlanController;
}

function createAgentRuntime(): AgentRuntime {
  if (process.env.SHERLOCK_AGENT_RUNTIME === "relay" && process.env.RELAY_API_URL) {
    return new RelayAgentRuntime({
      baseUrl: process.env.RELAY_API_URL,
      workspaceId: process.env.RELAY_WORKSPACE_ID ?? "workspace_demo"
    });
  }

  return new FixtureAgentRuntime();
}

export async function createServer(controllers: CreateServerControllers = {}) {
  const server = Fastify({
    logger: true
  });
  const repository = new SqliteLearningLoopRepository(
    process.env.VITEST ? ":memory:" : process.env.SHERLOCK_DB_PATH
  );
  const agentRuntime = controllers.agentRuntime ?? createAgentRuntime();
  const studyPlanController =
    controllers.studyPlanController ?? new StudyPlanController(repository, undefined, undefined, agentRuntime);
  const initialAssessmentController =
    controllers.initialAssessmentController ??
    new InitialAssessmentController(repository, undefined, undefined, agentRuntime);
  const assessmentAttemptController =
    controllers.assessmentAttemptController ?? new AssessmentAttemptController(repository, agentRuntime);
  const masterDataUploadController =
    controllers.masterDataUploadController ?? new MasterDataUploadController(repository);
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
