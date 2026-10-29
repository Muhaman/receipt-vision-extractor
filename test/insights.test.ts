import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { makeDeps, sampleReceipt, startTestDb, type TestDb } from "./helpers.js";

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

describe("GET /v1/insights/spend", () => {
  it("groups by category and currency, sorted by total desc", async () => {
    await testDb.repo.insert(sampleReceipt({ currency: "USD", total: 10 }), []);
    await testDb.repo.insert(sampleReceipt({ currency: "USD", total: 5 }), []);
    await testDb.repo.insert(sampleReceipt({ currency: "EUR", total: 7 }), []);
    await testDb.repo.insert(sampleReceipt({ currency: "USD", category: "dining", total: 1 }), []);

    const res = await request(createApp(makeDeps(testDb.repo))).get("/v1/insights/spend?by=category");
    expect(res.status).toBe(200);
    expect(res.body).toContainEqual({ key: "groceries", currency: "USD", total: 15, count: 2 });
    expect(res.body).toContainEqual({ key: "groceries", currency: "EUR", total: 7, count: 1 });
    expect(res.body).toHaveLength(3);
    const totals = res.body.map((row: { total: number }) => row.total);
    expect(totals).toEqual([...totals].sort((a: number, b: number) => b - a));
  });

  it("groups by month using the receipt date", async () => {
    await testDb.repo.insert(sampleReceipt({ date: "2025-03-01", total: 4 }), []);
    await testDb.repo.insert(sampleReceipt({ date: "2025-03-20", total: 6 }), []);
    await testDb.repo.insert(sampleReceipt({ date: "2025-04-02", total: 2 }), []);

    const res = await request(createApp(makeDeps(testDb.repo))).get("/v1/insights/spend?by=month");
    expect(res.body).toEqual([
      { key: "2025-03", currency: "USD", total: 10, count: 2 },
      { key: "2025-04", currency: "USD", total: 2, count: 1 },
    ]);
  });

  it("rejects an unsupported grouping with 400", async () => {
    const res = await request(createApp(makeDeps(testDb.repo))).get("/v1/insights/spend?by=week");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_request");
  });
});
