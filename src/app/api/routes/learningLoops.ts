import type { FastifyInstance } from "fastify";
import { LearningLoopController } from "../../../modules/learning/LearningLoopController.js";
import { mapDomainErrorToHttpStatus } from "../http/domainErrors.js";

export async function registerLearningLoopRoutes(
  server: FastifyInstance,
  controller: LearningLoopController
): Promise<void> {
  server.get("/v1/learning-loops/:id", async (request, reply) => {
    const result = controller.get(String((request.params as { id: string }).id));
    if (!result.ok) {
      return reply.code(mapDomainErrorToHttpStatus(result.error.code)).send({
        error: result.error.message,
        code: result.error.code,
        details: result.error.details
      });
    }

    return reply.code(200).send(result.value);
  });
}
