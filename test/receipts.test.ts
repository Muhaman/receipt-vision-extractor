import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { LlmRefusalError } from "../src/errors.js";
import type { Extractor } from "../src/receipt/extract.js";
import { fakeExtractor, makeDeps, PNG_BYTES, sampleReceipt, startTestDb, type TestDb } from "./helpers.js";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb();
});
afterAll(async () => {
  await testDb.stop();
});
beforeEach(async () => {
  await testDb.reset();
});

const appWith = (extractor: Extractor = fakeExtractor()) => createApp(makeDeps(testDb.repo, extractor));

const upload = (app: ReturnType<typeof createApp>, body: Buffer, filename: string, contentType: string) =>
  request(app).post("/v1/receipts").attach("file", body, { filename, contentType });

describe("POST /v1/receipts", () => {
  it("rejects a .gif with 415", async () => {
    const res = await upload(appWith(), Buffer.from("GIF89a"), "x.gif", "image/gif");
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe("unsupported_media_type");
  });

  it("rejects a declared PNG whose bytes are not an image with 415", async () => {
    const res = await upload(appWith(), Buffer.from("definitely not a png"), "x.png", "image/png");
    expect(res.status).toBe(415);
  });

  it("rejects files over 5 MB with 413", async () => {
    const big = Buffer.concat([PNG_BYTES, Buffer.alloc(6 * 1024 * 1024)]);
    const res = await upload(appWith(), big, "big.png", "image/png");
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("file_too_large");
  });

  it("rejects an empty file with 400", async () => {
    const res = await upload(appWith(), Buffer.alloc(0), "empty.png", "image/png");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("empty_file");
  });

  it("rejects a request without a file with 400", async () => {
    const res = await request(appWith()).post("/v1/receipts");
    expect(res.status).toBe(400);
  });

  it("extracts, validates and persists a PNG, returning 201", async () => {
    const extractor = fakeExtractor(sampleReceipt({ subtotal: 12, tax: 0.96, total: 12.96 }));
    const res = await upload(appWith(extractor), PNG_BYTES, "r.png", "image/png");
    expect(res.status).toBe(201);
    expect(res.body.receipt.merchant).toBe("Hartwell Corner Market");
    expect(res.body.warnings).toEqual(["line_items_mismatch"]);
    expect(await testDb.count()).toBe(1);

    const stored = await request(appWith()).get(`/v1/receipts/${res.body.id}`);
    expect(stored.status).toBe(200);
    expect(stored.body.receipt.total).toBe(12.96);
  });

  it("passes the sniffed MIME type to the extractor", async () => {
    const extractor = fakeExtractor();
    await upload(appWith(extractor), PNG_BYTES, "r.jpg", "image/jpeg");
    expect(extractor.extract).toHaveBeenCalledWith(expect.objectContaining({ mimeType: "image/png" }));
  });

  it("maps an extractor refusal to 502 with code refusal", async () => {
    const extractor: Extractor = {
      extract: async () => {
        throw new LlmRefusalError("general_harms");
      },
    };
    const res = await upload(appWith(extractor), PNG_BYTES, "r.png", "image/png");
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("refusal");
    expect(await testDb.count()).toBe(0);
  });
});

describe("GET /v1/receipts", () => {
  it("rejects an invalid id with 400", async () => {
    const res = await request(appWith()).get("/v1/receipts/nope");
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown id", async () => {
    const res = await request(appWith()).get("/v1/receipts/64b7f0f2a1b2c3d4e5f60718");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("paginates with nextCursor, then null on the last page", async () => {
    for (let i = 0; i < 3; i++) await testDb.repo.insert(sampleReceipt({ merchant: `Shop ${i}` }), []);
    const app = appWith();

    const first = await request(app).get("/v1/receipts?limit=2");
    expect(first.status).toBe(200);
    expect(first.body.items.map((r: { receipt: { merchant: string } }) => r.receipt.merchant)).toEqual([
      "Shop 2",
      "Shop 1",
    ]);
    expect(typeof first.body.nextCursor).toBe("string");

    const second = await request(app).get(`/v1/receipts?limit=2&cursor=${first.body.nextCursor}`);
    expect(second.body.items).toHaveLength(1);
    expect(second.body.items[0].receipt.merchant).toBe("Shop 0");
    expect(second.body.nextCursor).toBeNull();
  });

  it("rejects an out-of-range limit or malformed cursor with 400", async () => {
    const app = appWith();
    expect((await request(app).get("/v1/receipts?limit=101")).status).toBe(400);
    expect((await request(app).get("/v1/receipts?cursor=abc")).status).toBe(400);
  });
});
