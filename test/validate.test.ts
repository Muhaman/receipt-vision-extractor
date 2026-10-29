import { describe, expect, it } from "vitest";
import { validateReceipt } from "../src/receipt/validate.js";
import { sampleReceipt } from "./helpers.js";

const NOW = new Date("2026-06-01T12:00:00Z");

describe("validateReceipt", () => {
  it("returns no warnings for a consistent receipt", () => {
    expect(validateReceipt(sampleReceipt(), NOW)).toEqual([]);
  });

  it("flags line_items_mismatch when items sum 10.00 but subtotal is 12.00", () => {
    const receipt = sampleReceipt({ subtotal: 12, tax: 0.96, total: 12.96 });
    expect(validateReceipt(receipt, NOW)).toEqual(["line_items_mismatch"]);
  });

  it("flags total_mismatch when 10 + 0.8 does not equal 11.5", () => {
    const receipt = sampleReceipt({ subtotal: 10, tax: 0.8, total: 11.5 });
    expect(validateReceipt(receipt, NOW)).toEqual(["total_mismatch"]);
  });

  it("accepts differences within the 0.01 tolerance", () => {
    const receipt = sampleReceipt({ subtotal: 10.01, tax: 0.8, total: 10.8 });
    expect(validateReceipt(receipt, NOW)).toEqual([]);
  });

  it("flags suspicious_date for a future date", () => {
    expect(validateReceipt(sampleReceipt({ date: "2099-01-01" }), NOW)).toEqual(["suspicious_date"]);
  });

  it("flags suspicious_date before 2000-01-01", () => {
    expect(validateReceipt(sampleReceipt({ date: "1999-12-31" }), NOW)).toEqual(["suspicious_date"]);
  });

  it("flags suspicious_date for an impossible calendar date", () => {
    expect(validateReceipt(sampleReceipt({ date: "2025-13-45" }), NOW)).toEqual(["suspicious_date"]);
  });

  it("reports several warnings together", () => {
    const receipt = sampleReceipt({ date: "2099-01-01", subtotal: 12, total: 99 });
    expect(validateReceipt(receipt, NOW)).toEqual(
      expect.arrayContaining(["line_items_mismatch", "total_mismatch", "suspicious_date"]),
    );
  });
});
