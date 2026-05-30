import Fastify from "fastify";
import { AssessmentAttemptController } from "../../modules/assessment/AssessmentAttemptController.js";
import { InitialAssessmentController } from "../../modules/assessment/InitialAssessmentController.js";
import { MasterDataUploadController } from "../../modules/assessment/MasterDataUploadController.js";
import { StudyPlanController } from "../../modules/planning/StudyPlanController.js";
import { SqliteLearningLoopRepository } from "../../modules/planning/SqliteLearningLoopRepository.js";
import { PracticeActivityController } from "../../modules/practice/PracticeActivityController.js";
import { registerAssessmentRoutes } from "./routes/assessments.js";
import { registerMasterDataRoutes } from "./routes/masterData.js";
import { registerPracticeActivityRoutes } from "./routes/practiceActivities.js";
import { registerStudyPlanRoutes } from "./routes/studyPlans.js";

export interface CreateServerControllers {
  assessmentAttemptController?: AssessmentAttemptController;
  initialAssessmentController?: InitialAssessmentController;
  masterDataUploadController?: MasterDataUploadController;
  practiceActivityController?: PracticeActivityController;
  studyPlanController?: StudyPlanController;
}

export async function createServer(controllers: CreateServerControllers = {}) {
  const server = Fastify({
    logger: true
  });
  const repository = new SqliteLearningLoopRepository(
    process.env.VITEST ? ":memory:" : process.env.SHERLOCK_DB_PATH
  );
  const studyPlanController = controllers.studyPlanController ?? new StudyPlanController(repository);
  const initialAssessmentController =
    controllers.initialAssessmentController ?? new InitialAssessmentController(repository);
  const assessmentAttemptController =
    controllers.assessmentAttemptController ?? new AssessmentAttemptController(repository);
  const masterDataUploadController =
    controllers.masterDataUploadController ?? new MasterDataUploadController(repository);
  const practiceActivityController =
    controllers.practiceActivityController ?? new PracticeActivityController(repository);

  server.get("/health", async () => ({
    status: "ok"
  }));

  await registerStudyPlanRoutes(server, studyPlanController);
  await registerAssessmentRoutes(server, initialAssessmentController, assessmentAttemptController);
  await registerMasterDataRoutes(server, masterDataUploadController);
  await registerPracticeActivityRoutes(server, practiceActivityController);

  return server;
}
