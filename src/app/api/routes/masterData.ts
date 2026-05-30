import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { MasterDataUploadController } from "../../../modules/assessment/MasterDataUploadController.js";
import { mapDomainErrorToHttpStatus } from "../http/domainErrors.js";

const uploadMasterDataSchema = z.object({
  sourceName: z.string().min(1),
  items: z
    .array(
      z.object({
        topic: z.string().min(1),
        prompt: z.string().min(1),
        canonicalAnswer: z.string().min(1),
        visibleMaterial: z.string().min(1),
        keywords: z.array(z.string().min(1)).optional()
      })
    )
    .min(1)
});

export async function registerMasterDataRoutes(
  server: FastifyInstance,
  controller = new MasterDataUploadController()
): Promise<void> {
  server.post("/v1/master-data", async (request, reply) => {
    const parsed = uploadMasterDataSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid master data upload request.",
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
