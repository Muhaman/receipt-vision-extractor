import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express, { type Express } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { errorHandler } from "./errors.js";
import type { Logger } from "./logger.js";
import type { Extractor } from "./receipt/extract.js";
import type { ReceiptRepo } from "./receipt/repo.js";
import { insightsRouter } from "./routes/insights.js";
import { receiptsRouter } from "./routes/receipts.js";

export interface AppDeps {
  repo: ReceiptRepo;
  extractor: Extractor;
  corsOrigins: string[];
  logger: Logger;
}

const PUBLIC_DIR = fileURLToPath(new URL("../public", import.meta.url));

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");

  app.use((req, res, next) => {
    const incoming = req.header("x-request-id");
    const requestId = incoming && incoming.length <= 128 ? incoming : randomUUID();
    res.setHeader("x-request-id", requestId);
    const startedAt = Date.now();
    res.on("finish", () => {
      deps.logger.info(
        { requestId, method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - startedAt },
        "request",
      );
    });
    next();
  });

  app.use(helmet());
  app.use(cors({ origin: deps.corsOrigins }));
  app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false }));

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Each upload is a paid vision call, so it gets a tighter budget than reads.
  app.post("/v1/receipts", rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false }));
  app.use("/v1/receipts", receiptsRouter(deps));
  app.use("/v1/insights", insightsRouter(deps));
  app.use(express.static(PUBLIC_DIR));

  app.use((_req, res) => {
    res.status(404).json({ error: { code: "not_found", message: "Route not found." } });
  });
  app.use(errorHandler(deps.logger));
  return app;
}
