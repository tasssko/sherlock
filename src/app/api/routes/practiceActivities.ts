import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PracticeActivityController } from "../../../modules/practice/PracticeActivityController.js";
import { mapDomainErrorToHttpStatus } from "../http/domainErrors.js";

const createPracticeActivitySchema = z.object({
  kind: z.literal("flashcard_set"),
  cardCount: z.number().int().min(1).max(12)
});

const completePracticeActivitySchema = z.object({
  responses: z
    .array(
      z.object({
        practiceItemId: z.string().min(1),
        responseText: z.string().min(1),
        confidence: z.enum(["high", "low", "medium"]),
        note: z.string().min(1).optional()
      })
    )
    .min(1)
});

export async function registerPracticeActivityRoutes(
  server: FastifyInstance,
  practiceActivityController: PracticeActivityController
): Promise<void> {
  server.post("/v1/learning-loops/:id/practice-activities", async (request, reply) => {
    const parsed = createPracticeActivitySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid practice activity request.",
        issues: parsed.error.issues
      });
    }

    const result = await practiceActivityController.generate({
      ...parsed.data,
      learningLoopId: String((request.params as { id: string }).id)
    });
    if (!result.ok) {
      return reply.code(mapDomainErrorToHttpStatus(result.error.code)).send({
        error: result.error.message,
        code: result.error.code,
        details: result.error.details
      });
    }

    return reply.code(201).send(result.value);
  });

  server.post("/v1/practice-activities/:id/completions", async (request, reply) => {
    const parsed = completePracticeActivitySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid practice completion request.",
        issues: parsed.error.issues
      });
    }

    const result = await practiceActivityController.complete({
      ...parsed.data,
      practiceActivityId: String((request.params as { id: string }).id)
    });
    if (!result.ok) {
      return reply.code(mapDomainErrorToHttpStatus(result.error.code)).send({
        error: result.error.message,
        code: result.error.code,
        details: result.error.details
      });
    }

    return reply.code(201).send(result.value);
  });

  server.get("/v1/learning-loops/:id/practice-activities", async (request, reply) => {
    const result = practiceActivityController.list(String((request.params as { id: string }).id));
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
