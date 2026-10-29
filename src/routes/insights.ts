import { Router } from "express";
import { z } from "zod";
import type { ReceiptRepo } from "../receipt/repo.js";

const SpendQuery = z.object({ by: z.enum(["category", "month"]) });

export function insightsRouter(deps: { repo: ReceiptRepo }): Router {
  const router = Router();

  router.get("/spend", async (req, res) => {
    const { by } = SpendQuery.parse(req.query);
    res.json(await deps.repo.spendBy(by));
  });

  return router;
}
