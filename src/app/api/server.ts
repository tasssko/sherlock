import { createServer } from "./createServer.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";

const server = await createServer();

try {
  await server.listen({ port, host });
} catch (error) {
  server.log.error(error);
  process.exitCode = 1;
}

