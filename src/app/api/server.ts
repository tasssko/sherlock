import { loadApiEnvironment } from "./loadApiEnvironment.js";
import { createServer } from "./createServer.js";

loadApiEnvironment();

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "127.0.0.1";

const server = await createServer();

try {
  await server.listen({ port, host });
} catch (error) {
  server.log.error(error);
  process.exitCode = 1;
}
