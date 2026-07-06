// @TASK 수정R2-A-1 - cross-process 잡 페이로드 복원 (cron 프로세스 drain 용)
// @SPEC docs/planning/02-trd.md §3 (잡 상태 → diagnosis)
// @SPEC packages/db/src/schema/{diagnosis,business}.ts (기존 행 read only — 스키마 변경 0)
// @TEST apps/web/tests/diagnosis/job-payload-resolver.test.ts
//
// 배경: DbBackedJobQueue 는 잡 type/payload 를 인메모리 메타에 보관한다. 같은 프로세스에서
// enqueue→drain 하면 full fidelity 로 처리되지만, 별도 프로세스(cron 트리거 /api/jobs/process)가
// drain 하면 그 프로세스엔 메타가 없어 잡을 건너뛴다(고아 잡). 이 복원기는 메타 없는 잡을
// diagnoses+businesses 행(기존 데이터)으로부터 최소·유효 payload 로 재구성해 복구 처리하게 한다.
//
// 우선순위:
//   1) diagnoses.job_payload 에 저장된 validated payload 그대로 사용한다(동일성 보장).
//   2) 구버전 행(job_payload 없음)만 businesses 실데이터로 보수적 fallback 복원한다.
//      이 fallback 은 legacy 안전망이며, 원래 enqueue payload 와 다를 수 있음을 전제로 한다.

import type { DbClient } from "@boina/db/client";
import { businesses, diagnoses } from "@boina/db/schema";
import { eq } from "drizzle-orm";
import {
  DEFAULT_DIAGNOSIS_MODULES,
  type DiagnosisJobPayload,
  buildDiagnosisJobPayload,
  parseStoredDiagnosisJobPayload,
} from "./job-payload.js";

/** 복원기가 반환하는 잡 메타(type + payload). queue 가 핸들러 라우팅·실행에 사용. */
export interface ResolvedJob {
  type: string;
  payload: DiagnosisJobPayload;
}

/**
 * diagnoses+businesses 행으로부터 진단 잡 payload 를 재구성한다(cross-process 복구).
 *
 * - 진단 행이 없으면 null(처리 대상 아님).
 * - diagnoses.job_payload 가 있으면 그 validated 원문을 그대로 반환한다.
 * - business 행이 없으면(고아 진단) null — fallback 복원 불가(추측 금지).
 * - fallback target: homepageUrl > naverPlaceId > 이름 기반 네이버 검색 URL.
 * - fallback businessProfile 은 businesses 실데이터만 사용한다.
 *
 * @returns 재구성된 잡 또는 null(복원 불가 — queue 가 건너뜀).
 */
export async function resolveDiagnosisJobPayload(
  db: DbClient,
  diagnosisId: string,
  jobType: string,
): Promise<ResolvedJob | null> {
  const [diag] = await db
    .select({
      id: diagnoses.id,
      businessId: diagnoses.businessId,
      jobType: diagnoses.jobType,
      jobPayload: diagnoses.jobPayload,
    })
    .from(diagnoses)
    .where(eq(diagnoses.id, diagnosisId))
    .limit(1);
  if (!diag) return null;

  const storedType =
    typeof diag.jobType === "string" && diag.jobType.trim() ? diag.jobType : jobType;
  const storedPayload = parseStoredDiagnosisJobPayload(diag.jobPayload);
  if (storedPayload) {
    return { type: storedType, payload: storedPayload };
  }

  const [biz] = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      category: businesses.category,
      region: businesses.region,
      homepageUrl: businesses.homepageUrl,
      naverPlaceId: businesses.naverPlaceId,
    })
    .from(businesses)
    .where(eq(businesses.id, diag.businessId))
    .limit(1);
  if (!biz) return null;

  const name = biz.name.trim();
  const region = (biz.region ?? "").trim() || "전국";
  const industry = (biz.category ?? "").trim() || "기타";
  const fallbackTarget = `https://search.naver.com/search.naver?query=${encodeURIComponent(name)}`;

  const payload = buildDiagnosisJobPayload({
    diagnosisId,
    business: {
      id: biz.id,
      homepageUrl: biz.homepageUrl,
      naverPlaceId: biz.naverPlaceId,
    },
    businessProfile: {
      businessName: name,
      industry,
      region,
      mainServices: [name],
      targetKeywords: [name],
    },
    modules: DEFAULT_DIAGNOSIS_MODULES,
    requestLlmValidation: false,
    fallbackTarget,
    fallbackSourceType: "naver_place",
  });

  return { type: storedType, payload };
}
