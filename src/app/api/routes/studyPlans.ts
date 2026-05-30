import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { StudyPlanController } from "../../../modules/planning/StudyPlanController.js";
import { mapDomainErrorToHttpStatus } from "../http/domainErrors.js";

const createStudyPlanSchema = z.object({
  learnerName: z.string().min(1),
  yearGroup: z.string().min(1),
  objective: z.string().min(1),
  focusTopics: z.array(z.string().min(1)).min(1),
  workspaceLabel: z.string().min(1).optional(),
  availableMinutesByDay: z.object({
    Monday: z.number().int().min(0),
    Tuesday: z.number().int().min(0),
    Wednesday: z.number().int().min(0),
    Thursday: z.number().int().min(0),
    Friday: z.number().int().min(0),
    Saturday: z.number().int().min(0),
    Sunday: z.number().int().min(0)
  })
});

export async function registerStudyPlanRoutes(
  server: FastifyInstance,
  controller: StudyPlanController
): Promise<void> {
  server.post("/v1/study-plans", async (request, reply) => {
    const parsed = createStudyPlanSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid study plan request.",
        issues: parsed.error.issues
      });
    }

    const result = controller.execute(parsed.data);

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
