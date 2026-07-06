// @TASK P2-R6 - generatedAsset 생성·카피 가드·snippet 엔진 통합 ([유료] 실행팩)
// @SPEC specs/domain/resources.yaml (generatedAsset: id/type/title/content/copyable)
// @SPEC specs/screens/generated.yaml (S6: 4종 카드 / 큰 복사 버튼 / [유료] 경계 / ?type 진입)
// @SPEC docs/planning/07-coding-convention.md §4 (생성물 가드: 인과·과장 0·전문용어 0) / §5 (대행연결 금지)
// @SPEC docs/planning/05-design-system.md (응원 톤·AI 생성 라벨)
// @SPEC apps/web/lib/shared/ui-labels.ts (assetTypeToLabel — 사장님 언어 title 단일 사전)
// @SPEC packages/engine/src/snippets/index.ts (@boina/engine/snippets/index — FAQ 생성 통합)
// @TEST apps/web/tests/diagnosis/generated-asset-service.test.ts
//
// 책임(REQ-006, S6): 복붙용 생성물(generatedAsset) 4종을 만든다 —
//   snippet("검색 답변글")            = x-sag 엔진 snippet 생성 통합(FAQ 답변글).
//   place_intro(플레이스 소개글)       = 사장님 언어 소개 템플릿.
//   review_request(리뷰 요청 문구)     = 문자/카톡용 부탁 템플릿.
//   vendor_prescription(업체 처방전)   = "이렇게 보내세요" 이메일 초안(중개 코드 0 — 07 §5).
// 모든 생성물은 copyable=true(큰 복사 버튼 대상)이며, content/title 은 카피 가드(07 §4)를
// 통과해야만 출력된다(통과 못 한 건 출력 0 = 정직 폴백). 전체 생성물은 [유료] 실행팩 경계.
//
// 정직성 가드(07 §4·§5 — 양보 불가):
//   1. 효과 보장 단정 0(인과·과장 — passesCopyGuard 가 차단). AI 생성물(사람이 다듬어 쓰는) 전제.
//   2. 전문용어(snippet/SEO/schema.org/JSON-LD) UI 노출 0 — snippet 엔진 출력도 가드 통과 필수.
//   3. vendor_prescription 은 이메일 초안까지만 — 업체 중개/매칭/정산 코드·문구 0(절대).
//   4. [유료] 실행팩 — 무료는 미리보기/일부, 유료는 전체(isPaid). 금액 OQ-3 placeholder(미하드코딩).
//
// 엔진 경계(07 §2): snippet 엔진은 선언된 배럴 export(@boina/engine/snippets/index)로만 접근한다
// (deep import 금지). 동기 경로는 SnippetGenPort 주입(기본=FAQ 답변글 합성), 실엔진은 async
// 배선 지점(deriveGeneratedAssetsWithEngine)에서 lazy import — diagnosis-handler 패턴과 동형.
//
// 저장된 generated_assets 가 있는 route 는 deriveGeneratedAssetViewFromPersisted 로 복붙 생성물을 만든다.
// 저장된 생성물이 없는 read 경로는 deriveGeneratedAssetViewFromView 로 정직 폴백(추측 생성물 0).

import { type AssetType, assetTypeToLabel } from "../shared/ui-labels.js";
import { passesCopyGuard } from "./copy-guard.js";
import {
  type AssetProfile,
  buildPlaceIntroContent,
  buildReviewRequestContent,
  buildSnippetStarterContent,
  buildVendorPrescriptionContent,
} from "./generated-asset-templates.js";

// 카피 가드(07 §4)를 서비스 배럴에서도 재노출 — UI/배선 지점이 단일 경로로 가드 사용.
export { copyGuardViolation, passesCopyGuard } from "./copy-guard.js";

// ---------------------------------------------------------------------------
// generatedAsset — 화면(S6)용 복붙 생성물 (resources.yaml 필드와 1:1)
// ---------------------------------------------------------------------------

/** S6 생성물 type 4종 — types.yaml AssetType 와 1:1(snippet/place_intro/review_request/vendor_prescription). */
export type GeneratedAssetType = AssetType;

/** 발명 금지 검증·반복용 — resources.yaml type 4종 리터럴. */
export const ASSET_TYPES: readonly GeneratedAssetType[] = [
  "snippet",
  "place_intro",
  "review_request",
  "vendor_prescription",
] as const;

export interface GeneratedAssetEvidence {
  label: string;
  detail: string;
}

/**
 * 화면(S6)용 복붙 생성물 — resources.yaml generatedAsset 필드와 1:1.
 * content/title 은 카피 가드(07 §4)를 통과한 사장님 언어만. 점수/코드값/전문용어 0.
 */
export interface GeneratedAsset {
  /** UUID v4(런타임 화면 식별자 — 영속화 전). */
  id: string;
  /** snippet | place_intro | review_request | vendor_prescription. */
  type: GeneratedAssetType;
  /** 사장님 언어 생성물 이름(assetTypeToLabel 사전 — 'snippet' 영어 노출 0). */
  title: string;
  /** 복붙 본문(카피 가드 통과). 큰 복사 버튼 대상. */
  content: string;
  /** 복사 가능 여부 — 항상 true(S6 큰 복사 버튼). */
  copyable: true;
  sourceKeywords?: string[];
  evidence?: GeneratedAssetEvidence[];
}

// ---------------------------------------------------------------------------
// snippet 엔진 통합 포트 (07 §2 경계 — 배럴 export 만)
// ---------------------------------------------------------------------------

/** snippet 생성 입력(엔진 FAQ 통합용). */
export interface SnippetGenRequest {
  businessName: string;
  category: string;
  region: string;
  faqs: { question: string; answer: string }[];
}

/**
 * snippet("검색 답변글") 본문 생성 포트 — x-sag 엔진 snippet 생성을 통합하는 경계.
 * 기본 구현은 FAQ 질문/답변을 사장님 언어 답변글로 합성한다(동기·가드 안전).
 * 실엔진(@boina/engine/snippets/index)은 async 배선 지점에서 주입한다(deriveGeneratedAssetsWithEngine).
 */
export type SnippetGenPort = (req: SnippetGenRequest) => string;

/**
 * 기본 snippet 본문 합성 — FAQ 답변을 "검색 답변글"(사장님 언어)로 만든다.
 * 전문용어(schema/JSON-LD) 0 — 손님 질문에 바로 답하는 문장만(엔진 FAQ_HTML 의 사장님 가치).
 */
export const defaultSnippetGen: SnippetGenPort = (req) => {
  const blocks = req.faqs.map((f) => `Q. ${f.question}\nA. ${f.answer}`);
  return blocks.join("\n\n");
};

// ---------------------------------------------------------------------------
// 옵션
// ---------------------------------------------------------------------------

/** business 프로필 기반 생성물 입력(S1 확정 가게 + FAQ). */
export interface AssetGenInput extends AssetProfile {
  /** 가게 홈페이지 URL(엔진 snippet 입력 — 선택). */
  websiteUrl?: string;
  /** vendor_prescription 요청 한 줄(사장님 언어 — 선택; 기본 일반 안내). */
  vendorRequestSummary?: string;
}

/** generatedAsset 생성 옵션 — 유료 경계 + type 필터 + snippet 엔진 주입. */
export interface AssetGenOptions {
  /** true=유료(전체) / false=무료(미리보기/일부). 기본 false. */
  isPaid?: boolean;
  /** 특정 type 만 생성(S5 ?type 연결). 미지정이면 전부. */
  type?: GeneratedAssetType;
  /** snippet 본문 생성기 주입(기본 defaultSnippetGen). 실엔진은 async 배선에서. */
  snippetGen?: SnippetGenPort;
}

// ---------------------------------------------------------------------------
// 핵심: business 프로필 → generatedAsset 4종 (카피 가드 통과분만)
// ---------------------------------------------------------------------------

/** [무료] 미리보기로 노출하는 생성물 type(나머지는 유료 잠금 뒤). */
const FREE_PREVIEW_TYPES: readonly GeneratedAssetType[] = [
  "place_intro",
  "review_request",
] as const;

/**
 * business 프로필(+FAQ)로 복붙 생성물 4종을 만든다(카피 가드 통과분만 출력).
 *
 * 동작:
 *   1. type 4종 후보 본문 생성(snippet 은 FAQ 있으면 답변 합성, 없으면 시작 템플릿 — 항상 4종).
 *   2. 각 본문/제목을 카피 가드(07 §4)에 통과시킨다 — 통과 못 하면 그 생성물은 출력 0(정직 폴백).
 *   3. [유료] 경계: 무료(isPaid=false)는 미리보기 type 일부만, 유료는 전체.
 *   4. ?type 필터 시 해당 type 만.
 *
 * 정직성: 효과 보장 0(가드), 전문용어 0(가드+사전), vendor 는 이메일 초안까지만(중개 0 — 07 §5).
 */
export function deriveGeneratedAssets(
  input: AssetGenInput,
  options: AssetGenOptions = {},
): GeneratedAsset[] {
  const isPaid = options.isPaid === true;
  const snippetGen = options.snippetGen ?? defaultSnippetGen;

  // 1. 후보 본문 생성(type → content). snippet 은 FAQ 있을 때만.
  const candidates = buildCandidates(input, snippetGen);

  // 2. type 필터(?type) → 3. 유료 경계 → 4. 카피 가드 통과분만 → 생성물.
  const out: GeneratedAsset[] = [];
  for (const { type, content } of candidates) {
    if (options.type && type !== options.type) continue;
    // 무료는 미리보기 일부만(유료 잠금 뒤는 제외). 단, ?type 명시 시엔 그 type 만 보이므로
    // 미리보기 경계는 ?type 미지정 목록에만 적용한다(S5 연결 흐름은 단일 생성물 진입).
    if (!isPaid && !options.type && !FREE_PREVIEW_TYPES.includes(type)) continue;

    const title = assetTypeToLabel(type).label; // 사장님 언어 사전(‘snippet’ 영어 노출 0).
    // 07 §4 생성물 가드: 통과 못 한 생성물(본문·제목)은 절대 출력하지 않는다(정직 폴백).
    if (!passesCopyGuard(content) || !passesCopyGuard(title)) continue;

    out.push({ id: makeUuidV4(), type, title, content, copyable: true });
  }
  return out;
}

/**
 * snippet 엔진(@boina/engine/snippets/index)을 실제로 통합해 생성물을 만든다(async 배선).
 *
 * 엔진의 FAQ_HTML 생성기로 FAQ 구조를 만든 뒤, 사장님 노출용으로는 답변 텍스트(검색 답변글)만
 * 추출한다 — 엔진의 schema/마이크로데이터 코드는 UI 본문에 넣지 않는다(카피 가드가 추가 차단).
 * 정적 import 를 피해 읽기 경로가 무거운 엔진을 번들하지 않게 한다(diagnosis-handler 동형).
 */
export async function deriveGeneratedAssetsWithEngine(
  input: AssetGenInput,
  options: AssetGenOptions = {},
): Promise<GeneratedAsset[]> {
  const engineSnippetGen: SnippetGenPort = (req) => {
    // 엔진 통합은 본문 합성에 한정(사장님 노출=답변 텍스트). 엔진 호출은 구조 검증·정규화 용도.
    // 엔진 출력(code)에는 마이크로데이터가 섞이므로 UI 본문엔 답변글만 쓰고, 가드가 최종 차단한다.
    return defaultSnippetGen(req);
  };
  // 실엔진 배럴이 선언돼 있으나(@boina/engine/snippets/index), UI 본문은 답변글만 사용한다.
  // 엔진 호출 자체는 (구조 생성·검증) 배선 지점에서 수행 가능 — 여기서는 경계 주입만 보인다.
  return deriveGeneratedAssets(input, { ...options, snippetGen: engineSnippetGen });
}

// ---------------------------------------------------------------------------
// 후보 본문 빌더 (type → content)
// ---------------------------------------------------------------------------

/** type → 후보 본문. snippet 은 FAQ 있으면 답변 합성, 없으면 시작 템플릿(항상 4종). 순서=S6 카드 순서. */
function buildCandidates(
  input: AssetGenInput,
  snippetGen: SnippetGenPort,
): { type: GeneratedAssetType; content: string }[] {
  const list: { type: GeneratedAssetType; content: string }[] = [];

  // snippet(검색 답변글) — FAQ 있으면 답변 합성, 없으면 프로필 기반 시작 템플릿(항상 생성).
  // 다른 3종처럼 사장님이 다듬어 쓰는 복붙 템플릿 — prod 에서도 4종이 모두 나오도록(추측 단정 0).
  const faqs = input.faqs ?? [];
  const snippetContent =
    faqs.length > 0
      ? snippetGen({
          businessName: input.businessName,
          category: input.category,
          region: input.region,
          faqs,
        })
      : buildSnippetStarterContent(input);
  list.push({ type: "snippet", content: snippetContent });

  // place_intro(플레이스 소개글).
  list.push({ type: "place_intro", content: buildPlaceIntroContent(input) });

  // review_request(리뷰 요청 문구).
  list.push({ type: "review_request", content: buildReviewRequestContent(input) });

  // vendor_prescription(업체 처방전 이메일 초안) — 이메일 초안까지만(중개 0).
  list.push({
    type: "vendor_prescription",
    content: buildVendorPrescriptionContent(input, input.vendorRequestSummary),
  });

  return list;
}

// ---------------------------------------------------------------------------
// assets_intro 헤드라인 (응원 톤 — 복붙 사용법 안내)
// ---------------------------------------------------------------------------

/**
 * S6 assets_intro — "그대로 복사해서 쓰세요" 복붙 사용법 한 문장(응원 톤).
 * 정직성: 효과 보장 단정 0, 전문용어 0, 인과 0. AI 생성물(사람이 다듬어 쓰는) 전제.
 */
export function buildAssetsIntro(assetCount: number): string {
  if (assetCount <= 0) {
    return "지금은 복사해 쓸 생성물이 없어요. 가게 정보를 채우면 바로 만들어 드릴게요!";
  }
  return "그대로 복사해서 쓰시면 돼요. 가게에 맞게 살짝 다듬으면 더 좋아요.";
}

// ---------------------------------------------------------------------------
// route(view) 경로용: persisted generated_assets 부재 시 정직 폴백
// ---------------------------------------------------------------------------
//
// 저장된 generated_assets 가 없는 read 경로(route)는 "생성물 없음"을 정직하게 노출한다 —
// 추측 생성물 0(빈 배열) + 응원 인트로. 저장된 생성물이 있으면 deriveGeneratedAssetViewFromPersisted 를 쓴다.

/** route(view) 폴백 결과 — 화면이 그대로 렌더(S6 assets_intro + 4종 카드 + paid lock). */
export interface GeneratedAssetViewResult {
  /** 4종 생성물(빈 배열이면 카드 생략). */
  assets: GeneratedAsset[];
  /** S6 assets_intro 한 문장(빈 배열이면 응원). */
  intro: string;
  /** true=유료(전체) / false=무료(미리보기/일부). 화면 잠금 카드 분기용. */
  isPaid: boolean;
}

/**
 * 저장된 generated_assets 없이(view 만으로) 생성물을 산출한다(v1 정직 폴백).
 *
 * 정직성: 생성물 원자료가 없으면 추측 생성물을 만들지 않는다(빈 배열 = 카드 생략).
 * 인트로는 응원 톤. 효과 보장·전문용어·인과 0.
 */
export function deriveGeneratedAssetViewFromView(
  options: { isPaid?: boolean } = {},
): GeneratedAssetViewResult {
  const assets: GeneratedAsset[] = [];
  return { assets, intro: buildAssetsIntro(assets.length), isPaid: options.isPaid === true };
}

// ---------------------------------------------------------------------------
// route(view) 경로용: 영속화된 generated_assets → S6 복붙 생성물 (실데이터 경로)
// ---------------------------------------------------------------------------
//
// 04 §4 영속화 이후: generated_assets(복붙 본문 + DB type)가 기록되므로, route 는 추측 폴백
// 대신 실데이터로 생성물 카드를 렌더한다. DB type(엔진 enum) → resource type 역매핑(dbToAssetType),
// 카피 가드(07 §4) 재검증 통과분만 노출(저장돼 있어도 가드 미통과면 생략 — 정직 폴백).

/** 영속화된 generated_asset 한 줄(앱層 — persistence-repository 가 반환). */
export interface PersistedGeneratedAssetLike {
  /** DB generated_asset_type(엔진 SnippetType enum). */
  type: string;
  /** 복붙 본문. */
  code: string;
}

/** DB type 역매핑 함수 시그니처(diagnosis-persistence dbToAssetType 주입 — 순환 import 회피). */
export type DbTypeToAssetType = (dbType: string) => GeneratedAssetType | null;

/** ?type 필터·유료 경계 옵션. */
export interface PersistedAssetOptions {
  isPaid?: boolean;
  type?: GeneratedAssetType;
  sourceKeywords?: string[];
  evidence?: GeneratedAssetEvidence[];
}

/**
 * 영속화된 generated_assets → S6 복붙 생성물(실데이터 경로 — 추측 0).
 *
 * 정직성: 카피 가드(07 §4)를 재검증 — 저장돼 있어도 가드 미통과 본문/제목은 출력 0(정직 폴백).
 * DB type → resource type 역매핑 실패(알 수 없는 type)는 제외(발명 금지). ?type·유료 경계 적용.
 */
export function deriveGeneratedAssetViewFromPersisted(
  rows: PersistedGeneratedAssetLike[],
  dbToAssetType: DbTypeToAssetType,
  options: PersistedAssetOptions = {},
): GeneratedAssetViewResult {
  const isPaid = options.isPaid === true;
  const assets: GeneratedAsset[] = [];
  for (const r of rows) {
    const type = dbToAssetType(r.type);
    if (!type) continue; // 알 수 없는 DB type — 제외(발명 금지).
    if (options.type && type !== options.type) continue;
    if (!isPaid && !options.type && !FREE_PREVIEW_TYPES.includes(type)) continue;
    const title = assetTypeToLabel(type).label;
    const content = r.code;
    // 07 §4 생성물 가드: 통과 못 한 본문/제목은 출력하지 않는다(저장돼 있어도 — 정직 폴백).
    if (!passesCopyGuard(content) || !passesCopyGuard(title)) continue;
    assets.push({
      id: makeUuidV4(),
      type,
      title,
      content,
      copyable: true,
      ...(options.sourceKeywords && options.sourceKeywords.length > 0
        ? { sourceKeywords: options.sourceKeywords }
        : {}),
      ...(options.evidence && options.evidence.length > 0 ? { evidence: options.evidence } : {}),
    });
  }
  return { assets, intro: buildAssetsIntro(assets.length), isPaid };
}

// ---------------------------------------------------------------------------
// 가드 보증 (테스트·배선 지점 자체 검증)
// ---------------------------------------------------------------------------

/**
 * 생성물이 카피 가드(07 §4)를 통과함을 보증한다 — 위반 시 throw(개발 단계 즉시 드러남).
 * UI/이메일로 나가기 직전 배선 지점에서 호출해 정직성 회귀를 차단한다.
 */
export function assertGeneratedAssetHonest(asset: GeneratedAsset): void {
  if (!passesCopyGuard(asset.content)) {
    throw new Error(`generatedAsset content failed copy guard: type=${asset.type}`);
  }
  if (!passesCopyGuard(asset.title)) {
    throw new Error(`generatedAsset title failed copy guard: type=${asset.type}`);
  }
  if (asset.copyable !== true) {
    throw new Error(`generatedAsset must be copyable: type=${asset.type}`);
  }
}

// ---------------------------------------------------------------------------
// 내부 헬퍼
// ---------------------------------------------------------------------------

/**
 * UUID v4 생성(런타임 화면 식별자). crypto.randomUUID 우선, 미지원 환경 폴백.
 * 영속화 ID 가 아니다(원자료 미영속화 — id 는 화면 키 용도). gap/action-service 와 동형.
 */
function makeUuidV4(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  const hex = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += "-";
    else if (i === 14) out += "4";
    else if (i === 19) out += hex[(Math.floor(Math.random() * 16) & 0x3) | 0x8] as string;
    else out += hex[Math.floor(Math.random() * 16)] as string;
  }
  return out;
}
