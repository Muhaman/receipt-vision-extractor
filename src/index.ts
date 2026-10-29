import Anthropic from "@anthropic-ai/sdk";
import { config } from "dotenv";
import { createApp } from "./app.js";
import { connectDb } from "./db.js";
import { loadEnv } from "./env.js";
import { createLogger } from "./logger.js";
import { ClaudeExtractor } from "./receipt/extract.js";
import { ReceiptRepo } from "./receipt/repo.js";

config({ quiet: true });

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL);

const database = await connectDb(env.MONGODB_URI, env.MONGODB_DB);
const repo = await ReceiptRepo.create(database.db);
const extractor = new ClaudeExtractor(new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }), env.ANTHROPIC_MODEL);

const app = createApp({ repo, extractor, corsOrigins: env.corsOrigins, logger });
const server = app.listen(env.PORT, () => logger.info({ port: env.PORT }, "server listening"));

function shutdown(): void {
  server.close(() => {
    void database.close().finally(() => process.exit(0));
  });
  server.closeAllConnections();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
