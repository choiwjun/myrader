export type ChannelName = "blog" | "searchAd" | "datalab";

export type ChannelRunStatus = "complete" | "skipped" | "failed";

export type PipelineRunStatus = "complete" | "partial" | "skipped" | "failed";

export type KeywordState = "good" | "mid" | "wait";

export interface KeywordCandidate {
  readonly text: string;
  readonly clusterId: string;
  readonly hop: number;
  readonly viaToken?: string;
  readonly fallback?: boolean;
}

export interface KeywordExpansionSource {
  suggest(seed: string): Promise<readonly string[]>;
}

export interface ExpandOptions {
  readonly limit?: number;
  readonly source?: KeywordExpansionSource;
}

export interface ExpandResult {
  readonly status: "complete" | "fallback" | "partial";
  readonly seed: string;
  readonly keywords: readonly KeywordCandidate[];
  readonly warnings: readonly string[];
}

export interface BlogSignal {
  readonly docs: number | null;
  readonly checkedAt?: string;
}

export interface SearchAdSignal {
  readonly monthlySearches: number | null;
  readonly checkedAt?: string;
}

export interface DatalabSignal {
  readonly trend7d: number | null;
  readonly checkedAt?: string;
}

export interface KeywordSignalClient {
  fetchBlog(keyword: KeywordCandidate): Promise<BlogSignal>;
  fetchSearchAd(keyword: KeywordCandidate): Promise<SearchAdSignal>;
  fetchDatalab(keyword: KeywordCandidate): Promise<DatalabSignal>;
}

export interface ChannelStatus {
  readonly status: ChannelRunStatus;
  readonly used: number;
  readonly budget: number | null;
  readonly error?: string;
}

export type ChannelStatusMap = Readonly<Record<ChannelName, ChannelStatus>>;

export interface QuotaBudget {
  readonly dailyBudget: number;
  readonly used: number;
}

export type QuotaBudgetMap = Readonly<Partial<Record<ChannelName, QuotaBudget>>>;

export interface QuotaGuard {
  canSpend(channel: ChannelName, units?: number): boolean;
  spend(channel: ChannelName, units?: number): boolean;
  snapshot(channel: ChannelName): ChannelStatus;
}

export interface KeywordSignalEvidence {
  readonly volume: number | null;
  readonly docs: number | null;
  readonly saturation: number | null;
  readonly trend7d: number | null;
  readonly checkedAt: string;
}

export interface KeywordSignal {
  readonly keyword: KeywordCandidate;
  readonly evidence: KeywordSignalEvidence;
  readonly channels: Readonly<Record<ChannelName, ChannelRunStatus>>;
}

export interface CollectSignalsOptions {
  readonly client: KeywordSignalClient;
  readonly quotaGuard?: QuotaGuard;
  readonly now?: Date;
}

export interface CollectSignalsResult {
  readonly status: PipelineRunStatus;
  readonly signals: readonly KeywordSignal[];
  readonly channelStatus: ChannelStatusMap;
}

export interface NaverScoreResult {
  readonly keyword: KeywordCandidate;
  readonly score: number;
  readonly state: KeywordState;
  readonly evidence: KeywordSignalEvidence;
  readonly reasons: readonly string[];
  readonly components: {
    readonly volume: number;
    readonly saturation: number;
    readonly trend: number;
    readonly confidence: number;
  };
}

const CHANNELS: readonly ChannelName[] = ["blog", "searchAd", "datalab"];
const DEFAULT_LIMIT = 30;
const FALLBACK_MODIFIERS = [
  "후기",
  "추천",
  "가격",
  "예약",
  "근처",
  "메뉴",
  "맛집",
  "위치",
] as const;

const CHANNEL_LABELS: Readonly<Record<ChannelName, string>> = {
  blog: "blog",
  searchAd: "searchAd",
  datalab: "datalab",
};

export async function expand(seed: string, options: ExpandOptions = {}): Promise<ExpandResult> {
  const normalizedSeed = normalizeKeyword(seed);
  if (!normalizedSeed) {
    throw new Error("seed is required");
  }

  const limit = clampPositiveInteger(options.limit ?? DEFAULT_LIMIT, DEFAULT_LIMIT);
  const warnings: string[] = [];
  const candidates = new Map<string, KeywordCandidate>();

  addCandidate(candidates, {
    text: normalizedSeed,
    clusterId: firstToken(normalizedSeed),
    hop: 0,
    fallback: false,
  });

  let sourceSuggestions: readonly string[] = [];
  if (options.source) {
    try {
      sourceSuggestions = await options.source.suggest(normalizedSeed);
    } catch (error) {
      warnings.push(`expansion_source_failed:${errorMessage(error)}`);
    }
  }

  for (const suggestion of sourceSuggestions) {
    const text = normalizeKeyword(suggestion);
    if (text) {
      addCandidate(candidates, {
        text,
        clusterId: sharedClusterId(normalizedSeed, text),
        hop: 1,
        fallback: false,
      });
    }
    if (candidates.size >= limit) {
      break;
    }
  }

  if (candidates.size < limit) {
    if (sourceSuggestions.length === 0) {
      warnings.push("expansion_source_empty");
    } else {
      warnings.push("expansion_source_partial");
    }

    for (const candidate of fallbackCandidates(normalizedSeed)) {
      addCandidate(candidates, candidate);
      if (candidates.size >= limit) {
        break;
      }
    }
  }

  const keywords = [...candidates.values()].slice(0, limit);
  const status =
    sourceSuggestions.length === 0 ? "fallback" : candidates.size < limit ? "partial" : "complete";

  return {
    status,
    seed: normalizedSeed,
    keywords,
    warnings,
  };
}

export function createQuotaGuard(budgets: QuotaBudgetMap): QuotaGuard {
  const mutable = new Map<ChannelName, { dailyBudget: number; used: number }>();
  for (const channel of CHANNELS) {
    const budget = budgets[channel];
    if (budget) {
      mutable.set(channel, {
        dailyBudget: Math.max(0, budget.dailyBudget),
        used: Math.max(0, budget.used),
      });
    }
  }

  return {
    canSpend(channel: ChannelName, units = 1): boolean {
      const budget = mutable.get(channel);
      if (!budget) {
        return true;
      }
      return budget.used + units <= budget.dailyBudget;
    },
    spend(channel: ChannelName, units = 1): boolean {
      const budget = mutable.get(channel);
      if (!budget) {
        return true;
      }
      if (budget.used + units > budget.dailyBudget) {
        return false;
      }
      budget.used += units;
      return true;
    },
    snapshot(channel: ChannelName): ChannelStatus {
      const budget = mutable.get(channel);
      return {
        status: "complete",
        used: budget?.used ?? 0,
        budget: budget?.dailyBudget ?? null,
      };
    },
  };
}

export async function collectSignals(
  keywords: readonly KeywordCandidate[],
  options: CollectSignalsOptions,
): Promise<CollectSignalsResult> {
  const now = (options.now ?? new Date()).toISOString();
  const channelCounters = createChannelCounters(options.quotaGuard);
  const signals: KeywordSignal[] = [];

  for (const keyword of keywords) {
    const blog = await readChannel("blog", keyword, options, channelCounters);
    const searchAd = await readChannel("searchAd", keyword, options, channelCounters);
    const datalab = await readChannel("datalab", keyword, options, channelCounters);

    const blogValue = blog.value && "docs" in blog.value ? blog.value : null;
    const searchAdValue =
      searchAd.value && "monthlySearches" in searchAd.value ? searchAd.value : null;
    const datalabValue = datalab.value && "trend7d" in datalab.value ? datalab.value : null;
    const docs = blogValue?.docs ?? null;
    const volume = searchAdValue?.monthlySearches ?? null;
    const trend7d = datalabValue?.trend7d ?? null;
    const checkedAt =
      datalabValue?.checkedAt ?? searchAdValue?.checkedAt ?? blogValue?.checkedAt ?? now;

    signals.push({
      keyword,
      evidence: {
        volume,
        docs,
        saturation: calculateSaturation(docs, volume),
        trend7d,
        checkedAt,
      },
      channels: {
        blog: blog.status,
        searchAd: searchAd.status,
        datalab: datalab.status,
      },
    });
  }

  const channelStatus = finalizeChannelStatus(channelCounters, options.quotaGuard);

  return {
    status: summarizePipelineStatus(signals),
    signals,
    channelStatus,
  };
}

export function naverScore(signal: KeywordSignal): NaverScoreResult {
  const volumeComponent = scoreVolume(signal.evidence.volume);
  const saturationComponent = scoreSaturation(signal.evidence.saturation);
  const trendComponent = scoreTrend(signal.evidence.trend7d);
  const confidenceComponent = scoreConfidence(signal.channels);
  const relatednessComponent = scoreRelatedness(signal.keyword);

  const score = clampScore(
    relatednessComponent * 0.15 +
      volumeComponent * 0.35 +
      saturationComponent * 0.3 +
      trendComponent * 0.1 +
      confidenceComponent * 0.1,
  );

  return {
    keyword: signal.keyword,
    score,
    state: score >= 70 ? "good" : score >= 45 ? "mid" : "wait",
    evidence: signal.evidence,
    reasons: scoreReasons(signal.evidence, score),
    components: {
      volume: volumeComponent,
      saturation: saturationComponent,
      trend: trendComponent,
      confidence: confidenceComponent,
    },
  };
}

function createChannelCounters(
  quotaGuard: QuotaGuard | undefined,
): Map<ChannelName, MutableChannelStatus> {
  const counters = new Map<ChannelName, MutableChannelStatus>();
  for (const channel of CHANNELS) {
    const snapshot = quotaGuard?.snapshot(channel);
    counters.set(channel, {
      status: "complete",
      used: snapshot?.used ?? 0,
      budget: snapshot?.budget ?? null,
    });
  }
  return counters;
}

async function readChannel(
  channel: ChannelName,
  keyword: KeywordCandidate,
  options: CollectSignalsOptions,
  counters: Map<ChannelName, MutableChannelStatus>,
): Promise<ChannelValue> {
  const counter = requireCounter(counters, channel);
  if (options.quotaGuard && !options.quotaGuard.spend(channel)) {
    counter.status = counter.status === "failed" ? "failed" : "skipped";
    return { status: "skipped", value: null };
  }

  try {
    const value = await fetchChannelValue(channel, keyword, options.client);
    const snapshot = options.quotaGuard?.snapshot(channel);
    counter.used = snapshot?.used ?? counter.used + 1;
    counter.budget = snapshot?.budget ?? counter.budget;
    return { status: "complete", value };
  } catch (error) {
    counter.status = "failed";
    counter.error = errorMessage(error);
    return { status: "failed", value: null };
  }
}

async function fetchChannelValue(
  channel: ChannelName,
  keyword: KeywordCandidate,
  client: KeywordSignalClient,
): Promise<BlogSignal | SearchAdSignal | DatalabSignal> {
  switch (channel) {
    case "blog":
      return client.fetchBlog(keyword);
    case "searchAd":
      return client.fetchSearchAd(keyword);
    case "datalab":
      return client.fetchDatalab(keyword);
  }
}

function finalizeChannelStatus(
  counters: Map<ChannelName, MutableChannelStatus>,
  quotaGuard: QuotaGuard | undefined,
): ChannelStatusMap {
  const entries = CHANNELS.map((channel) => {
    const counter = requireCounter(counters, channel);
    const snapshot = quotaGuard?.snapshot(channel);
    return [
      channel,
      {
        status: counter.status,
        used: snapshot?.used ?? counter.used,
        budget: snapshot?.budget ?? counter.budget,
        ...(counter.error ? { error: counter.error } : {}),
      },
    ] as const;
  });
  return Object.fromEntries(entries) as ChannelStatusMap;
}

function summarizePipelineStatus(signals: readonly KeywordSignal[]): PipelineRunStatus {
  const statuses = signals.flatMap((signal) => CHANNELS.map((channel) => signal.channels[channel]));
  if (statuses.length === 0) {
    return "skipped";
  }
  if (statuses.every((status) => status === "complete")) {
    return "complete";
  }
  if (statuses.every((status) => status === "skipped")) {
    return "skipped";
  }
  if (statuses.every((status) => status === "failed")) {
    return "failed";
  }
  return "partial";
}

function fallbackCandidates(seed: string): readonly KeywordCandidate[] {
  const tokens = tokenize(seed);
  const primary = tokens[0] ?? seed;
  const candidates: KeywordCandidate[] = [];

  for (const token of tokens) {
    if (token !== seed) {
      candidates.push({
        text: `${seed} ${token}`,
        clusterId: token,
        hop: 1,
        viaToken: token,
        fallback: true,
      });
    }
  }

  for (const modifier of FALLBACK_MODIFIERS) {
    for (const token of tokens) {
      candidates.push({
        text: `${seed} ${modifier}`,
        clusterId: token,
        hop: 1,
        viaToken: token,
        fallback: true,
      });
    }
  }

  for (const modifier of FALLBACK_MODIFIERS) {
    candidates.push({
      text: `${primary} ${modifier}`,
      clusterId: primary,
      hop: 2,
      viaToken: primary,
      fallback: true,
    });
  }

  return candidates;
}

function addCandidate(
  candidates: Map<string, KeywordCandidate>,
  candidate: KeywordCandidate,
): void {
  const text = normalizeKeyword(candidate.text);
  if (!text || candidates.has(text)) {
    return;
  }
  candidates.set(text, {
    ...candidate,
    text,
    clusterId: normalizeKeyword(candidate.clusterId) || firstToken(text),
  });
}

function normalizeKeyword(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function tokenize(value: string): readonly string[] {
  return normalizeKeyword(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function firstToken(value: string): string {
  return tokenize(value)[0] ?? value;
}

function sharedClusterId(seed: string, text: string): string {
  const seedTokens = tokenize(seed);
  const textTokens = new Set(tokenize(text));
  return seedTokens.find((token) => textTokens.has(token)) ?? firstToken(text);
}

function clampPositiveInteger(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
}

function calculateSaturation(docs: number | null, volume: number | null): number | null {
  if (docs === null || volume === null || volume <= 0) {
    return null;
  }
  return roundToTwo(docs / volume);
}

function scoreVolume(volume: number | null): number {
  if (volume === null || volume <= 0) {
    return 15;
  }
  return clampScore((Math.log10(volume + 1) / Math.log10(10000)) * 100);
}

function scoreSaturation(saturation: number | null): number {
  if (saturation === null) {
    return 40;
  }
  if (saturation <= 0.25) {
    return 95;
  }
  if (saturation <= 0.8) {
    return 75;
  }
  if (saturation <= 1.5) {
    return 55;
  }
  return 30;
}

function scoreTrend(trend7d: number | null): number {
  if (trend7d === null) {
    return 45;
  }
  return clampScore(50 + trend7d * 150);
}

function scoreConfidence(channels: Readonly<Record<ChannelName, ChannelRunStatus>>): number {
  const completeCount = CHANNELS.filter((channel) => channels[channel] === "complete").length;
  return Math.round((completeCount / CHANNELS.length) * 100);
}

function scoreRelatedness(keyword: KeywordCandidate): number {
  if (keyword.hop === 0) {
    return 100;
  }
  if (keyword.hop === 1) {
    return 82;
  }
  return 65;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function scoreReasons(evidence: KeywordSignalEvidence, score: number): readonly string[] {
  const reasons: string[] = [];
  if ((evidence.volume ?? 0) >= 1000) {
    reasons.push("검색량이 충분해요");
  }
  if ((evidence.saturation ?? Number.POSITIVE_INFINITY) <= 0.5) {
    reasons.push("문서 수에 비해 찾는 사람이 많아요");
  }
  if ((evidence.trend7d ?? 0) > 0.1) {
    reasons.push("최근 7일 관심이 오르고 있어요");
  }
  if (score < 45) {
    reasons.push("아직은 지켜보는 편이 좋아요");
  }
  return reasons.length > 0 ? reasons : ["근거 신호가 일부만 들어왔어요"];
}

function requireCounter(
  counters: Map<ChannelName, MutableChannelStatus>,
  channel: ChannelName,
): MutableChannelStatus {
  const counter = counters.get(channel);
  if (!counter) {
    throw new Error(`missing channel counter: ${CHANNEL_LABELS[channel]}`);
  }
  return counter;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

interface MutableChannelStatus {
  status: ChannelRunStatus;
  used: number;
  budget: number | null;
  error?: string;
}

interface ChannelValue {
  status: ChannelRunStatus;
  value: BlogSignal | SearchAdSignal | DatalabSignal | null;
}
