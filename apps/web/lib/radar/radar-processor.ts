import { createRadarRepository } from "@boina/db";
import { type DbClient, createDb } from "@boina/db/client";
import { ChatMockGeoValidator } from "@boina/engine/v2/geo-validator";
import type { KeywordSignalClient } from "@radar/keyword-pipeline";
import { type RadarScanJobResult, processDueRadarScans } from "./radar-scan-job.js";

let singletonDb: DbClient | null = null;

function getDb(): DbClient {
  if (singletonDb) return singletonDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  singletonDb = createDb(url);
  return singletonDb;
}

function missingNaverSignal(): never {
  throw new Error("Naver radar signal credentials are not configured");
}

export function createEnvRadarSignalClient(): KeywordSignalClient {
  return {
    async fetchBlog() {
      missingNaverSignal();
    },
    async fetchSearchAd() {
      missingNaverSignal();
    },
    async fetchDatalab() {
      missingNaverSignal();
    },
  };
}

export async function processRadarScanQueue(now = new Date()): Promise<RadarScanJobResult> {
  const db = getDb();
  const repository = createRadarRepository(db);
  return processDueRadarScans(repository, {
    now,
    signalOptions: { client: createEnvRadarSignalClient() },
    geoValidator: new ChatMockGeoValidator(),
  });
}
