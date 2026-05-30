import Fastify from "fastify";
import { AssessmentAttemptController } from "../../modules/assessment/AssessmentAttemptController.js";
import { InitialAssessmentController } from "../../modules/assessment/InitialAssessmentController.js";
import { MasterDataUploadController } from "../../modules/assessment/MasterDataUploadController.js";
import { StudyPlanController } from "../../modules/planning/StudyPlanController.js";
import { SqliteStudyPlanRepository } from "../../modules/planning/StudyPlanRepository.js";
import { registerAssessmentRoutes } from "./routes/assessments.js";
import { registerMasterDataRoutes } from "./routes/masterData.js";
import { registerStudyPlanRoutes } from "./routes/studyPlans.js";

export interface CreateServerControllers {
  assessmentAttemptController?: AssessmentAttemptController;
  initialAssessmentController?: InitialAssessmentController;
  masterDataUploadController?: MasterDataUploadController;
  studyPlanController?: StudyPlanController;
}

export async function createServer(controllers: CreateServerControllers = {}) {
  const server = Fastify({
    logger: true
  });
  const repository = new SqliteStudyPlanRepository(
    process.env.VITEST ? ":memory:" : process.env.SHERLOCK_DB_PATH
  );
  const studyPlanController = controllers.studyPlanController ?? new StudyPlanController(repository);
  const initialAssessmentController =
    controllers.initialAssessmentController ?? new InitialAssessmentController(repository);
  const assessmentAttemptController =
    controllers.assessmentAttemptController ?? new AssessmentAttemptController(repository);
  const masterDataUploadController =
    controllers.masterDataUploadController ?? new MasterDataUploadController(repository);

  server.get("/health", async () => ({
    status: "ok"
  }));

  await registerStudyPlanRoutes(server, studyPlanController);
  await registerAssessmentRoutes(server, initialAssessmentController, assessmentAttemptController);
  await registerMasterDataRoutes(server, masterDataUploadController);

  return server;
}
