// @TASK Phase2 - 익명 진단 전체 흐름 통합 (S1 검색→확정→진단 enqueue→diagnosisId 전파)
// @SPEC docs/planning/01-prd.md#AC-1 (이름 한 칸으로 진단 시작 — 미인증/익명)
// @SPEC docs/planning/03-user-flow.md (S1~S6 auth:false / S7 auth:true)
// @SPEC specs/screens/store-finder.yaml (S1 검색→후보→확정)
//
// 통합(실 Postgres, 외부호출 0): 미인증 사장님이 가게를 확정(account_id null)하고
// 진단을 enqueue 하면 diagnosisId 가 항상 발급되어 /status?diagnosisId= 로 넘어갈 수
// 있는지 검증한다. 또한 S1~S6 라우트는 익명 허용, S7 만 인증 차단됨을 함께 확인한다.
//
// RED 의도: account_id NOT NULL 이거나 diagnosisId 미발급이면 흐름이 막혀 실패.
// GREEN: 익명 확정(account_id null) → diagnoses 행 생성(diagnosisId) → 폴링 가능.

import { createDb } from "@boina/db/client";
import { businesses, diagnoses } from "@boina/db/schema";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { decideRouteAccess } from "../../lib/auth/config";
import { createDbBusinessRepository } from "../../lib/business/business-repository.js";
import { confirmBusiness } from "../../lib/business/business-service.js";
import { createDbDiagnosisRepository } from "../../lib/diagnosis/diagnosis-repository.js";

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("Phase2: 인증 경계 (S1~S6 익명 / S7 인증)", () => {
  it.each([
    ["/", false],
    ["/find", false], // S1
    ["/status", false], // S2
    ["/compare", false], // S3
    ["/gap", false], // S4
    ["/assets", false], // S6 등
  ])("미인증 + 공개 라우트 %s → 허용(익명 진단)", (pathname) => {
    expect(decideRouteAccess({ pathname, authenticated: false }).allowed).toBe(true);
  });

  it("미인증 + /settings(S7) → 차단(redirect /login)", () => {
    const d = decideRouteAccess({ pathname: "/settings", authenticated: false });
    expect(d.allowed).toBe(false);
    expect(d.redirectTo).toBe("/login");
  });

  it("인증 + /settings(S7) → 1차 통과", () => {
    expect(decideRouteAccess({ pathname: "/settings", authenticated: true }).allowed).toBe(true);
  });
});

describeDb("Phase2: 익명 진단 전체 흐름 (실 Postgres)", () => {
  const createdBusinessIds: string[] = [];
  const createdDiagnosisIds: string[] = [];

  afterEach(async () => {
    if (!DATABASE_URL) return;
    const db = createDb(DATABASE_URL);
    for (const id of createdDiagnosisIds.splice(0)) {
      await db.delete(diagnoses).where(eq(diagnoses.id, id));
    }
    for (const id of createdBusinessIds.splice(0)) {
      await db.delete(businesses).where(eq(businesses.id, id));
    }
  });

  it("익명: 검색→확정(account_id null)→진단 enqueue(diagnosisId 발급)", async () => {
    const db = createDb(DATABASE_URL as string);
    const businessRepo = createDbBusinessRepository(db);
    const diagnosisRepo = createDbDiagnosisRepository(db);

    // 1) 미인증 사장님이 후보를 확정(accountId 미전달 = 익명).
    const business = await confirmBusiness(businessRepo, {
      candidate: {
        placeUrl: "https://place.naver.com/restaurant/3030303",
        name: "익명흐름가게",
        address: "서울 마포구 1",
        category: "카페",
      },
      region: "서울 마포구",
    });
    createdBusinessIds.push(business.id);
    expect(business.id).toMatch(UUID_V4);

    // account_id 가 null 인 익명 business 행이 실제로 생겼는지 확인.
    const [bizRow] = await db
      .select({ accountId: businesses.accountId })
      .from(businesses)
      .where(eq(businesses.id, business.id))
      .limit(1);
    expect(bizRow?.accountId).toBeNull();

    // 2) 진단 enqueue → diagnoses 행 생성(diagnosisId 발급).
    const diagnosis = await diagnosisRepo.create({ businessId: business.id });
    createdDiagnosisIds.push(diagnosis.id);

    // 3) diagnosisId 가 항상 발급된다(S1→S2 전파의 전제).
    expect(diagnosis.id).toMatch(UUID_V4);
    expect(diagnosis.businessId).toBe(business.id);
    expect(diagnosis.status).toBe("queued");

    // 4) /status?diagnosisId= 로 폴링할 수 있도록 findById 로 다시 조회된다.
    const reloaded = await diagnosisRepo.findById(diagnosis.id);
    expect(reloaded?.id).toBe(diagnosis.id);
  });
});
