import type {
  NewRadarKeyword,
  NewRadarScan,
  NewRadarSubscription,
  RadarKeyword,
  RadarScan,
  RadarSubscription,
} from "@boina/db";
import type { GeoValidator } from "@boina/engine/v2/geo-validator";
import {
  type CollectSignalsOptions,
  type KeywordCandidate,
  type KeywordSignal,
  collectSignals,
  expand,
  naverScore,
} from "@radar/keyword-pipeline";
import { attachAiProbeEvidence } from "./radar-ai-probe.js";

export interface RadarScanTarget {
  readonly subscriptionId: string;
  readonly businessId: string;
  readonly businessName: string;
  readonly region: string | null;
  readonly category: string | null;
  readonly homepageUrl?: string | null;
  readonly naverPlaceId?: string | null;
}

export interface RadarScanRepository {
  findDueScanTargets(now: Date): Promise<readonly RadarScanTarget[]>;
  createScan(input: NewRadarScan): Promise<RadarScan | undefined>;
  updateScanStatus(
    scanId: string,
    patch: Pick<
      NewRadarScan,
      "status" | "stageDetail" | "errorMessage" | "startedAt" | "finishedAt"
    >,
  ): Promise<RadarScan | undefined>;
  insertKeywords(input: readonly NewRadarKeyword[]): Promise<readonly RadarKeyword[]>;
  upsertSubscription(input: NewRadarSubscription): Promise<RadarSubscription | undefined>;
}

export interface RadarScanJobOptions {
  readonly now?: Date;
  readonly keywordLimit?: number;
  readonly signalLimit?: number;
  readonly probeLimit?: number;
  readonly signalOptions: Omit<CollectSignalsOptions, "now">;
  readonly geoValidator?: GeoValidator;
}

export interface RadarScanJobResult {
  readonly processed: number;
  readonly completed: number;
  readonly partial: number;
  readonly skipped: number;
  readonly failed: number;
}

export async function processDueRadarScans(
  repository: RadarScanRepository,
  options: RadarScanJobOptions,
): Promise<RadarScanJobResult> {
  const now = options.now ?? new Date();
  const targets = await repository.findDueScanTargets(now);
  const result = { processed: 0, completed: 0, partial: 0, skipped: 0, failed: 0 };

  for (const target of targets) {
    result.processed += 1;
    const status = await runRadarScan(target, repository, options, now);
    if (status === "done") result.completed += 1;
    else if (status === "partial") result.partial += 1;
    else if (status === "skipped") result.skipped += 1;
    else result.failed += 1;
  }

  return result;
}

async function runRadarScan(
  target: RadarScanTarget,
  repository: RadarScanRepository,
  options: RadarScanJobOptions,
  now: Date,
): Promise<"done" | "partial" | "skipped" | "failed"> {
  const scan = await repository.createScan({
    subscriptionId: target.subscriptionId,
    businessId: target.businessId,
    trigger: "auto",
    status: "expanding",
    stageDetail: "expanding",
    startedAt: now,
  });

  if (!scan) {
    return "failed";
  }

  try {
    const expanded = await expand(seedForTarget(target), {
      limit: options.keywordLimit ?? 30,
    });
    await repository.updateScanStatus(scan.id, { status: "scoring", stageDetail: "scoring" });

    const signalCandidates = expanded.keywords.slice(0, options.signalLimit ?? 30);
    const collected = await collectSignals(signalCandidates, {
      ...options.signalOptions,
      now,
    });
    const scored = collected.signals.map(signalToKeywordRow(scan.id));
    const { keywords, probeStatus } = await attachAiProbeEvidence({
      target,
      keywords: scored,
      repository,
      scanId: scan.id,
      probeLimit: options.probeLimit,
      geoValidator: options.geoValidator,
    });

    await repository.insertKeywords(keywords);

    const signalStatus =
      collected.status === "complete"
        ? "done"
        : collected.status === "failed"
          ? "failed"
          : collected.status;
    const finalStatus =
      signalStatus === "done" && probeStatus === "failed" ? "partial" : signalStatus;
    await repository.updateScanStatus(scan.id, {
      status: finalStatus,
      stageDetail: finalStatus,
      finishedAt: new Date(),
      ...(finalStatus === "failed" ? { errorMessage: "radar signal collection failed" } : {}),
    });
    await repository.upsertSubscription({
      id: target.subscriptionId,
      businessId: target.businessId,
      lastScanAt: now,
      nextScanAt: nextMondayMorningKst(now),
    });

    return finalStatus;
  } catch (error) {
    await repository.updateScanStatus(scan.id, {
      status: "failed",
      stageDetail: "failed",
      errorMessage: error instanceof Error ? error.message : String(error),
      finishedAt: new Date(),
    });
    return "failed";
  }
}

function seedForTarget(target: RadarScanTarget): string {
  return [target.region, target.businessName, target.category].filter(Boolean).join(" ");
}

function signalToKeywordRow(scanId: string) {
  return (signal: KeywordSignal): NewRadarKeyword => {
    const score = naverScore(signal);
    return {
      scanId,
      text: signal.keyword.text,
      clusterId: signal.keyword.clusterId,
      freq: freqForKeyword(signal.keyword),
      hop: signal.keyword.hop,
      viaToken: signal.keyword.viaToken,
      naverScore: score.score,
      naverEvidence: score.evidence,
      verdict: verdictForScore(score.score),
    };
  };
}

function freqForKeyword(keyword: KeywordCandidate): number {
  return keyword.hop === 0 ? 1 : 0;
}

function verdictForScore(score: number): "now" | "good" | "normal" | "watch" {
  if (score >= 80) return "now";
  if (score >= 65) return "good";
  if (score >= 45) return "normal";
  return "watch";
}

function nextMondayMorningKst(now: Date): Date {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const day = kst.getUTCDay();
  const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7;
  const next = new Date(
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + daysUntilMonday, 6, 0, 0),
  );
  return new Date(next.getTime() - 9 * 60 * 60 * 1000);
}
