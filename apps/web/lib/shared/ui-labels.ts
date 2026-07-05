// @TASK P1-S0 - enum→UI 변환 단일 함수 (사장님 언어)
// @SPEC specs/shared/types.yaml (Signal/Channel/ActionTier/AssetType → 사장님 언어)
// @SPEC docs/planning/05-design-system.md §5 (정직성 카피 가드)
// @TEST apps/web/tests/shared/ui-labels.test.ts
//
// 정직성 가드 (07-coding-convention §카피 가드, 양보 불가):
//   1. 전문용어(SEO/AEO/GEO/snippet/SERP 등) 노출 label에 0건
//   2. 반환값에 점수(number) 필드 없음 — signalToLabel 은 Signal string만 받음
//   3. 인과 단정("고치면 1위/매출↑") 0건
//   4. 응원 톤 유지

/** types.yaml Signal enum */
export type Signal = "green" | "yellow" | "red";

/** types.yaml Channel enum */
export type Channel = "naver" | "google" | "ai";

/** types.yaml ActionTier enum */
export type ActionTier = "green_self" | "yellow_copy" | "red_vendor" | "gray_ongoing";

/** types.yaml AssetType enum */
export type AssetType = "snippet" | "place_intro" | "review_request" | "vendor_prescription";

/** types.yaml DiagnosisStatus enum */
export type DiagnosisStatus = "queued" | "running" | "done" | "failed";

// ── Signal ────────────────────────────────────────────────────────────────

export const SIGNAL_EMOJI: Record<Signal, string> = {
  green: "🟢",
  yellow: "🟡",
  red: "🔴",
};

export interface SignalLabel {
  emoji: string;
  summary: string;
}

/**
 * Signal enum → 사장님 언어 한 줄.
 *
 * 가드: 반환값에 score/number 필드 없음. 전문용어 0. 인과 단정 0.
 * props로 number를 받지 않는다 — Signal string만.
 */
export function signalToLabel(signal: Signal): SignalLabel {
  switch (signal) {
    case "green":
      return {
        emoji: "🟢",
        summary: "잘 되고 있어요. 지금처럼만 해요!",
      };
    case "yellow":
      return {
        emoji: "🟡",
        summary: "조금만 더 채우면 훨씬 잘 보여요.",
      };
    case "red":
      return {
        emoji: "🔴",
        summary: "아직 잘 안 보여요. 같이 고쳐봐요.",
      };
  }
}

// ── Channel ──────────────────────────────────────────────────────────────────

export interface ChannelLabel {
  label: string;
  description: string;
}

/**
 * Channel enum → 사장님 언어.
 * 가드: SERP/SEO/AEO/GEO 노출 금지. 연료(레버) 프레이밍.
 */
export function channelToLabel(channel: Channel): ChannelLabel {
  switch (channel) {
    case "naver":
      return {
        label: "네이버",
        description: "네이버에서 얼마나 잘 보이나요",
      };
    case "google":
      return {
        label: "구글(맛보기)",
        description: "구글에서 얼마나 잘 보이나요",
      };
    case "ai":
      return {
        label: "AI 추천",
        description: "챗GPT 같은 AI가 가게를 추천하나요",
      };
  }
}

// ── ActionTier ───────────────────────────────────────────────────────────────

export interface ActionTierLabel {
  emoji: string;
  label: string;
  description: string;
}

/**
 * ActionTier enum → 사장님 언어 4분류.
 * 가드: 누가-하나 표기. 전문용어 0. 부담 수준 정직.
 *
 * 방어(런타임 크래시 0): 알 수 없는 값(타입 밖 — 예: 변환 누락된 도메인 actionTier 가
 * 직접 유입)이 와도 undefined 를 반환하지 않는다. 호출부가 .emoji/.label 에 안전하게
 * 접근할 수 있도록 중립 폴백을 돌려준다(화면 전체 크래시 방지). 올바른 라벨은 호출 전
 * gapActionTierToClass 등으로 enum 정합을 맞추는 것이 1차이며, 폴백은 2차 안전망이다.
 */
export function actionTierToLabel(tier: ActionTier): ActionTierLabel {
  switch (tier) {
    case "green_self":
      return {
        emoji: "🟢",
        label: "직접 (5분·무료)",
        description: "사장님이 직접 5분이면 할 수 있어요.",
      };
    case "yellow_copy":
      return {
        emoji: "🟡",
        label: "복붙",
        description: "아래 글을 복사해서 붙여넣으면 돼요.",
      };
    case "red_vendor":
      return {
        emoji: "🔴",
        label: "업체에 맡기기",
        description: "전문 업체에 맡기는 게 편해요. 처방전 이메일을 드릴게요.",
      };
    case "gray_ongoing":
      return {
        emoji: "⏳",
        label: "꾸준히",
        description: "리뷰·사진 등 시간을 들일수록 좋아져요.",
      };
    default:
      // 타입 밖 값(런타임 방어) — 사장님 언어 중립 라벨. 크래시 0.
      return {
        emoji: "📌",
        label: "할 일",
        description: "어떻게 하면 좋을지 안내해 드릴게요.",
      };
  }
}

// ── AssetType ────────────────────────────────────────────────────────────────

export interface AssetTypeLabel {
  label: string;
  description: string;
}

/**
 * AssetType enum → 사장님 언어.
 * 가드: 'snippet' 영어 노출 금지. 전문용어 0.
 */
export function assetTypeToLabel(assetType: AssetType): AssetTypeLabel {
  switch (assetType) {
    case "snippet":
      return {
        label: "검색 답변글",
        description: "AI가 가게를 소개할 때 쓰는 답변글이에요.",
      };
    case "place_intro":
      return {
        label: "가게 소개글",
        description: "네이버·구글에 올릴 가게 소개글이에요.",
      };
    case "review_request":
      return {
        label: "리뷰 요청 문구",
        description: "손님에게 리뷰를 부탁할 때 쓰는 문구예요.",
      };
    case "vendor_prescription":
      return {
        label: "업체 처방전",
        description: "전문 업체에 전달할 개선 요청 이메일이에요.",
      };
  }
}

// ── DiagnosisStatus ──────────────────────────────────────────────────────────

export interface DiagnosisStatusLabel {
  label: string;
  description: string;
}

/**
 * DiagnosisStatus enum → 사장님 언어.
 * 가드: 기술 용어(queued/running/failed) 노출 금지.
 */
export function diagnosisStatusToLabel(status: DiagnosisStatus): DiagnosisStatusLabel {
  switch (status) {
    case "queued":
      return {
        label: "준비 중",
        description: "곧 살펴볼게요.",
      };
    case "running":
      return {
        label: "살펴보는 중",
        description: "가게 정보를 확인하고 있어요. 잠깐만요!",
      };
    case "done":
      return {
        label: "다 봤어요",
        description: "결과가 나왔어요. 확인해볼까요?",
      };
    case "failed":
      return {
        label: "잠깐 멈췄어요",
        description: "다시 시도해볼게요. 걱정 마세요.",
      };
  }
}
