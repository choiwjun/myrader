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
// 정직성/경계: 풍부한 businessProfile(mainServices/targetKeywords/industry)은 enqueue 시점에만
// 존재하므로(별도 저장 테이블 없음 — 스키마 변경 금지), 복원 payload 는 businesses 행의 실데이터
// (name/region/homepageUrl/naverPlaceId)로 구성한 *보수적 최소 프로파일*이다. 1차 경로(같은
// 프로세스 백그라운드 drain)가 정상 케이스를 full fidelity 로 처리하므로, 이 복원은 인스턴스
// 사망 등으로 남은 고아 잡의 복구 안전망이다(발명 0 — 실 저장 데이터만 사용).

import type { SourceType } from "@boina/contracts/enums";
import type { DbClient } from "@boina/db/client";
import { businesses, diagnoses } from "@boina/db/schema";
import { eq } from "drizzle-orm";
import type { DiagnosisJobPayload } from "./diagnosis-handler.js";

/** 복원기가 반환하는 잡 메타(type + payload). queue 가 핸들러 라우팅·실행에 사용. */
export interface ResolvedJob {
  type: string;
  payload: DiagnosisJobPayload;
}

/**
 * diagnoses+businesses 행으로부터 진단 잡 payload 를 재구성한다(cross-process 복구).
 *
 * - 진단 행이 없으면 null(처리 대상 아님).
 * - business 행이 없으면(고아 진단) null — 복원 불가(추측 금지).
 * - target: homepageUrl > naverPlaceId 로 구성한 place URL > 이름 기반(최후) 순으로 결정.
 * - businessProfile: businesses 실데이터(name/region)로 최소 구성. industry 는 미저장 →
 *   보수적 기본("기타"), mainServices/targetKeywords 는 이름에서 파생(추측 데이터 아님 — 라벨).
 *
 * @returns 재구성된 잡 또는 null(복원 불가 — queue 가 건너뜀).
 */
export async function resolveDiagnosisJobPayload(
  db: DbClient,
  diagnosisId: string,
  jobType: string,
): Promise<ResolvedJob | null> {
  const [diag] = await db
    .select({ id: diagnoses.id, businessId: diagnoses.businessId })
    .from(diagnoses)
    .where(eq(diagnoses.id, diagnosisId))
    .limit(1);
  if (!diag) return null;

  const [biz] = await db
    .select({
      name: businesses.name,
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

  // target/sourceType: 홈페이지 우선(website), 없으면 네이버 플레이스, 없으면 이름 기반 검색 URL.
  let target: string;
  let sourceType: SourceType;
  if (biz.homepageUrl?.trim()) {
    target = biz.homepageUrl.trim();
    sourceType = "website";
  } else if (biz.naverPlaceId?.trim()) {
    target = `https://place.naver.com/restaurant/${biz.naverPlaceId.trim()}`;
    sourceType = "naver_place";
  } else {
    target = `https://search.naver.com/search.naver?query=${encodeURIComponent(name)}`;
    sourceType = "naver_place";
  }

  const payload: DiagnosisJobPayload = {
    diagnosisId,
    target,
    sourceType,
    businessProfile: {
      businessName: name,
      industry: "기타", // industry 는 미저장(스키마 변경 금지) — 보수적 기본(추측 금지).
      region,
      mainServices: [name],
      targetKeywords: [name],
    },
    modules: ["seo", "aeo", "geo"],
    requestLlmValidation: false,
  };

  return { type: jobType, payload };
}
