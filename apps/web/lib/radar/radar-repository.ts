import { type RadarRepository, createRadarRepository } from "@boina/db";
import { type DbClient, createDb } from "@boina/db/client";

let singletonDb: DbClient | null = null;

function getDb(): DbClient {
  if (singletonDb) return singletonDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  singletonDb = createDb(url);
  return singletonDb;
}

export function getDefaultRadarRepository(): RadarRepository {
  return createRadarRepository(getDb());
}
