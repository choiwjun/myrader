// @TASK P2-R6 - generatedAsset 생성·카피 가드·4종 type TDD (RED→GREEN)
// @SPEC specs/domain/resources.yaml (generatedAsset: id/type/title/content/copyable)
// @SPEC specs/screens/generated.yaml (S6: 4종 카드 / 큰 복사 버튼 / [유료] 경계 / ?type 진입)
// @SPEC docs/planning/07-coding-convention.md §4 (생성물 가드: 인과·과장 0·전문용어 0) / §5 (대행연결 금지)
// @SPEC docs/planning/05-design-system.md (응원 톤·AI 생성 라벨)
// @TEST apps/web/tests/diagnosis/generated-asset-service.test.ts
//
// 핵심 계약(REQ-006, 양보 불가):
//   1. type 4종(snippet | place_intro | review_request | vendor_prescription) 생성.
//      snippet 은 x-sag 엔진(@boina/engine/snippets/index) 출력을 통합한다(검색 답변글).
//   2. copyable 항상 true(큰 복사 버튼 대상). content 복붙 본문 truthy.
//   3. 카피 가드 — 생성물 content/title 은 인과·과장(고치면 1위/매출↑/보장) 0, 전문용어 0.
//      가드를 통과하지 못한 생성물은 출력하지 않는다(추측·과장 0 = 정직 폴백).
//   4. vendor_prescription 은 "이렇게 보내세요" 이메일 초안까지만 — 업체 중개/매칭/정산 코드 0.
//   5. [유료] 실행팩 — 전체 생성물은 유료 경계(isPaid). 무료는 미리보기/일부. 금액 OQ-3 placeholder.

import { describe, expect, it } from "vitest";
import {
  ASSET_TYPES,
  type GeneratedAsset,
  assertGeneratedAssetHonest,
  buildAssetsIntro,
  deriveGeneratedAssetViewFromView,
  deriveGeneratedAssets,
  passesCopyGuard,
} from "../../lib/diagnosis/generated-asset-service.js";
import type { AssetGenInput } from "../../lib/diagnosis/generated-asset-service.js";

// ── 전문용어/인과·과장 금지 가드 (07 §4 생성물 가드) ─────────────────────────
const JARGON =
  /SERP|grounded|\bsnippet\b|스니펫|크롤|메타태그|\bAEO\b|\bGEO\b|\bSEO\b|robots|schema\.org|JSON-?LD|마이크로데이터|구조화\s*데이터/i;
const CAUSAL =
  /1위|1등|매출\s*↑|매출이?\s*(?:늘|올라|상승)|수익\s*(?:늘|증가)|반드시|확실히|무조건|보장|따라\s*하면|고치면\s*(?:추천|1위|상위)|상위\s*노출\s*보장|효과\s*보장/;
// 대행연결(중개·매칭·정산) 코드/카피 금지 (07 §5)
const BROKERAGE =
  /중개|매칭(?!되)|정산|수수료|마켓플레이스|견적\s*받기|업체\s*연결해|업체\s*추천해드릴|대행사\s*연결/;
const RULE_CODE = /[A-Z]{2,}-[A-Z0-9-]*-?\d{2,}/;

// ── mock 입력 (S1 business 프로필 기반) ──────────────────────────────────────
function input(partial: Partial<AssetGenInput> = {}): AssetGenInput {
  return {
    businessName: "마포김밥천국",
    category: "분식집",
    region: "서울 마포구",
    websiteUrl: "https://example.com",
    faqs: [
      { question: "영업시간이 어떻게 되나요?", answer: "평일 오전 9시부터 밤 9시까지 합니다." },
      { question: "주차가 가능한가요?", answer: "가게 앞 골목에 주차하실 수 있어요." },
    ],
    ...partial,
  };
}

/** 모든 생성물 공통 검증 — 필드·카피 가드·copyable. */
function assertHonestAsset(a: GeneratedAsset) {
  // resources.yaml 필드만 (발명 금지).
  for (const k of Object.keys(a)) {
    expect(["id", "type", "title", "content", "copyable"]).toContain(k);
  }
  // id UUID v4.
  expect(a.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  // type 4종 enum.
  expect(ASSET_TYPES).toContain(a.type);
  // title 사장님 언어 — 'snippet' 영어/전문용어/룰코드 노출 0.
  expect(a.title).toBeTruthy();
  expect(a.title).not.toMatch(JARGON);
  expect(a.title).not.toMatch(RULE_CODE);
  // content 복붙 본문 — 카피 가드(인과·과장·중개) 통과.
  expect(a.content).toBeTruthy();
  expect(a.content).not.toMatch(CAUSAL);
  expect(a.content).not.toMatch(BROKERAGE);
  expect(a.title).not.toMatch(CAUSAL);
  // copyable 항상 true.
  expect(a.copyable).toBe(true);
}

// ===========================================================================
// 1. 4종 type 생성 (snippet/place_intro/review_request/vendor_prescription)
// ===========================================================================
describe("deriveGeneratedAssets — 4종 type 생성", () => {
  it("4종 생성물이 모두 만들어진다(유료=전체)", () => {
    const assets = deriveGeneratedAssets(input(), { isPaid: true });
    const types = new Set(assets.map((a) => a.type));
    expect(types).toEqual(
      new Set(["snippet", "place_intro", "review_request", "vendor_prescription"]),
    );
    for (const a of assets) assertHonestAsset(a);
  });

  it("각 생성물 content 는 복붙 가능한 본문(truthy) + copyable=true", () => {
    const assets = deriveGeneratedAssets(input(), { isPaid: true });
    for (const a of assets) {
      expect(a.content.length).toBeGreaterThan(0);
      expect(a.copyable).toBe(true);
    }
  });

  it("snippet 은 x-sag 엔진(@boina/engine/snippets) 출력을 통합한다 — FAQ 답변 본문 포함", () => {
    const assets = deriveGeneratedAssets(input(), { isPaid: true });
    const snippet = assets.find((a) => a.type === "snippet");
    expect(snippet).toBeDefined();
    // 엔진이 받은 FAQ 질문/답변이 사장님 언어 답변글로 통합된다.
    expect(snippet?.content).toContain("영업시간");
    // 그러나 전문용어(schema.org/JSON-LD/마이크로데이터)는 UI 본문에 노출되지 않는다.
    expect(snippet?.content).not.toMatch(JARGON);
  });

  it("FAQ 입력이 없어도 snippet 은 프로필 기반 시작 템플릿으로 생성된다(#5 — prod 4종 보장)", () => {
    const assets = deriveGeneratedAssets(input({ faqs: [] }), { isPaid: true });
    const snippet = assets.find((a) => a.type === "snippet");
    // FAQ 없어도 다른 3종처럼 복붙 시작 템플릿을 만든다(이전: 생략 → prod 에서 스니펫 누락).
    expect(snippet).toBeDefined();
    // 시작 템플릿: 손님 자주 묻는 질문 골격(영업시간 등) — 사장님이 답을 채워 씀.
    expect(snippet?.content).toContain("영업시간");
    // 정직성: 전문용어(snippet/schema/JSON-LD) 0, 인과/효과 단정 0.
    expect(snippet?.content).not.toMatch(JARGON);
    // 나머지(소개글/리뷰요청/처방전)도 business 프로필만으로 생성.
    expect(assets.find((a) => a.type === "place_intro")).toBeDefined();
  });
});

// ===========================================================================
// 2. 카피 가드 (인과·과장·전문용어 0 — 통과 못 하면 출력 안 함)
// ===========================================================================
describe("passesCopyGuard — 생성물 카피 가드 (07 §4)", () => {
  it("인과·과장 카피는 가드를 통과하지 못한다(RED 의도)", () => {
    expect(passesCopyGuard("이 글만 올리면 무조건 검색 1위가 됩니다.")).toBe(false);
    expect(passesCopyGuard("따라 하면 매출이 반드시 늘어납니다.")).toBe(false);
    expect(passesCopyGuard("상위 노출 보장! 효과 보장!")).toBe(false);
  });

  it("전문용어(snippet/SEO/schema.org)가 들어가면 통과하지 못한다", () => {
    expect(passesCopyGuard("이 snippet 을 head 에 넣으세요")).toBe(false);
    expect(passesCopyGuard("schema.org JSON-LD 구조화 데이터입니다")).toBe(false);
  });

  it("업체 중개·매칭·정산 문구가 들어가면 통과하지 못한다(07 §5)", () => {
    expect(passesCopyGuard("저렴한 대행사 연결해 드릴게요. 견적 받기 누르세요.")).toBe(false);
    expect(passesCopyGuard("수수료 정산은 저희가 중개합니다.")).toBe(false);
  });

  it("응원·정직 톤(사실 묘사·도움이 돼요)은 통과한다", () => {
    expect(passesCopyGuard("저희 가게는 평일 오전 9시부터 밤 9시까지 합니다.")).toBe(true);
    expect(passesCopyGuard("리뷰를 남겨주시면 큰 도움이 돼요. 감사합니다!")).toBe(true);
  });

  it("생성물 전부가 카피 가드를 통과해 나온다(통과 못 한 건 출력 0)", () => {
    const assets = deriveGeneratedAssets(input(), { isPaid: true });
    for (const a of assets) {
      expect(passesCopyGuard(a.content)).toBe(true);
      expect(passesCopyGuard(a.title)).toBe(true);
    }
  });

  it("assertGeneratedAssetHonest 는 모든 생성물이 가드를 통과함을 보증(위반 시 throw)", () => {
    const assets = deriveGeneratedAssets(input(), { isPaid: true });
    for (const a of assets) {
      expect(() => assertGeneratedAssetHonest(a)).not.toThrow();
    }
  });
});

// ===========================================================================
// 3. vendor_prescription — 이메일 초안까지만 (업체 중개/매칭/정산 코드 0)
// ===========================================================================
describe("vendor_prescription — 이메일 초안까지만(대행연결 0, 07 §5)", () => {
  it("vendor_prescription content 는 '이렇게 보내세요' 이메일 초안이다(메일 형식)", () => {
    const assets = deriveGeneratedAssets(input(), { isPaid: true });
    const vp = assets.find((a) => a.type === "vendor_prescription");
    expect(vp).toBeDefined();
    // 이메일 초안 — 인사/요청/맺음 형식. (업체에게 '보낼' 텍스트)
    expect(vp?.content).toMatch(/안녕하세요|요청|부탁/);
    expect(vp?.content.length).toBeGreaterThan(20);
  });

  it("업체 중개/매칭/정산/수수료/마켓플레이스 코드·문구가 0건이다(절대)", () => {
    const assets = deriveGeneratedAssets(input(), { isPaid: true });
    const vp = assets.find((a) => a.type === "vendor_prescription");
    expect(vp?.content).not.toMatch(BROKERAGE);
    expect(vp?.title).not.toMatch(BROKERAGE);
    // 서비스 전체 어떤 생성물에도 중개 코드 0.
    for (const a of assets) {
      expect(a.content).not.toMatch(BROKERAGE);
    }
  });
});

// ===========================================================================
// 4. [유료] 실행팩 경계 (무료=미리보기/일부 / 유료=전체)
// ===========================================================================
describe("deriveGeneratedAssets — [유료] 실행팩 경계", () => {
  it("무료(isPaid=false)는 일부(미리보기)만 — 유료보다 적게 노출", () => {
    const free = deriveGeneratedAssets(input(), { isPaid: false });
    const paid = deriveGeneratedAssets(input(), { isPaid: true });
    expect(free.length).toBeLessThan(paid.length);
    expect(free.length).toBeGreaterThan(0); // 미리보기 일부는 존재
  });

  it("?type 필터 — 특정 생성물만 먼저 본다(S5에서 연결)", () => {
    const only = deriveGeneratedAssets(input(), { isPaid: true, type: "review_request" });
    expect(only.every((a) => a.type === "review_request")).toBe(true);
    expect(only.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// 5. assets_intro 헤드라인 (응원 톤·복붙 사용법 안내)
// ===========================================================================
describe("buildAssetsIntro — 복붙 사용법 한 문장(응원 톤)", () => {
  it("생성물 있으면 '그대로 복사해서 쓰세요' 류 응원 — 인과·과장·전문용어 0", () => {
    const intro = buildAssetsIntro(4);
    expect(intro).toBeTruthy();
    expect(intro).toMatch(/복사|복붙|그대로/);
    expect(intro).not.toMatch(CAUSAL);
    expect(intro).not.toMatch(JARGON);
    expect(intro).not.toMatch(RULE_CODE);
  });

  it("생성물 0이면 응원 톤(빈손 비난 0)", () => {
    const intro = buildAssetsIntro(0);
    expect(intro).toBeTruthy();
    expect(intro).not.toMatch(CAUSAL);
  });
});

// ===========================================================================
// 6. v1 정직 폴백 (business 프로필 미영속화 → 추측 0)
// ===========================================================================
describe("deriveGeneratedAssetViewFromView — v1 정직 폴백", () => {
  it("프로필 원자료 없으면 추측 생성물 0(빈 배열) + 응원 인트로 + isPaid 분기", () => {
    const view = deriveGeneratedAssetViewFromView({ isPaid: false });
    expect(view.assets).toEqual([]);
    expect(view.intro).toBeTruthy();
    expect(view.intro).not.toMatch(CAUSAL);
    expect(view.intro).not.toMatch(RULE_CODE);
    expect(view.isPaid).toBe(false);
  });

  it("paid=true 면 isPaid=true 경계", () => {
    expect(deriveGeneratedAssetViewFromView({ isPaid: true }).isPaid).toBe(true);
  });
});
