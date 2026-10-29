import { type Db, MongoClient } from "mongodb";

export interface Database {
  db: Db;
  close(): Promise<void>;
}

/** One client per process; the driver pools connections internally. */
export async function connectDb(uri: string, dbName: string): Promise<Database> {
  const client = await MongoClient.connect(uri);
  return { db: client.db(dbName), close: () => client.close() };
}
