import type { NewRadarKeyword, NewRadarScan } from "@boina/db";
import type { GeoValidationResult, GeoValidator } from "@boina/engine/v2/geo-validator";

export interface RadarAiProbeTarget {
  readonly businessName: string;
  readonly region: string | null;
  readonly category: string | null;
  readonly homepageUrl?: string | null;
  readonly naverPlaceId?: string | null;
}

export interface RadarAiProbeRepository {
  updateScanStatus(
    scanId: string,
    patch: Pick<NewRadarScan, "status" | "stageDetail" | "errorMessage">,
  ): Promise<unknown>;
}

export interface AttachRadarAiProbeInput {
  readonly target: RadarAiProbeTarget;
  readonly keywords: readonly NewRadarKeyword[];
  readonly repository: RadarAiProbeRepository;
  readonly scanId: string;
  readonly probeLimit?: number;
  readonly geoValidator?: GeoValidator;
}

export interface RadarAiProbeResult {
  readonly keywords: readonly NewRadarKeyword[];
  readonly probeStatus: "skipped" | "done" | "failed";
}

export async function attachAiProbeEvidence(
  input: AttachRadarAiProbeInput,
): Promise<RadarAiProbeResult> {
  const validator = input.geoValidator;
  if (!validator?.isAvailable() || input.keywords.length === 0) {
    return { keywords: input.keywords, probeStatus: "skipped" };
  }

  const topKeywords = [...input.keywords]
    .sort((a, b) => (b.naverScore ?? 0) - (a.naverScore ?? 0))
    .slice(0, input.probeLimit ?? 5);
  const probedTexts = new Set(topKeywords.map((keyword) => keyword.text));

  try {
    await input.repository.updateScanStatus(input.scanId, {
      status: "probing",
      stageDetail: "probing",
    });
    const probe = await validator.validate({
      url: probeUrlForTarget(input.target),
      businessName: input.target.businessName,
      industry: input.target.category ?? "가게",
      region: input.target.region ?? "",
      targetKeywords: topKeywords.map((keyword) => keyword.text),
    });
    const aiScore = aiScoreFromProbe(probe);
    const aiEvidence = aiEvidenceFromProbe(probe);
    return {
      keywords: input.keywords.map((keyword) =>
        probedTexts.has(keyword.text) ? { ...keyword, aiScore, aiEvidence } : keyword,
      ),
      probeStatus: "done",
    };
  } catch (error) {
    await input.repository.updateScanStatus(input.scanId, {
      status: "partial",
      stageDetail: "probing_failed",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return { keywords: input.keywords, probeStatus: "failed" };
  }
}

function probeUrlForTarget(target: RadarAiProbeTarget): string {
  if (target.homepageUrl?.trim()) return target.homepageUrl.trim();
  if (target.naverPlaceId?.trim()) {
    return `https://place.naver.com/restaurant/${target.naverPlaceId.trim()}`;
  }
  return "";
}

function aiScoreFromProbe(probe: GeoValidationResult): number {
  const score =
    probe.metrics.mentionRate * 70 +
    probe.metrics.directMentionRate * 20 +
    probe.metrics.urlRate * 10;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function aiEvidenceFromProbe(
  probe: GeoValidationResult,
): NonNullable<NewRadarKeyword["aiEvidence"]> {
  const mentioned = probe.citations.filter((citation) => citation.hasMention).length;
  const total = probe.citations.length;
  return {
    probeSummary: `AI 응답 ${total}건 중 가게명 언급 ${mentioned}건`,
    citedSources: probe.citations
      .filter((citation) => citation.hasMention || citation.hasUrl)
      .slice(0, 3)
      .map((citation) => `${citation.facet}: ${citation.query}`),
    blogGap: `언급률 ${Math.round(probe.metrics.mentionRate * 100)}%, 직접 언급률 ${Math.round(
      probe.metrics.directMentionRate * 100,
    )}%`,
    checkedAt: probe.validatedAt,
    source: probe.source,
  };
}
