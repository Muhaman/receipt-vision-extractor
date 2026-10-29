import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { makeDeps, startTestDb, type TestDb } from "./helpers.js";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb();
});
afterAll(async () => {
  await testDb.stop();
});

describe("rate limiting", () => {
  it("answers over-limit requests with a 429 JSON error body", async () => {
    const app = createApp({ ...makeDeps(testDb.repo), rateLimits: { read: 1, upload: 1 } });
    expect((await request(app).get("/v1/receipts")).status).toBe(200);

    const res = await request(app).get("/v1/receipts");
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: { code: "rate_limited", message: "Too many requests." } });
  });

  it("does not rate limit /healthz", async () => {
    const app = createApp({ ...makeDeps(testDb.repo), rateLimits: { read: 1, upload: 1 } });
    for (let i = 0; i < 3; i++) expect((await request(app).get("/healthz")).status).toBe(200);
  });
});
