import { z } from "zod";

export const CATEGORIES = [
  "groceries",
  "dining",
  "transport",
  "shopping",
  "utilities",
  "travel",
  "health",
  "other",
] as const;

export const LineItemSchema = z.object({
  description: z.string().describe("Item name as printed on the receipt"),
  quantity: z.number(),
  unitPrice: z.number(),
  total: z.number().describe("Line total after quantity"),
});

export const ReceiptSchema = z.object({
  merchant: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Purchase date as YYYY-MM-DD"),
  currency: z.string().regex(/^[A-Z]{3}$/).describe("ISO 4217 code, e.g. USD"),
  lineItems: z.array(LineItemSchema),
  subtotal: z.number().describe("Sum of line items before tax"),
  tax: z.number(),
  total: z.number().describe("Amount charged, tax included"),
  category: z.enum(CATEGORIES),
});

export type Receipt = z.infer<typeof ReceiptSchema>;
