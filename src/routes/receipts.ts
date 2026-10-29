import { type RequestHandler, Router } from "express";
import multer from "multer";
import { z } from "zod";
import { AppError } from "../errors.js";
import type { Extractor } from "../receipt/extract.js";
import { isAllowedMime, sniffMime } from "../receipt/mime.js";
import { parseId, type ReceiptRepo } from "../receipt/repo.js";
import { validateReceipt } from "../receipt/validate.js";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (isAllowedMime(file.mimetype)) cb(null, true);
    else cb(new AppError(415, "unsupported_media_type", "Upload a JPEG, PNG, WebP or PDF file."));
  },
});

const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export function receiptsRouter(deps: { repo: ReceiptRepo; extractor: Extractor }): Router {
  const router = Router();

  const create: RequestHandler = async (req, res) => {
    const file = req.file;
    if (!file) throw new AppError(400, "missing_file", "Upload a receipt in the 'file' form field.");
    if (file.size === 0) throw new AppError(400, "empty_file", "The uploaded file is empty.");

    const mimeType = sniffMime(file.buffer);
    if (!mimeType) {
      throw new AppError(415, "unsupported_media_type", "File content is not a JPEG, PNG, WebP or PDF.");
    }

    const receipt = await deps.extractor.extract({ buffer: file.buffer, mimeType });
    const stored = await deps.repo.insert(receipt, validateReceipt(receipt));
    res.status(201).json({ id: stored.id, receipt: stored.receipt, warnings: stored.warnings });
  };

  router.post("/", upload.single("file"), create);

  router.get("/", async (req, res) => {
    const query = ListQuery.parse(req.query);
    const cursor = query.cursor === undefined ? undefined : parseId(query.cursor);
    res.json(await deps.repo.list(query.limit, cursor));
  });

  router.get("/:id", async (req, res) => {
    const stored = await deps.repo.get(parseId(req.params.id));
    if (!stored) throw new AppError(404, "not_found", "Receipt not found.");
    res.json(stored);
  });

  return router;
}
