import type { BusinessPresenceModel, LlmValidation } from "@boina/contracts/diagnosis";

export type MeasurementLabel = "measured" | "estimated" | "unavailable";

export interface EvidenceItem {
  label: string;
  detail: string;
}

export const BUSINESS_PRESENCE_MEASUREMENT_CODE = "BOINA_MEASUREMENT_BUSINESS_PRESENCE";
export const LLM_VALIDATION_MEASUREMENT_CODE = "BOINA_MEASUREMENT_LLM_VALIDATION";

type MeasurementKind = "business_presence" | "llm_validation";

export interface StoredMeasurementEvidence<T = unknown> {
  measurementKind: MeasurementKind;
  source: string;
  measurementLabel: MeasurementLabel;
  found?: boolean;
  payload: T;
}

export interface PersistedMeasurementRowLike {
  channel: string;
  code: string;
  evidence: Record<string, unknown> | null;
  createdAt?: string;
  collectedAt?: string;
}

export interface MeasurementSnapshot<T> {
  source: string;
  collectedAt: string;
  measurementLabel: MeasurementLabel;
  found?: boolean;
  payload: T;
  evidence: StoredMeasurementEvidence<T>;
}

export function getBusinessPresenceMeasurement(
  rows: PersistedMeasurementRowLike[],
): MeasurementSnapshot<BusinessPresenceModel> | null {
  return readStoredMeasurement<BusinessPresenceModel>(
    rows,
    BUSINESS_PRESENCE_MEASUREMENT_CODE,
    "business_presence",
  );
}

export function getLlmValidationMeasurement(
  rows: PersistedMeasurementRowLike[],
): MeasurementSnapshot<LlmValidation> | null {
  return readStoredMeasurement<LlmValidation>(
    rows,
    LLM_VALIDATION_MEASUREMENT_CODE,
    "llm_validation",
  );
}

export function pickLatestTimestamp(values: Array<string | null | undefined>): string | undefined {
  const filtered = values.filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  if (filtered.length === 0) return undefined;
  return [...filtered].sort().at(-1);
}

export function normalizeEvidenceItems(raw: unknown, fallbackLabel = "확인 근거"): EvidenceItem[] {
  if (Array.isArray(raw)) {
    if (raw.length === 0) return [{ label: "확인 상태", detail: "아직 확인한 근거가 없어요." }];
    return raw.flatMap((item, index) =>
      normalizeEvidenceItems(item, `${fallbackLabel} ${index + 1}`),
    );
  }

  if (!raw || typeof raw !== "object") {
    return [{ label: fallbackLabel, detail: toOwnerFacingDetail(raw) }];
  }

  const record = raw as Record<string, unknown>;
  const rows: EvidenceItem[] = [];

  addKnownRow(rows, "출처", record.source);
  addKnownRow(rows, "수집일", record.collectedAt);
  addKnownRow(rows, "경쟁사", record.competitorName ?? record.name);
  addKnownRow(rows, "순위", record.serpRank ?? record.rank);
  addKnownRow(rows, "질문", record.sampleQuery);
  addKnownRow(rows, "언급 횟수", record.mentionedInQueries);
  addKnownRow(rows, "확인 결과", record.found ?? record.competitorHas);
  addKnownRow(rows, "측정 상태", record.measurementLabel);

  if (rows.length > 0) return rows;
  if ("reason" in record)
    return [{ label: "확인 상태", detail: toOwnerFacingDetail(record.reason) }];
  return [{ label: fallbackLabel, detail: "확인한 근거를 요약해 보관했어요." }];
}

function addKnownRow(rows: EvidenceItem[], label: string, value: unknown) {
  if (value === undefined || value === null || value === "") return;
  rows.push({ label, detail: toOwnerFacingDetail(value) });
}

function toOwnerFacingDetail(value: unknown): string {
  if (value === undefined || value === null || value === "") return "아직 확인되지 않았어요.";
  if (typeof value === "boolean") return value ? "확인됐어요." : "확인되지 않았어요.";
  if (typeof value === "number")
    return Number.isFinite(value) ? String(value) : "아직 확인되지 않았어요.";
  if (typeof value !== "string") return "확인한 근거를 요약해 보관했어요.";

  switch (value) {
    case "measured":
      return "직접 확인했어요.";
    case "estimated":
      return "준비도 기준으로 추정했어요.";
    case "unavailable":
    case "not_measured":
    case "gap_not_measured":
    case "competitor_reports_unavailable":
      return "아직 확인하지 못했어요.";
    case "engine_results":
      return "진단 결과";
    case "naver_place":
      return "네이버 플레이스";
    case "llm_validation":
      return "AI 직접 확인";
    case "website":
      return "가게 홈페이지";
    case "naver_serp":
      return "네이버 검색";
    case "gpt_grounded":
      return "AI 직접 확인";
    case "manual":
      return "직접 입력";
    default:
      return value;
  }
}

function readStoredMeasurement<T>(
  rows: PersistedMeasurementRowLike[],
  code: string,
  kind: MeasurementKind,
): MeasurementSnapshot<T> | null {
  const row = rows.find((candidate) => candidate.code === code);
  if (!row || !row.evidence) return null;
  const evidence = row.evidence as Partial<StoredMeasurementEvidence<T>>;
  if (evidence.measurementKind !== kind) return null;
  if (typeof evidence.source !== "string") return null;
  if (!isMeasurementLabel(evidence.measurementLabel)) return null;
  if (!("payload" in evidence)) return null;
  return {
    source: evidence.source,
    collectedAt: row.createdAt ?? row.collectedAt ?? "",
    measurementLabel: evidence.measurementLabel,
    ...(typeof evidence.found === "boolean" ? { found: evidence.found } : {}),
    payload: evidence.payload as T,
    evidence: evidence as StoredMeasurementEvidence<T>,
  };
}

function isMeasurementLabel(value: unknown): value is MeasurementLabel {
  return value === "measured" || value === "estimated" || value === "unavailable";
}
