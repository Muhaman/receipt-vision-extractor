import { type Collection, type Db, ObjectId } from "mongodb";
import { AppError } from "../errors.js";
import type { Receipt } from "./schema.js";
import type { Warning } from "./validate.js";

interface ReceiptDoc {
  _id: ObjectId;
  receipt: Receipt;
  warnings: Warning[];
  createdAt: Date;
}

export interface StoredReceipt {
  id: string;
  receipt: Receipt;
  warnings: Warning[];
  createdAt: string;
}

export interface Page {
  items: StoredReceipt[];
  nextCursor: string | null;
}

export type SpendGrouping = "category" | "month";

export interface SpendRow {
  key: string;
  currency: string;
  total: number;
  count: number;
}

const toStored = (doc: ReceiptDoc): StoredReceipt => ({
  id: doc._id.toHexString(),
  receipt: doc.receipt,
  warnings: doc.warnings,
  createdAt: doc.createdAt.toISOString(),
});

/** Parses a 24-hex ObjectId string; `ObjectId.isValid` also accepts any 12-char string. */
export function parseId(value: string): ObjectId {
  if (!/^[0-9a-f]{24}$/i.test(value)) throw new AppError(400, "invalid_id", "Not a valid receipt id.");
  return new ObjectId(value);
}

const GROUP_KEY: Record<SpendGrouping, unknown> = {
  category: "$receipt.category",
  month: { $substrBytes: ["$receipt.date", 0, 7] },
};

export class ReceiptRepo {
  private constructor(private readonly col: Collection<ReceiptDoc>) {}

  static async create(db: Db): Promise<ReceiptRepo> {
    const col = db.collection<ReceiptDoc>("receipts");
    await col.createIndex({ createdAt: -1 });
    return new ReceiptRepo(col);
  }

  async insert(receipt: Receipt, warnings: Warning[]): Promise<StoredReceipt> {
    const doc: ReceiptDoc = { _id: new ObjectId(), receipt, warnings, createdAt: new Date() };
    await this.col.insertOne(doc);
    return toStored(doc);
  }

  async get(id: ObjectId): Promise<StoredReceipt | null> {
    const doc = await this.col.findOne({ _id: id });
    return doc ? toStored(doc) : null;
  }

  /** Newest first; the cursor is the `_id` of the last item on the previous page. */
  async list(limit: number, cursor?: ObjectId): Promise<Page> {
    const docs = await this.col
      .find(cursor ? { _id: { $lt: cursor } } : {})
      .sort({ _id: -1 })
      .limit(limit + 1)
      .toArray();
    const hasMore = docs.length > limit;
    const items = docs.slice(0, limit).map(toStored);
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
  }

  /** Spend is grouped per (key, currency) so amounts in different currencies are never summed. */
  async spendBy(by: SpendGrouping): Promise<SpendRow[]> {
    return this.col
      .aggregate<SpendRow>([
        {
          $group: {
            _id: { key: GROUP_KEY[by], currency: "$receipt.currency" },
            total: { $sum: "$receipt.total" },
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            key: "$_id.key",
            currency: "$_id.currency",
            total: { $round: ["$total", 2] },
            count: 1,
          },
        },
        { $sort: { total: -1, key: 1, currency: 1 } },
      ])
      .toArray();
  }
}
