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
type RadarScanRunStatus = "done" | "partial" | "skipped" | "failed";

interface SignalCollectionAttempt {
  readonly collected: Awaited<ReturnType<typeof collectSignals>>;
  readonly retryAttempted: boolean;
  readonly adapterUnavailable: boolean;
}

const RETRYABLE_SIGNAL_FAILURE_STAGE = "signal_retry_once";
const ADAPTER_UNAVAILABLE_TOKEN = "adapter_unavailable";

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
): Promise<RadarScanRunStatus> {
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
    await repository.updateScanStatus(scan.id, {
      status: "scoring",
      stageDetail: stageWithFallback("scoring", expanded.status),
    });

    const signalCandidates = expanded.keywords.slice(0, options.signalLimit ?? 30);
    const signalAttempt = await collectSignalsWithRetry(
      scan.id,
      signalCandidates,
      repository,
      options,
      now,
    );
    const { collected } = signalAttempt;
    const signalStatus = signalRunStatus(collected.status);
    if (signalStatus === "failed") {
      await repository.updateScanStatus(scan.id, {
        status: "failed",
        stageDetail: finalStageDetail("failed", {
          retryAttempted: signalAttempt.retryAttempted,
          adapterUnavailable: signalAttempt.adapterUnavailable,
          fallbackUsed: expanded.status === "fallback",
        }),
        finishedAt: new Date(),
        ...errorMessagePatch("failed", collected, signalAttempt.adapterUnavailable, "skipped"),
      });
      return "failed";
    }
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

    const finalStatus =
      signalStatus === "done" && probeStatus === "failed" ? "partial" : signalStatus;
    await repository.updateScanStatus(scan.id, {
      status: finalStatus,
      stageDetail: finalStageDetail(finalStatus, {
        retryAttempted: signalAttempt.retryAttempted,
        adapterUnavailable: signalAttempt.adapterUnavailable,
        fallbackUsed: expanded.status === "fallback",
      }),
      finishedAt: new Date(),
      ...errorMessagePatch(finalStatus, collected, signalAttempt.adapterUnavailable, probeStatus),
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
async function collectSignalsWithRetry(
  scanId: string,
  signalCandidates: readonly KeywordCandidate[],
  repository: RadarScanRepository,
  options: RadarScanJobOptions,
  now: Date,
): Promise<SignalCollectionAttempt> {
  const first = await collectSignals(signalCandidates, {
    ...options.signalOptions,
    now,
  });
  const adapterUnavailable = hasAdapterUnavailableError(first);

  if (first.status !== "failed" || adapterUnavailable) {
    return { collected: first, retryAttempted: false, adapterUnavailable };
  }

  await repository.updateScanStatus(scanId, {
    status: "scoring",
    stageDetail: RETRYABLE_SIGNAL_FAILURE_STAGE,
  });

  const retry = await collectSignals(signalCandidates, {
    ...options.signalOptions,
    now,
  });

  return {
    collected: retry,
    retryAttempted: true,
    adapterUnavailable: hasAdapterUnavailableError(retry),
  };
}

function signalRunStatus(
  status: Awaited<ReturnType<typeof collectSignals>>["status"],
): RadarScanRunStatus {
  return status === "complete" ? "done" : status;
}

function finalStageDetail(
  status: RadarScanRunStatus,
  metadata: {
    readonly retryAttempted: boolean;
    readonly adapterUnavailable: boolean;
    readonly fallbackUsed: boolean;
  },
): string {
  const tokens: string[] = [status];
  if (metadata.retryAttempted) tokens.push("retry_once");
  if (metadata.adapterUnavailable) tokens.push(ADAPTER_UNAVAILABLE_TOKEN);
  if (metadata.fallbackUsed) tokens.push("fallback");
  return tokens.join("_");
}

function stageWithFallback(
  stage: string,
  expansionStatus: Awaited<ReturnType<typeof expand>>["status"],
): string {
  return expansionStatus === "fallback" ? `${stage}_fallback` : stage;
}

function errorMessagePatch(
  finalStatus: RadarScanRunStatus,
  collected: Awaited<ReturnType<typeof collectSignals>>,
  adapterUnavailable: boolean,
  probeStatus: "skipped" | "done" | "failed",
): Pick<NewRadarScan, "errorMessage"> {
  if (finalStatus === "done") {
    return { errorMessage: null };
  }
  if (probeStatus === "failed") {
    return {};
  }
  if (finalStatus !== "failed" && finalStatus !== "partial") {
    return {};
  }

  const message = adapterUnavailable
    ? "radar signal adapter unavailable"
    : signalCollectionMessage(collected);

  return { errorMessage: message };
}

function signalCollectionMessage(collected: Awaited<ReturnType<typeof collectSignals>>): string {
  const errors = Object.entries(collected.channelStatus)
    .filter(([, status]) => status.status === "failed" && status.error)
    .map(([channel, status]) => `${channel}=${status.error}`);

  return errors.length > 0
    ? `radar signal collection ${collected.status}: ${errors.join("; ")}`
    : `radar signal collection ${collected.status}`;
}

function hasAdapterUnavailableError(
  collected: Awaited<ReturnType<typeof collectSignals>>,
): boolean {
  return Object.values(collected.channelStatus).some((status) =>
    status.error?.includes("RADAR_SIGNAL_ADAPTER_UNAVAILABLE"),
  );
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
