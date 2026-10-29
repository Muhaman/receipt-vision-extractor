import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import { pino } from "pino";
import { vi } from "vitest";
import type { AppDeps } from "../src/app.js";
import type { Extractor } from "../src/receipt/extract.js";
import type { Receipt } from "../src/receipt/schema.js";
import { ReceiptRepo } from "../src/receipt/repo.js";

/** Synthetic receipt; every value is fictional. */
export function sampleReceipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    merchant: "Hartwell Corner Market",
    date: "2025-03-14",
    currency: "USD",
    lineItems: [
      { description: "Oat milk", quantity: 2, unitPrice: 3, total: 6 },
      { description: "Sourdough loaf", quantity: 1, unitPrice: 4, total: 4 },
    ],
    subtotal: 10,
    tax: 0.8,
    total: 10.8,
    category: "groceries",
    ...overrides,
  };
}

/** Well-known 1x1 PNG; the extractor is faked, so only the signature matters. */
export const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

export function fakeExtractor(receipt: Receipt = sampleReceipt()): Extractor {
  return { extract: vi.fn(async () => receipt) };
}

export interface TestDb {
  repo: ReceiptRepo;
  reset(): Promise<void>;
  count(): Promise<number>;
  stop(): Promise<void>;
}

export async function startTestDb(): Promise<TestDb> {
  const server = await MongoMemoryServer.create();
  const client = await MongoClient.connect(server.getUri());
  const db = client.db("receipts-test");
  const repo = await ReceiptRepo.create(db);
  return {
    repo,
    reset: async () => {
      await db.collection("receipts").deleteMany({});
    },
    count: () => db.collection("receipts").countDocuments(),
    stop: async () => {
      await client.close();
      await server.stop();
    },
  };
}

export function makeDeps(repo: ReceiptRepo, extractor: Extractor = fakeExtractor()): AppDeps {
  return {
    repo,
    extractor,
    corsOrigins: ["http://localhost:3000"],
    logger: pino({ level: "silent" }),
  };
}
