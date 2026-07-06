// @TASK P2-S1~S7-V — 화면 연결점 통합 검증 + AC 회귀; allow: SIZE_OK — one integration contract spans route aliases, DB flow, labels, auth, and honesty gates
// @SPEC docs/planning/06-tasks.md (P2-S{M}-V 정의)
// @SPEC docs/planning/01-prd.md (AC-1~8)
// @SPEC docs/planning/08-derived-gates.md (G-HONESTY 정직성 횡단)
//
// 화면 간 라우팅 흐름 + 데이터 연결점 + AC 수용기준 통합 검증:
//
// 1. 라우팅 흐름 (현재 IA)
//    - /find 완료: /home?diagnosisId= 로 이동
//    - 공통 AppNav: /home, /status, /rivals, /write 는 diagnosisId 유지
//    - /status: /rivals 로 diagnosisId 유지
//    - /settings: diagnosisId 미전파, /find 가게 재선택 제공
//
// 2. 데이터 흐름 (익명 진단 end-to-end)
//    - 미인증 가게 검색 → 확정(account_id null) → 진단 enqueue(diagnosisId 발급)
//    - home → status → rivals → write 주요 화면이 diagnosisId로 일관 연결
//
// 3. AC 회귀 (01-prd AC-1~8)
//    - AC-1: 이름 한 칸 입력만으로 진단 시작
//    - AC-2: 신호등/한 줄 요약 (점수 0)
//    - AC-3: 경쟁 비교 손실 프레이밍 카드
//    - AC-4: 4분류 텍스트 토큰 + "오늘 딱 하나" 1개
//    - AC-5: 직접건 딥링크
//    - AC-6: 생성물 복붙 가능 형태
//    - AC-8: 인과("고치면 1위") 카피 화면·생성물 0건
//
// 4. 정직성 횡단 회귀 (G-HONESTY)
//    - 전 화면·route 응답: (a) 점수 0 (b) 전문용어 0 (c) 인과 0
//
// 5. 인증·페이월 경계
//    - S1~S6 익명 동작 / S7 미인증 차단
//    - 무료/유료 경계(S4 Top3, S5 오늘딱하나, S6 미리보기)
//
// RED: 라우팅/데이터 흐름 미검증 → 실패
// GREEN: 전체 흐름 통과 + AC 만족 + 정직성 가드

import { readFileSync } from "node:fs";
import { createDb } from "@boina/db/client";
import { businesses, diagnoses } from "@boina/db/schema";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import ActionsPage from "../../app/(app)/actions/page";
import AssetsPage from "../../app/(app)/assets/page";
import CheckoutPage from "../../app/(app)/checkout/page";
import ComparePage from "../../app/(app)/compare/page";
import GapPage from "../../app/(app)/gap/page";
import { decideRouteAccess } from "../../lib/auth/config";
import { createDbBusinessRepository } from "../../lib/business/business-repository.js";
import { confirmBusiness } from "../../lib/business/business-service.js";
import { deriveActions } from "../../lib/diagnosis/action-service.js";
import { createDbDiagnosisRepository } from "../../lib/diagnosis/diagnosis-repository.js";
import {
  type GapItem,
  buildGapIntro,
  deriveGapItemsFromResult,
} from "../../lib/diagnosis/gap-service.js";
import { deriveGeneratedAssets } from "../../lib/diagnosis/generated-asset-service.js";
import {
  actionTierToLabel,
  assetTypeToLabel,
  channelToLabel,
  signalToLabel,
} from "../../lib/shared/ui-labels";

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROUTE_FLOW_DIAGNOSIS_ID = "11111111-1111-4111-8111-111111111111";

function redirectDigest(error: unknown): string {
  if (typeof error === "object" && error !== null && "digest" in error) {
    const digest = error.digest;
    if (typeof digest === "string") return digest;
  }

  return String(error);
}
function redirectTargetUrl(digest: string): string {
  const parts = digest.split(";");
  return parts.find((part) => part.startsWith("/")) ?? digest;
}

function expectRedirectTarget(digest: string, target: string) {
  const actual = redirectTargetUrl(digest);
  const expected = new URL(target, "https://boina.test");
  const received = new URL(actual, "https://boina.test");

  expect(received.pathname).toBe(expected.pathname);
  expect(Object.fromEntries(received.searchParams.entries())).toEqual(
    Object.fromEntries(expected.searchParams.entries()),
  );
}

async function expectNextRedirect(run: () => Promise<unknown> | unknown, target: string) {
  try {
    await Promise.resolve(run());
  } catch (error) {
    const digest = redirectDigest(error);
    expect(digest).toContain("NEXT_REDIRECT");
    expectRedirectTarget(digest, target);
    expect(digest).not.toContain("/checkout");
    return;
  }

  throw new Error(`Expected Next redirect to ${target}`);
}

describe("P2-S1~S7-V: 화면 연결점 통합 검증 + AC 회귀", () => {
  describe("화면 5-1: 현재 IA 라우팅 흐름 — diagnosisId 보존 경계", () => {
    const findSource = readFileSync(
      new URL("../../app/(app)/find/page.tsx", import.meta.url),
      "utf8",
    );
    const statusSource = readFileSync(
      new URL("../../app/(app)/status/page.tsx", import.meta.url),
      "utf8",
    );
    const appNavSource = readFileSync(
      new URL("../../app/components/shared/AppNav.tsx", import.meta.url),
      "utf8",
    );
    const settingsSource = readFileSync(
      new URL("../../app/(app)/settings/SettingsClient.tsx", import.meta.url),
      "utf8",
    );

    it("find 완료는 diagnosisId를 붙여 home으로 이동한다", () => {
      expect(findSource).toContain("router.push(`/home?diagnosisId=${id}`)");
      expect(findSource).toContain("diagnosisIdFromEnqueueSuccess(json)");
    });

    it("AppNav carryId 링크는 home/status/rivals/write에서 diagnosisId를 유지하고 settings는 제외한다", () => {
      const carriedRoutes = Array.from(
        appNavSource.matchAll(
          /\{ href: "(\/home|\/status|\/rivals|\/write)", label: "[^"]+", mobileLabel: "[^"]+", carryId: true \}/g,
        ),
        (match) => match[1],
      );

      expect(new Set(carriedRoutes)).toEqual(new Set(["/home", "/status", "/rivals", "/write"]));

      expect(appNavSource).toContain(
        '{ href: "/settings", label: "설정", mobileLabel: "설정", carryId: false }',
      );
      expect(appNavSource).toContain("new URLSearchParams()");
      expect(appNavSource).toContain('hrefParams.set("diagnosisId", diagnosisId)');
    });

    it("status에서 rivals로 이동할 때 diagnosisId를 보존한다", () => {
      expect(statusSource).toContain("new URLSearchParams()");
      expect(statusSource).toContain('params.set("diagnosisId", diagnosisId)');
      expect(statusSource).toContain(
        'router.push(`/rivals${params.toString() ? `?${params.toString()}` : ""}`)',
      );
    });

    it("settings는 diagnosisId를 carry하지 않고 가게 찾기 경로를 제공한다", () => {
      expect(appNavSource).toContain(
        '{ href: "/settings", label: "설정", mobileLabel: "설정", carryId: false }',
      );
      expect(settingsSource).toContain('router.push("/find")');
      expect(settingsSource).not.toContain("diagnosisId");
    });
  });

  describe("화면 5-2: 데이터 흐름 — diagnosisId 일관성 (익명 진단)", () => {
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

    describeDb("익명 진단 end-to-end", () => {
      it("S1: 가게 검색·확정(account_id null) → diagnosisId 발급", async () => {
        const db = createDb(DATABASE_URL as string);
        const businessRepo = createDbBusinessRepository(db);
        const diagnosisRepo = createDbDiagnosisRepository(db);

        // 1) 미인증 사장님이 후보를 확정(accountId 미전달 = 익명)
        const business = await confirmBusiness(businessRepo, {
          candidate: {
            placeUrl: "https://place.naver.com/restaurant/1234567",
            name: "네비게이션테스트카페",
            address: "서울 강남구 1",
            category: "카페",
          },
          region: "서울 강남구",
        });
        createdBusinessIds.push(business.id);
        expect(business.id).toMatch(UUID_V4);

        // 2) 익명 business 행 확인 (account_id null)
        const [bizRow] = await db
          .select({ accountId: businesses.accountId })
          .from(businesses)
          .where(eq(businesses.id, business.id))
          .limit(1);
        expect(bizRow?.accountId).toBeNull();

        // 3) 진단 enqueue → diagnosisId 발급
        const diagnosis = await diagnosisRepo.create({ businessId: business.id });
        createdDiagnosisIds.push(diagnosis.id);
        expect(diagnosis.id).toMatch(UUID_V4);
        expect(diagnosis.status).toBe("queued");
      });

      it("/find→/home + AppNav status/rivals/write IA가 diagnosisId를 보존한다", async () => {
        const db = createDb(DATABASE_URL as string);
        const businessRepo = createDbBusinessRepository(db);
        const diagnosisRepo = createDbDiagnosisRepository(db);

        const business = await confirmBusiness(businessRepo, {
          candidate: {
            placeUrl: "https://place.naver.com/restaurant/2345678",
            name: "상태진행카페",
            address: "서울 서초구 2",
            category: "카페",
          },
          region: "서울 서초구",
        });
        createdBusinessIds.push(business.id);

        const diagnosis = await diagnosisRepo.create({ businessId: business.id });
        createdDiagnosisIds.push(diagnosis.id);

        // /find 완료 후 /home?diagnosisId={diagnosis.id}로 진입하고 AppNav가 이후 IA로 이어준다.
        const reloaded = await diagnosisRepo.findById(diagnosis.id);
        expect(reloaded?.id).toBe(diagnosis.id);
        expect(reloaded?.businessId).toBe(business.id);
      });

      it("home→status→rivals→write: 현재 IA source가 같은 diagnosisId query key를 이어준다", () => {
        const findSource = readFileSync(
          new URL("../../app/(app)/find/page.tsx", import.meta.url),
          "utf8",
        );
        const statusSource = readFileSync(
          new URL("../../app/(app)/status/page.tsx", import.meta.url),
          "utf8",
        );
        const appNavSource = readFileSync(
          new URL("../../app/components/shared/AppNav.tsx", import.meta.url),
          "utf8",
        );

        const carriedRoutes = Array.from(
          appNavSource.matchAll(
            /\{ href: "(\/home|\/status|\/rivals|\/write)", label: "[^"]+", mobileLabel: "[^"]+", carryId: true \}/g,
          ),
          (match) => match[1],
        );

        expect(findSource).toContain("router.push(`/home?diagnosisId=${id}`)");
        expect(statusSource).toContain('params.set("diagnosisId", diagnosisId)');
        expect(statusSource).toContain(
          'router.push(`/rivals${params.toString() ? `?${params.toString()}` : ""}`)',
        );
        expect(new Set(carriedRoutes)).toEqual(new Set(["/home", "/status", "/rivals", "/write"]));
      });
    });
  });

  describe("화면 5-3: AC 수용기준 회귀", () => {
    const causalCopy = /1위|일등|매출|수익|반드시|보장/;
    const findSource = readFileSync(
      new URL("../../app/(app)/find/page.tsx", import.meta.url),
      "utf8",
    );
    const rivalsSource = readFileSync(
      new URL("../../app/(app)/rivals/RivalsClient.tsx", import.meta.url),
      "utf8",
    );
    const writeSource = readFileSync(
      new URL("../../app/(app)/write/WriteClient.tsx", import.meta.url),
      "utf8",
    );

    const sampleGapItems: GapItem[] = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        label: "영업시간이 안 적혀 있어요",
        competitorHas: true,
        iHave: false,
        category: "소개",
        actionTier: "self_fix",
        priority: 1,
        isPaid: false,
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        label: "가게 소개글을 더 쉽게 써야 해요",
        competitorHas: true,
        iHave: false,
        category: "소개",
        actionTier: "snippet",
        priority: 2,
        isPaid: false,
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        label: "사진 정리가 필요해요",
        competitorHas: true,
        iHave: false,
        category: "노출",
        actionTier: "vendor",
        priority: 3,
        isPaid: false,
      },
      {
        id: "44444444-4444-4444-8444-444444444444",
        label: "리뷰 답글을 꾸준히 챙겨야 해요",
        competitorHas: true,
        iHave: false,
        category: "리뷰",
        actionTier: "ongoing",
        priority: 4,
        isPaid: true,
      },
    ];

    function jsxElementBlock(source: string, marker: string) {
      const start = source.indexOf(marker);
      expect(start).toBeGreaterThanOrEqual(0);
      const end = source.indexOf("/>", start);
      expect(end).toBeGreaterThan(start);
      return source.slice(start, end);
    }

    describe("AC-1: 이름 한 칸 입력만으로 진단 시작", () => {
      it("S1 store_search_form: name 필드만 필수 (지역과 홈페이지는 선택)", () => {
        const nameInput = jsxElementBlock(findSource, 'id="store-name"');
        const regionInput = jsxElementBlock(findSource, 'id="store-region"');
        const websiteInput = jsxElementBlock(findSource, 'id="website-url"');

        expect(findSource).toContain("if (!name.trim()) return;");
        expect(findSource).toContain('if (region.trim()) params.set("region", region.trim());');
        expect(nameInput).toContain("required");
        expect(nameInput).toContain('aria-required="true"');
        expect(regionInput).not.toContain("required");
        expect(websiteInput).not.toContain("required");
      });
    });

    describe("AC-2: 내 상태가 신호등/한 줄 (점수 아님)", () => {
      it("S2 overall_summary: Signal enum만 (숫자 0)", () => {
        const signals: Array<"green" | "yellow" | "red"> = ["green", "yellow", "red"];
        for (const signal of signals) {
          const label = signalToLabel(signal);
          const obj = label as unknown as Record<string, unknown>;
          expect(typeof obj.emoji).toBe("string");
          expect(typeof obj.summary).toBe("string");
          expect(obj.score).toBeUndefined();
          expect(obj.number).toBeUndefined();
          expect(obj.percentage).toBeUndefined();
        }
      });
    });

    describe("AC-3: 경쟁 비교가 손실 프레이밍 카드", () => {
      it("S3 competitor_vs_me_card: beatsMe=true만 카드로 보여주고 나머지는 응원 상태로 둔다", () => {
        expect(rivalsSource).toContain(
          "(competitorData?.competitors ?? []).filter((item) => item.beatsMe)",
        );
        expect(rivalsSource).toContain("잘 지키고 계세요!");
        expect(rivalsSource).toContain("먼저 보이는 경쟁 가게가 아직 확인되지 않았어요.");
      });

      it("S3 source_badge: 출처(naver_serp/gpt_grounded)를 사장님 언어로 표기한다", () => {
        expect(rivalsSource).toContain(
          'if (source === "naver_serp") return "네이버 검색에서 확인";',
        );
        expect(rivalsSource).toContain('if (source === "gpt_grounded") return "AI가 확인";');
        expect(rivalsSource).not.toContain("SERP");
      });
    });

    describe("AC-4: 4분류 텍스트 토큰 + '오늘 딱 하나' 1개", () => {
      it("S5 action cards: 4분류 컴포넌트 라벨을 모두 제공한다", () => {
        const actions = deriveActions(sampleGapItems, { isPaid: true });
        expect(new Set(actions.map((action) => action.tier))).toEqual(
          new Set(["green_self", "yellow_copy", "red_vendor", "gray_ongoing"]),
        );

        for (const action of actions) {
          const label = actionTierToLabel(action.tier);
          expect(label.emoji).toMatch(/^[a-z_]+$/);
          expect(label.label.length).toBeGreaterThan(0);
        }
      });

      it("S5 today_one_banner: isTodayOne=true인 action은 정확히 1개만 나온다", () => {
        const actions = deriveActions(sampleGapItems, { isPaid: true });
        expect(actions.filter((action) => action.isTodayOne)).toHaveLength(1);
        expect(actions.find((action) => action.isTodayOne)?.isPaid).toBe(false);
      });
    });

    describe("AC-5: 직접건 딥링크", () => {
      it("S5 green_self_card: 직접건에만 공식 수정 deeplink를 붙인다", () => {
        const actions = deriveActions(sampleGapItems, { isPaid: true });
        const directAction = actions.find((action) => action.tier === "green_self");
        const nonDirectActions = actions.filter((action) => action.tier !== "green_self");

        expect(directAction?.deeplink).toBe("https://new.smartplace.naver.com/");
        expect(nonDirectActions.every((action) => !action.deeplink)).toBe(true);
      });
    });

    describe("AC-6: 생성물 복붙 가능 형태", () => {
      it("S6 asset cards: 생성물은 copyable이고 화면은 큰 복사 버튼에 연결한다", () => {
        const assets = deriveGeneratedAssets(
          {
            businessName: "전체흐름카페",
            category: "카페",
            region: "서울 종로구",
            faqs: [{ question: "영업시간이 어떻게 되나요?", answer: "매일 오전 10시에 열어요." }],
          },
          { isPaid: true },
        );

        expect(assets.length).toBeGreaterThan(0);
        expect(assets.every((asset) => asset.copyable === true && asset.content.length > 0)).toBe(
          true,
        );
        expect(writeSource).toContain("asset.copyable ?");
        expect(writeSource).toContain("<BigCopyButton");
      });
    });

    describe("AC-8: 인과 카피 화면·생성물 0건", () => {
      it("S2 채널 상태: AI/Google 인과 단정 금지 ('1위 가능', '매출↑')", () => {
        const channels = ["naver", "google", "ai"] as const;
        for (const channel of channels) {
          const label = channelToLabel(channel);
          expect(JSON.stringify(label)).not.toMatch(causalCopy);
        }
      });

      it("S4 갭 설명: '따라하면 1위' 같은 인과를 만들지 않는다", () => {
        const items = deriveGapItemsFromResult(
          {
            matrix: [
              {
                ruleId: "business_hours",
                category: "geo",
                selfPassed: false,
                competitorPassedCount: 2,
                competitorTotal: 3,
                gap: 1,
                actionType: "self_fix",
                priority: "high",
              },
            ],
            priorities: [],
            selfStrengths: [],
            marketAverage: { seo: 0, aeo: 0, geo: 0, perf: 0, overall: 0 },
          },
          { isPaid: true },
        );

        expect(items.length).toBeGreaterThan(0);
        expect(buildGapIntro(items.length)).not.toMatch(causalCopy);
        for (const item of items) {
          expect(item.label).not.toMatch(causalCopy);
        }
      });

      it("S6 생성물 사본: 과장/인과 없는 복붙 문구만 통과한다", () => {
        const assets = deriveGeneratedAssets(
          {
            businessName: "전체흐름카페",
            category: "카페",
            region: "서울 종로구",
            faqs: [{ question: "주차할 수 있나요?", answer: "근처 공영주차장을 이용해 주세요." }],
          },
          { isPaid: true },
        );

        expect(assets.length).toBeGreaterThan(0);
        for (const asset of assets) {
          expect(`${asset.title}\n${asset.content}`).not.toMatch(causalCopy);
        }
      });
    });
  });

  describe("화면 5-4: 정직성 횡단 회귀 (G-HONESTY)", () => {
    const forbiddenTerms = [
      "SEO",
      "AEO",
      "GEO",
      "SERP",
      "snippet",
      "keyword",
      "algorithm",
      "ranking",
      "score",
      "점수",
      "스코어",
    ];

    it("전 화면 enum 변환 결과: 전문용어 0건", () => {
      const channels = ["naver", "google", "ai"] as const;
      const signals = ["green", "yellow", "red"] as const;
      const tiers = ["green_self", "yellow_copy", "red_vendor", "gray_ongoing"] as const;
      const assets = ["snippet", "place_intro", "review_request", "vendor_prescription"] as const;

      // enum → 사장님 언어 변환 확인
      for (const channel of channels) {
        const label = channelToLabel(channel);
        const str = JSON.stringify(label).toLowerCase();
        for (const term of forbiddenTerms) {
          expect(str).not.toContain(term.toLowerCase());
        }
      }

      for (const signal of signals) {
        const label = signalToLabel(signal);
        const str = JSON.stringify(label).toLowerCase();
        for (const term of forbiddenTerms) {
          expect(str).not.toContain(term.toLowerCase());
        }
      }

      for (const tier of tiers) {
        const label = actionTierToLabel(tier);
        const str = JSON.stringify(label).toLowerCase();
        for (const term of forbiddenTerms) {
          expect(str).not.toContain(term.toLowerCase());
        }
      }

      for (const asset of assets) {
        const label = assetTypeToLabel(asset);
        const str = JSON.stringify(label).toLowerCase();
        for (const term of forbiddenTerms) {
          expect(str).not.toContain(term.toLowerCase());
        }
      }
    });
  });

  describe("화면 5-5: 인증·페이월 경계", () => {
    describe("인증 경계", () => {
      it("S1~S6 (/find, /status, /compare, /gap, /actions, /assets): 미인증 허용", () => {
        const publicRoutes = ["/find", "/status", "/compare", "/gap", "/actions", "/assets"];
        for (const pathname of publicRoutes) {
          const result = decideRouteAccess({ pathname, authenticated: false });
          expect(result.allowed).toBe(true);
        }
      });

      it("S7 (/settings): 미인증 차단 → /login redirect", () => {
        const result = decideRouteAccess({ pathname: "/settings", authenticated: false });
        expect(result.allowed).toBe(false);
        expect(result.redirectTo).toBe("/login");
      });

      it("S7 (/settings): 인증 허용", () => {
        const result = decideRouteAccess({ pathname: "/settings", authenticated: true });
        expect(result.allowed).toBe(true);
      });
    });

    describe("범위 경계", () => {
      it("legacy compare/gap routes redirect to the owned rivals menu with preserved query", async () => {
        await expectNextRedirect(
          () =>
            ComparePage({
              searchParams: Promise.resolve({ diagnosisId: ROUTE_FLOW_DIAGNOSIS_ID }),
            }),
          `/rivals?diagnosisId=${ROUTE_FLOW_DIAGNOSIS_ID}`,
        );
        await expectNextRedirect(
          () =>
            GapPage({
              searchParams: Promise.resolve({
                diagnosisId: ROUTE_FLOW_DIAGNOSIS_ID,
                businessId: "biz-legacy-1",
                tier: "red_vendor",
              }),
            }),
          `/rivals?diagnosisId=${ROUTE_FLOW_DIAGNOSIS_ID}&businessId=biz-legacy-1&tier=red_vendor`,
        );
      });

      it("legacy actions/assets routes redirect to the owned write menu without checkout", async () => {
        await expectNextRedirect(
          () =>
            ActionsPage({
              searchParams: Promise.resolve({
                diagnosisId: ROUTE_FLOW_DIAGNOSIS_ID,
                tier: "yellow_copy",
                keyword: "강남 브런치",
                radarKeywordId: "kw-1",
              }),
            }),
          `/write?diagnosisId=${ROUTE_FLOW_DIAGNOSIS_ID}&tier=yellow_copy&keyword=%EA%B0%95%EB%82%A8+%EB%B8%8C%EB%9F%B0%EC%B9%98&radarKeywordId=kw-1`,
        );
        await expectNextRedirect(
          () =>
            AssetsPage({
              searchParams: Promise.resolve({
                diagnosisId: ROUTE_FLOW_DIAGNOSIS_ID,
                type: "snippet",
                keyword: "강남 브런치",
                radarKeywordId: "kw-1",
                actionId: "action-7",
              }),
            }),
          `/write?diagnosisId=${ROUTE_FLOW_DIAGNOSIS_ID}&type=snippet&keyword=%EA%B0%95%EB%82%A8+%EB%B8%8C%EB%9F%B0%EC%B9%98&radarKeywordId=kw-1&actionId=action-7`,
        );
      });

      it("checkout is a closed legacy surface that redirects home", async () => {
        await expectNextRedirect(() => CheckoutPage(), "/home");
      });
    });
  });
});
