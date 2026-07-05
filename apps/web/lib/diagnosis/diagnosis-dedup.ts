// @TASK 수정R2-A-3 - 진단 중복 방지 (같은 businessId 의 진행 중 진단 재사용)
// @SPEC docs/planning/02-trd.md §3 (잡 상태) / §5 (비용 게이팅 — 중복 크롤/LLM 차단)
// @SPEC packages/db/src/schema/diagnosis.ts (diagnoses 행 read only — 스키마 변경 0)
// @TEST apps/web/tests/diagnosis/diagnosis-dedup.test.ts
//
// 배경: 진단은 수십초라 폴링 중 재요청·더블클릭·새로고침이 흔하다. 매번 새 진단을 만들면
// 같은 가게에 queued/running 진단이 여러 개 생겨 중복 크롤·LLM 비용이 발생한다.
// POST /api/diagnosis 는 이 함수로 "이미 진행 중인 진단"을 찾아 있으면 그 diagnosisId 를 재사용한다.
//
// 경계: DiagnosisRepository 인터페이스는 불변(create/findById/update)로 두고, 이 조회는
// 별도 함수로 분리한다(주입 가능 — 테스트 용이). DB 구현은 getDefaultDb 경유 read only.

import { type DbClient, createDb } from "@boina/db/client";
import { diagnoses } from "@boina/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { DiagnosisRepository, DiagnosisStatus } from "./diagnosis-service.js";

/** 아직 진행 중(완료·실패 아님)인 진단으로 간주하는 상태 — 새 진단 대신 재사용 대상. */
const ACTIVE_STATUSES: readonly DiagnosisStatus[] = ["queued", "running"] as const;

/** dedup 조회 결과(재사용할 진단의 최소 정보). */
export interface ActiveDiagnosis {
  id: string;
  status: DiagnosisStatus;
}

/**
 * businessId 의 진행 중(queued/running) 진단을 조회하는 함수 시그니처(주입 가능 — 테스트 mock).
 * 없으면 null.
 */
export type ActiveDiagnosisFinder = (businessId: string) => Promise<ActiveDiagnosis | null>;

/**
 * DbClient 로 businessId 의 가장 최근 진행 중 진단을 찾는다(없으면 null).
 * status ∈ {queued, running} 중 createdAt 최신 1건. eq()/inArray() 파라미터 바인딩(SQL Injection 0).
 */
export function createDbActiveDiagnosisFinder(db: DbClient): ActiveDiagnosisFinder {
  return async (businessId) => {
    const [row] = await db
      .select({ id: diagnoses.id, status: diagnoses.status })
      .from(diagnoses)
      .where(
        and(
          eq(diagnoses.businessId, businessId),
          inArray(diagnoses.status, ACTIVE_STATUSES as unknown as DiagnosisStatus[]),
        ),
      )
      .orderBy(desc(diagnoses.createdAt))
      .limit(1);
    return row ? { id: row.id, status: row.status as DiagnosisStatus } : null;
  };
}

/** DATABASE_URL 로 기본 finder 를 만든다(route 진입점). */
export function getDefaultActiveDiagnosisFinder(): ActiveDiagnosisFinder {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return createDbActiveDiagnosisFinder(createDb(url));
}

/**
 * 같은 businessId 의 진행 중 진단이 있으면 반환한다(dedup). 없으면 null → 새 진단 생성.
 *
 * repo 인자는 인터페이스 호환을 위해 받지만(미사용 — 인터페이스 불변 유지), 실제 조회는
 * finder(기본: DATABASE_URL DB)로 수행한다. finder 주입 시 그것을 우선한다(테스트).
 */
export async function findActiveDiagnosisForBusiness(
  _repo: DiagnosisRepository,
  businessId: string,
  finder: ActiveDiagnosisFinder = getDefaultActiveDiagnosisFinder(),
): Promise<ActiveDiagnosis | null> {
  return finder(businessId);
}
