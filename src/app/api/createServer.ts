import Fastify from "fastify";
import { registerStudyPlanRoutes } from "./routes/studyPlans.js";

export async function createServer() {
  const server = Fastify({
    logger: true
  });

  server.get("/health", async () => ({
    status: "ok"
  }));

  await registerStudyPlanRoutes(server);

  return server;
}

