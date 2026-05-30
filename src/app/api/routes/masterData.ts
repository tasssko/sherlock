import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { MasterDataUploadController } from "../../../modules/assessment/MasterDataUploadController.js";
import { mapDomainErrorToHttpStatus } from "../http/domainErrors.js";

const uploadMasterDataSchema = z.object({
  contentType: z.string().min(1).optional(),
  learnerYearGroup: z.string().min(1).optional(),
  rawSourceContent: z.string().min(1).optional(),
  sourceName: z.string().min(1),
  items: z
    .array(
      z.object({
        topic: z.string().min(1),
        prompt: z.string().min(1),
        canonicalAnswer: z.string().min(1),
        visibleMaterial: z.string().min(1),
        keywords: z.array(z.string().min(1)).optional(),
        structured: z
          .object({
            content: z.string().min(1),
            date: z.string().min(1).optional(),
            definition: z.string().min(1).optional(),
            itemType: z.enum([
              "fact",
              "person",
              "key_term",
              "date",
              "cause",
              "event",
              "consequence",
              "legacy"
            ]),
            person: z.string().min(1).optional(),
            sourceRef: z.string().min(1),
            subject: z.string().min(1),
            subtopic: z.string().min(1),
            term: z.string().min(1).optional(),
            topic: z.string().min(1),
            yearGroup: z.string().min(1)
          })
          .optional()
      })
    )
    .min(1),
  userHints: z
    .object({
      subject: z.string().min(1).optional(),
      topic: z.string().min(1).optional()
    })
    .optional()
});

export async function registerMasterDataRoutes(
  server: FastifyInstance,
  controller: MasterDataUploadController
): Promise<void> {
  server.post("/v1/master-data", async (request, reply) => {
    const parsed = uploadMasterDataSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid master data upload request.",
        issues: parsed.error.issues
      });
    }

    const result = await controller.execute(parsed.data);
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
