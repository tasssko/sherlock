import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AssessmentAttemptController } from "../../../modules/assessment/AssessmentAttemptController.js";
import { InitialAssessmentController } from "../../../modules/assessment/InitialAssessmentController.js";
import { mapDomainErrorToHttpStatus } from "../http/domainErrors.js";

const createInitialAssessmentSchema = z.object({
  learnerName: z.string().min(1),
  yearGroup: z.string().min(1),
  topic: z.string().min(1),
  questionCount: z.number().int().min(1).max(10)
});

const submitAttemptSchema = z.object({
  assessmentId: z.string().min(1),
  responses: z
    .array(
      z.object({
        itemId: z.string().min(1),
        answer: z.string().min(1)
      })
    )
    .min(1)
});

export async function registerAssessmentRoutes(
  server: FastifyInstance,
  initialAssessmentController: InitialAssessmentController,
  assessmentAttemptController: AssessmentAttemptController
): Promise<void> {
  server.post("/v1/assessments/initial", async (request, reply) => {
    const parsed = createInitialAssessmentSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid assessment request.",
        issues: parsed.error.issues
      });
    }

    const result = initialAssessmentController.execute(parsed.data);
    if (!result.ok) {
      return reply.code(mapDomainErrorToHttpStatus(result.error.code)).send({
        error: result.error.message,
        code: result.error.code,
        details: result.error.details
      });
    }

    return reply.code(201).send(result.value);
  });

  server.post("/v1/assessments/attempts", async (request, reply) => {
    const parsed = submitAttemptSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid assessment attempt request.",
        issues: parsed.error.issues
      });
    }

    const result = assessmentAttemptController.execute(parsed.data);
    if (!result.ok) {
      return reply.code(mapDomainErrorToHttpStatus(result.error.code)).send({
        error: result.error.message,
        code: result.error.code,
        details: result.error.details
      });
    }

    return reply.code(201).send(result.value);
  });
}
