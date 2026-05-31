import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { InitialLoopBatchController } from "../../../modules/learning/InitialLoopBatchController.js";
import { LearningLoopController } from "../../../modules/learning/LearningLoopController.js";
import { mapDomainErrorToHttpStatus } from "../http/domainErrors.js";

const createInitialLoopBatchSchema = z.object({
  learnerName: z.string().min(1),
  yearGroup: z.string().min(1),
  topic: z.string().min(1),
  objective: z.string().min(1),
  desiredLoopCount: z.number().int().min(1).max(6).default(3)
});

export async function registerLearningLoopRoutes(
  server: FastifyInstance,
  controller: LearningLoopController,
  initialLoopBatchController: InitialLoopBatchController
): Promise<void> {
  server.post("/v1/learning-loops/start", async (request, reply) => {
    const parsed = createInitialLoopBatchSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid loop start request.",
        issues: parsed.error.issues
      });
    }

    const result = await initialLoopBatchController.execute(parsed.data);
    if (!result.ok) {
      return reply.code(mapDomainErrorToHttpStatus(result.error.code)).send({
        error: result.error.message,
        code: result.error.code,
        details: result.error.details
      });
    }

    return reply.code(201).send(result.value);
  });

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
