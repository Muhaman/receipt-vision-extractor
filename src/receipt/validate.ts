import type { Receipt } from "./schema.js";

export type Warning = "line_items_mismatch" | "total_mismatch" | "suspicious_date";

const TOLERANCE = 0.01;
const EARLIEST_DATE = "2000-01-01";

// The epsilon absorbs binary floating-point error in sums of decimal amounts.
const differs = (a: number, b: number): boolean => Math.abs(a - b) > TOLERANCE + 1e-9;

function isRealDate(date: string): boolean {
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date);
}

/** Cross-checks the arithmetic and date of an extracted receipt; never throws. */
export function validateReceipt(r: Receipt, today = new Date()): Warning[] {
  const warnings: Warning[] = [];

  const itemsSum = r.lineItems.reduce((sum, item) => sum + item.total, 0);
  if (differs(itemsSum, r.subtotal)) warnings.push("line_items_mismatch");
  if (differs(r.subtotal + r.tax, r.total)) warnings.push("total_mismatch");

  const latest = today.toISOString().slice(0, 10);
  if (!isRealDate(r.date) || r.date < EARLIEST_DATE || r.date > latest) warnings.push("suspicious_date");

  return warnings;
}
