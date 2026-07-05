// @TASK P3-R1 - PlanTier 서버 판정 + 콘텐츠 게이팅 헬퍼 (페이월 경계 서버 강제)
// @SPEC specs/shared/types.yaml (PlanTier: free/paid — free=요약/맛보기, paid=일회성 실행팩)
// @SPEC docs/planning/06-tasks.md#p3-r1 (PlanTier 콘텐츠 게이팅 서버 강제)
// @SPEC docs/planning/07-coding-convention.md §4 (경계 일관) / §6 (페이월/가격 config화 — 금액 미하드코딩)
// @SPEC docs/planning/DECISION_LOG.md (OQ-3: 무료=훅·요약, 유료=일회성 실행팩 / 가격 config·placeholder)
// @SPEC .claude/constitutions/nextjs/auth.md §1 (단일 Auth 레이어 — getCurrentUser)
// @SPEC packages/db/src/schema/account.ts (accounts.plan: free|basic|pro|business — 구조 변경 금지)
// @TEST apps/web/tests/diagnosis/plan-tier.test.ts
//
// 책임(REQ-004~006): 페이월 콘텐츠 게이팅(free/paid)을 "서버에서 강제"한다.
//
// ★ 보안(양보 불가): 무료/유료 경계는 오직 서버 세션 account.plan 으로만 결정한다.
//   클라이언트가 보내는 `?paid=1`(또는 임의 요청 변조)은 절대 신뢰하지 않는다 — 무시한다.
//   x-sag isPaidPlan 게이팅과 동형(비싼 grounded AI·역공학은 paid 만; 무료=$0).
//
// PlanTier 판정 규칙(OQ-3 + account.plan enum):
//   - 익명(미인증/세션 없음/account 없음)        → free
//   - account.plan === "free"                    → free
//   - account.plan ∈ {basic, pro, business}      → paid (유료 실행팩/구독 계열)
//   v1 결제(P3-R2)는 결제 승인 후 account.plan 을 유료 계열로 전환한다 — 귀속은 account.plan.
//   가격(금액)은 여기서 다루지 않는다(OQ-3 config·placeholder — 금액 하드코딩 0).

import type { PublicAccount } from "../auth/index.js";

// ---------------------------------------------------------------------------
// PlanTier — 페이월 경계(types.yaml PlanTier 와 1:1)
// ---------------------------------------------------------------------------

/** 페이월 경계. free=요약/맛보기 / paid=일회성 실행팩(전체 갭·모든 행동·생성물 전체). */
export type PlanTier = "free" | "paid";

/** account.plan enum(packages/db planEnum 과 1:1 — 구조 변경 금지, 값만 참조). */
export type AccountPlan = "free" | "basic" | "pro" | "business";

/**
 * 유료(paid) 경계로 매핑되는 account.plan 값 집합.
 * free 만 무료, 그 외(basic/pro/business)는 모두 유료 실행팩/구독 계열 → paid.
 * 발명 금지: plan enum 에 없는 값은 다루지 않는다(타입이 강제).
 */
const PAID_PLANS: ReadonlySet<AccountPlan> = new Set<AccountPlan>(["basic", "pro", "business"]);

// ---------------------------------------------------------------------------
// 핵심: account.plan → PlanTier (순수 — 서버 강제의 단일 출처)
// ---------------------------------------------------------------------------

/**
 * 세션 account 로부터 PlanTier 를 판정한다(순수 함수 — 서버 강제의 단일 출처).
 *
 * 보안: 입력은 오직 서버가 신뢰하는 account(세션 검증 결과)뿐이다. 클라 입력(`?paid=1`)은
 * 이 함수에 절대 들어오지 않는다 — 경계 결정에 클라 신호 0.
 *
 * @param account 현재 세션 account(미인증/없음이면 null) → free.
 * @returns "free" | "paid"
 */
export function resolvePlanTier(account: Pick<PublicAccount, "plan"> | null | undefined): PlanTier {
  if (!account) return "free"; // 익명(미인증/세션 없음) = free.
  return PAID_PLANS.has(account.plan) ? "paid" : "free";
}

/** PlanTier 가 유료(paid)인지(게이팅 분기용 boolean 단축). */
export function isPaidTier(tier: PlanTier): boolean {
  return tier === "paid";
}

// ---------------------------------------------------------------------------
// route 진입점용: 세션 → PlanTier (getCurrentUser 주입 가능 — 테스트 용이)
// ---------------------------------------------------------------------------
//
// route 는 클라가 보낸 `?paid=1` 을 읽지 않고, 이 함수로 서버 세션 account.plan 만으로 결정한다.
// getCurrentUser 주입 패턴(auth/index 의 repo 주입과 동형)으로 단위 테스트에서 세션을 mock 한다.

/** 현재 세션 account 를 반환하는 함수 시그니처(기본 = lib/auth getCurrentUser). */
export type CurrentUserResolver = () => Promise<PublicAccount | null>;

/** resolveRequestPlanTier 옵션 — 세션 조회기 주입(미지정 시 getCurrentUser). */
export interface ResolveRequestPlanTierOptions {
  /** 테스트/특수 경로용 세션 조회기 주입. 미지정 시 lib/auth getCurrentUser. */
  getCurrentUser?: CurrentUserResolver;
}

/**
 * 요청의 PlanTier 를 서버 세션 account.plan 으로 판정한다(route 진입점 — 클라 신호 무시).
 *
 * ★ 보안: 클라이언트의 `?paid=1`·요청 변조는 여기서 읽지 않는다(우회 0). 오직 세션 account 만.
 * 익명(세션 없음/account 없음)=free, account.plan 유료 계열=paid.
 *
 * @returns { account, tier, isPaid } — route 가 게이팅 옵션(isPaid)으로 그대로 사용.
 */
export async function resolveRequestPlanTier(
  options: ResolveRequestPlanTierOptions = {},
): Promise<{ account: PublicAccount | null; tier: PlanTier; isPaid: boolean }> {
  const resolver: CurrentUserResolver =
    options.getCurrentUser ?? (await import("../auth/index.js")).getCurrentUser;
  const account = await resolver();
  const tier = resolvePlanTier(account);
  return { account, tier, isPaid: isPaidTier(tier) };
}

// ---------------------------------------------------------------------------
// 잠금 메타(paywall) — UI 잠금 카드용 (★ content 비노출 — 개수만)
// ---------------------------------------------------------------------------
//
// S4/S5/S6 의 paywall_gate(잠금 카드)는 "나머지 N개가 잠겨 있어요"를 보여주되,
// 잠긴 항목의 실제 content(전체 갭 label·행동 title·생성물 본문)는 절대 노출하지 않는다.
// 그래서 route 응답에는 잠긴 항목의 "개수(lockedCount)"와 "locked 여부"만 메타로 싣는다.
// 무료 응답의 visible 목록에는 잠긴 content 가 아예 들어가지 않는다(서비스가 Top3/일부로 슬라이스).

/** 페이월 잠금 메타 — 잠긴 항목 개수만(content 0). UI 가 잠금 카드 렌더에 사용. */
export interface PaywallMeta {
  /** true = 무료 경계라 잠긴 항목이 있음(잠금 카드 노출). paid 면 항상 false. */
  locked: boolean;
  /** 잠긴 항목 개수(메타만 — 실제 content 는 응답에 없음). */
  lockedCount: number;
}

/**
 * 잠금 메타를 산출한다 — 전체 개수 - 무료 노출 개수 = 잠긴 개수(★ content 0).
 *
 * 보안: 잠긴 항목의 content 는 어디에도 담지 않는다 — 오직 "몇 개가 잠겼는지"만.
 * paid(서버 판정)면 잠김 0(locked=false). free 면 visible 을 뺀 나머지가 잠김.
 *
 * @param totalCount 게이팅 전 전체 항목 수(서버가 아는 실제 총량).
 * @param visibleCount 무료에서 실제 노출한 항목 수.
 * @param isPaid 서버 판정 PlanTier(paid 면 잠김 0).
 */
export function computePaywallMeta(
  totalCount: number,
  visibleCount: number,
  isPaid: boolean,
): PaywallMeta {
  if (isPaid) return { locked: false, lockedCount: 0 };
  const lockedCount = Math.max(0, totalCount - visibleCount);
  return { locked: lockedCount > 0, lockedCount };
}
