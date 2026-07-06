// @TASK P2-R5 - action 변환·4분류·"오늘 딱 하나" (전달 레이어: gapItem → 행동 카드)
// @SPEC specs/domain/resources.yaml (action: id/title/tier/isTodayOne/deeplink/doneable/isPaid)
// @SPEC specs/screens/actions.yaml (S5: 오늘 딱 하나 1개 / 4분류 / 직접건 deeplink / 무료·유료 경계)
// @SPEC docs/planning/07-coding-convention.md §4 (누가-하나 부착·인과 단정 0·전문용어 0)
// @SPEC docs/planning/05-design-system.md §행동/배너 (4분류·"오늘 딱 하나" 단일 우선순위)
// @SPEC apps/web/lib/shared/ui-labels.ts (actionTierToLabel — 4분류 사장님 언어 재사용)
// @TEST apps/web/tests/diagnosis/action-service.test.ts
//
// 책임(REQ-005, S5): P2-R4 gapItem(actionTier/priority/isPaid)을 "그래서 뭘 해야 하나"
// 행동 카드로 번역한다 — gapItem.actionTier(self_fix|snippet|vendor|ongoing)를 사장님 언어
// 4분류(green_self 🟢직접 / yellow_copy 🟡복붙 / red_vendor 🔴업체 / gray_ongoing ⏳꾸준히)로,
// 그리고 PriorityGap 우선순위 룰로 "오늘 딱 하나"(isTodayOne=true 정확히 1개)를 고른다.
//
// 정직성 가드(07 §4 — 양보 불가):
//   1. 행동이 노출/순위를 "보장한다" 단정 0 — "도움이 돼요" 응원 톤. 진짜 큰 레버는
//      🟢직접/⏳꾸준히(리뷰·플레이스)임을 분류로 정직 반영(인과 단정 없이 부담 수준만).
//   2. 4분류(🟢🟡🔴⏳)는 누가-하나(이모지+라벨)를 반드시 부착 — actionTierToLabel 재사용.
//      전문용어(SEO/AEO/GEO/snippet/SERP) UI 노출 0. 룰 코드값/점수 노출 0(gapItem 이 이미 차단).
//   3. "오늘 딱 하나"는 정확히 1개 — 사장님이 바로 실행 가능한 순서(직접건 우선, 무료 보장).
//      여러 개를 동시에 강조하지 않는다(한 번에 하나, 응원 톤 — 05 단일 우선순위).
//   4. deeplink 는 직접건(green_self)에만 — 네이버 플레이스 수정 등 바로가기. 비직접건은 없음
//      (업체 연결/중개 코드 금지 — 07 §5; deeplink 는 사장님이 직접 고치는 공식 화면뿐).
//   5. isPaid 경계 — [무료] 오늘 딱 하나 + 일부 / [유료] 전체. gapItem.isPaid 승계하되,
//      "오늘 딱 하나"는 절대 유료 잠금 뒤가 아니다(무료 보장 — 화면이 항상 노출).
//
// 엔진 경계(07 §2): 엔진을 직접 import 하지 않는다 — 이미 사장님 언어로 번역된 gapItem
// (P2-R4 gap-service 산출)만 입력으로 받는다. competitor/channel-status-service 와 동형의
// 순수 전달 레이어다(무거운 엔진 배럴 비의존). 4분류 카피는 P1-S0 ui-labels 사전을 재사용.
//
// 영속화된 gapItem 이 있는 route 는 deriveActionViewFromGapItems 로 행동을 만든다.
// gapItem 이 없는 read 경로는 deriveActionViewFromView 로 정직 폴백(추측 행동 0).

import { type ActionTier, actionTierToLabel } from "../shared/ui-labels.js";
import type { GapItem } from "./gap-service.js";

// ---------------------------------------------------------------------------
// action — 화면(S5)용 행동 카드 (resources.yaml action 필드와 1:1)
// ---------------------------------------------------------------------------

/** S5 4분류 — P1-S0 ui-labels.ActionTier 와 동일(green_self/yellow_copy/red_vendor/gray_ongoing). */
export type ActionTierClass = ActionTier;

/**
 * 화면(S5)용 행동 카드 — resources.yaml action 필드와 1:1.
 * 룰 코드값/점수는 이 객체에 절대 담지 않는다(07 §4). title 은 사장님 언어만(gapItem.label 승계).
 */
export interface Action {
  /** UUID v4(런타임 화면 식별자 — 영속화 전). gapItem.id 승계. */
  id: string;
  /** 사장님 언어 행동 제목(gapItem.label 승계 — 룰 코드값/전문용어/인과 0). */
  title: string;
  /** green_self 🟢직접 | yellow_copy 🟡복붙 | red_vendor 🔴업체 | gray_ongoing ⏳꾸준히. */
  tier: ActionTierClass;
  /** true = "오늘 딱 하나" 배너 대상. 전체에서 정확히 1개만 true(단일 우선순위). */
  isTodayOne: boolean;
  /** 직접건(green_self)만 바로가기 URL(예: 네이버 플레이스 수정). 비직접건은 undefined. */
  deeplink?: string;
  /** 사장님이 직접 끝낼 수 있는지(green_self·일부 ongoing=true / vendor=false). */
  doneable: boolean;
  /** true = 유료 실행팩에서만 노출(gapItem.isPaid 승계). 오늘 딱 하나는 항상 false(무료 보장). */
  isPaid: boolean;
}

// ---------------------------------------------------------------------------
// 옵션
// ---------------------------------------------------------------------------

/** gapItem → action 번역 옵션. */
export interface ActionOptions {
  /** true=유료(전체 노출 의도) / false=무료(오늘딱하나+일부). 기본 false. */
  isPaid?: boolean;
}

// ---------------------------------------------------------------------------
// 핵심: gapItem → action (4분류 번역 + 오늘 딱 하나 선정)
// ---------------------------------------------------------------------------

/**
 * P2-R4 gapItem 을 S5 행동 카드(action)로 번역한다.
 *
 * 번역:
 *   - gapItem.actionTier(self_fix|snippet|vendor|ongoing) → 4분류 tier(green_self 등).
 *   - gapItem.label → title(사장님 언어 그대로 승계 — 코드값 0).
 *   - 직접건(green_self) → deeplink(바로가기) + doneable=true.
 *   - PriorityGap 우선순위 룰(pickTodayOneIndex) → isTodayOne=true 정확히 1개.
 *   - gapItem.isPaid 승계(단, 오늘 딱 하나는 강제 무료 — 화면이 항상 노출).
 *
 * 정직성: 노출/순위 보장 단정 0(응원 톤). 4분류 누가-하나 부착(actionTierToLabel).
 */
export function deriveActions(gapItems: GapItem[], options: ActionOptions = {}): Action[] {
  if (gapItems.length === 0) return [];
  // 유료 경계 의도(전체 노출). 무료여도 오늘 딱 하나는 항상 노출(아래 강제 무료)이라 분기 불요지만,
  // 옵션을 명시적으로 소비해 호출 의도(전체/일부)를 기록한다(route 폴백과 동형 시그니처).
  void options.isPaid;

  // "오늘 딱 하나" 선정 — 사장님이 바로 실행 가능한 순서(직접건 우선, 가장 급한 것).
  const todayOneIndex = pickTodayOneIndex(gapItems);

  return gapItems.map((g, idx) => {
    const tier = actionTierToClass(g.actionTier);
    const isTodayOne = idx === todayOneIndex;
    const action: Action = {
      id: g.id,
      title: g.label, // gapItem 은 사장님 언어 label — 그대로 행동 제목으로 승계.
      tier,
      isTodayOne,
      doneable: isDoneable(tier),
      // 오늘 딱 하나는 절대 유료 잠금 뒤가 아니다(무료 보장). 그 외는 gapItem.isPaid 승계.
      isPaid: isTodayOne ? false : g.isPaid,
    };
    // deeplink 는 직접건(green_self)에만. 업체 연결/중개 코드 금지(07 §5) — 공식 수정 화면뿐.
    const link = tier === "green_self" ? deeplinkFor(g) : undefined;
    if (link) action.deeplink = link;
    return action;
  });
}

// ---------------------------------------------------------------------------
// "오늘 딱 하나" 우선순위 룰 (REFACTOR: 분리)
// ---------------------------------------------------------------------------
//
// PriorityGap 활용 — 사장님이 "오늘 바로" 끝낼 수 있는 순서로 단 하나를 고른다.
// 원칙(05 단일 우선순위 + 정직성): 진짜 큰 레버이면서 사장님이 직접 끝낼 수 있는 것 우선.
//   1순위: 직접건(green_self) 중 가장 급한(priority 작은) 것 — 오늘 5분이면 끝남.
//   2순위(직접건 부재): 전체 중 가장 급한(priority 작은) 것 — 그래도 정확히 1개.
// 동률은 입력 순서(이미 priority 정렬됨) 유지 → 항상 정확히 1개 선정(다중 강조 0).

/** "오늘 딱 하나"로 강조할 gapItem 인덱스를 고른다(정확히 1개 보장). */
export function pickTodayOneIndex(gapItems: GapItem[]): number {
  if (gapItems.length === 0) return -1;

  // 1순위: 직접건(self_fix) 중 가장 급한 것 — 오늘 바로 끝낼 수 있는 것.
  let bestSelf = -1;
  let bestSelfPriority = Number.POSITIVE_INFINITY;
  // 2순위: 전체 중 가장 급한 것(직접건 부재 폴백).
  let bestAny = 0;
  let bestAnyPriority = Number.POSITIVE_INFINITY;

  for (let i = 0; i < gapItems.length; i++) {
    const g = gapItems[i];
    if (!g) continue;
    if (g.priority < bestAnyPriority) {
      bestAnyPriority = g.priority;
      bestAny = i;
    }
    if (g.actionTier === "self_fix" && g.priority < bestSelfPriority) {
      bestSelfPriority = g.priority;
      bestSelf = i;
    }
  }

  return bestSelf >= 0 ? bestSelf : bestAny;
}

// ---------------------------------------------------------------------------
// action_intro 헤드라인 (응원 톤 — 노출/순위 보장 단정 0)
// ---------------------------------------------------------------------------

/**
 * S5 action_intro — 행동 개수로 정직 한 문장(응원 톤). 보장 아님·격차 안내.
 * 정직성: 노출/순위 보장 단정 0("도움이 돼요"), 전문용어/룰 코드값 0, 인과 단정 0.
 */
export function buildActionIntro(actionCount: number): string {
  if (actionCount <= 0) {
    // 측정 부재 ≠ 실측 우위 — "잘 하고 계세요" 승리 단정 금지. 정직하게 미확인 상태 표시.
    return "아직 추천할 행동을 찾지 못했어요. 진단이 완료되면 채워드릴게요.";
  }
  return "오늘은 딱 하나만 해봐요. 하나씩 해나가면 손님 만나는 데 도움이 돼요.";
}

// ---------------------------------------------------------------------------
// route(view) 경로용: persisted gapItem 부재 시 정직 폴백
// ---------------------------------------------------------------------------
//
// 저장된 gapItem 이 없는 read 경로(route)는 "행동 없음"을 정직하게 노출한다 — 추측 행동 0
// (빈 배열) + 오늘 딱 하나 null + 응원 인트로. 저장된 gapItem 이 있으면 deriveActionViewFromGapItems 를 쓴다.

/** route(view) 폴백 결과 — 화면이 그대로 렌더(S5 today_one + 4분류 카드 + paid lock). */
export interface ActionViewResult {
  /** 4분류 행동 카드(빈 배열이면 카드 생략). */
  actions: Action[];
  /** "오늘 딱 하나" 단일 행동(없으면 null — 추측 안 함). */
  todayOne: Action | null;
  /** S5 action_intro 한 문장(빈 배열이면 응원). */
  intro: string;
  /** true=유료(전체) / false=무료(오늘딱하나+일부). 화면 잠금 카드 분기용. */
  isPaid: boolean;
}

/**
 * 전체 gapItem 없이(view 만으로) 행동 카드를 산출한다(v1 정직 폴백).
 *
 * 정직성: gapItem 이 없으면 추측 행동을 만들지 않는다(빈 배열 = 카드 생략).
 * "오늘 딱 하나"도 만들지 않는다(todayOne=null) — 추측 강조 0. 인트로는 응원 톤.
 */
export function deriveActionViewFromView(options: ActionOptions = {}): ActionViewResult {
  const actions: Action[] = [];
  return {
    actions,
    todayOne: null,
    intro: buildActionIntro(actions.length),
    isPaid: options.isPaid === true,
  };
}

// ---------------------------------------------------------------------------
// route(view) 경로용: 영속화된 갭(gapItem) → S5 행동 카드 (실데이터 경로)
// ---------------------------------------------------------------------------
//
// 04 §4 영속화 이후: gap_rows 가 DB 에 기록되므로(gap-service deriveGapViewFromPersisted 로 gapItem
// 복원), route 는 추측 폴백 대신 실데이터 gapItem → deriveActions(4분류 + 오늘 딱 하나)로 렌더한다.
// 룰 코드값/점수 비노출(gapItem 이 이미 차단). "오늘 딱 하나"는 정확히 1개(무료 보장).

/**
 * 영속화된 gapItem(gap_rows 복원) → S5 행동 카드(실데이터 경로 — 추측 0).
 *
 * 정직성: gapItem 이 비면 행동 0(빈 배열) + 오늘 딱 하나 null(추측 강조 0). 노출/순위 보장 단정 0.
 * gapItem 이 있으면 deriveActions 로 4분류 + 오늘 딱 하나(정확히 1개) 산출 → todayOne 부착.
 */
export function deriveActionViewFromGapItems(
  gapItems: GapItem[],
  options: ActionOptions = {},
): ActionViewResult {
  const isPaid = options.isPaid === true;
  if (gapItems.length === 0) {
    return { actions: [], todayOne: null, intro: buildActionIntro(0), isPaid };
  }
  const actions = deriveActions(gapItems, { isPaid });
  const todayOne = actions.find((a) => a.isTodayOne) ?? null;
  return { actions, todayOne, intro: buildActionIntro(actions.length), isPaid };
}

// ---------------------------------------------------------------------------
// 내부 매핑·헬퍼 (REFACTOR: 분리)
// ---------------------------------------------------------------------------

/**
 * gapItem.actionTier → S5 4분류(green_self/yellow_copy/red_vendor/gray_ongoing).
 * 4분류 사장님 언어 라벨은 P1-S0 actionTierToLabel 이 담당(누가-하나 부착 보장).
 */
function actionTypeToClass(actionTier: GapItem["actionTier"]): ActionTierClass {
  switch (actionTier) {
    case "self_fix":
      return "green_self";
    case "snippet":
      return "yellow_copy";
    case "vendor":
      return "red_vendor";
    case "ongoing":
      return "gray_ongoing";
  }
}

/** actionTypeToClass alias — 명시적 export 친화 이름(테스트 가독). */
function actionTierToClass(actionTier: GapItem["actionTier"]): ActionTierClass {
  const cls = actionTypeToClass(actionTier);
  // 4분류 누가-하나 라벨이 사전에 존재함을 보증(없으면 개발 단계에서 즉시 드러남).
  void actionTierToLabel(cls);
  return cls;
}

/**
 * tier 별 사장님이 직접 끝낼 수 있는지(doneable).
 * green_self(직접 5분) true / gray_ongoing(꾸준히, 본인 영역) true /
 * yellow_copy(복붙 — 생성물 받아 붙이기, 본인 가능) true / red_vendor(업체) false.
 */
function isDoneable(tier: ActionTierClass): boolean {
  return tier !== "red_vendor";
}

/**
 * 직접건(green_self) 바로가기 deeplink.
 *
 * v1: 직접 고치는 공식 화면(네이버 플레이스 수정)으로 안내한다 — 업체 연결/중개 코드 0(07 §5).
 * 갭 카테고리(노출 등)와 무관하게 직접건의 공통 진입점은 네이버 플레이스 수정 화면이다
 * (사장님이 영업시간·소개·연락처를 직접 채우는 곳). 갭별 정밀 딥링크는 영속화([OPEN]) 후 확장.
 */
function deeplinkFor(_gap: GapItem): string {
  return NAVER_PLACE_EDIT_DEEPLINK;
}

/** 네이버 플레이스(스마트플레이스) 수정 진입 — 직접건 공통 바로가기. */
const NAVER_PLACE_EDIT_DEEPLINK = "https://new.smartplace.naver.com/";
