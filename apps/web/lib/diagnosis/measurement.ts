import type { BusinessPresenceModel, LlmValidation } from "@boina/contracts/diagnosis";

export type MeasurementLabel = "measured" | "estimated" | "unavailable";

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
  const filtered = values.filter((value): value is string => typeof value === "string" && value.length > 0);
  if (filtered.length === 0) return undefined;
  return [...filtered].sort().at(-1);
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
