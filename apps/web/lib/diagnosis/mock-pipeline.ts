// @TASK dev-mock-pipeline - dev/실키없음 진단 파이프라인 mock 완주 (실 크롤/외부호출 0)
// @SPEC docs/planning/02-trd.md §2 (데이터소스·비용 게이팅 — 실키 없으면 mock 완주)
// @SPEC docs/planning/04-database-design.md §3·§4 (5종 테이블을 채울 산출 — engine_result/competitor/gap_row/asset/action)
// @SPEC docs/planning/07-coding-convention.md §4 (점수 비노출 / "(샘플)" 정직성 표기)
// @SPEC apps/web/lib/shared/runtime-env.ts (isMockFallbackAllowed — production 아니면 mock 허용)
// @TEST apps/web/tests/diagnosis/mock-pipeline.test.ts
//
// 배경(브라우저 실사용 버그): dev 서버에서 진단이 항상 failed 였다 — diagnosis-handler 의
// defaultRunPipeline 이 dev 에서도 실 @boina/engine.runDiagnosisPipeline 을 호출해, mock 후보의
// 가짜 place.naver.com URL 을 실제로 크롤하려다 죽었다(place-search·경쟁사는 mock 인데 진단
// 파이프라인 자체는 mock 이 아니었음). 결과: 모든 진단 failed → S2~S6 빈 스켈레톤.
//
// 이 모듈은 실키 없는 dev/test(runtime-env.isMockFallbackAllowed)에서 실 엔진 대신 반환할
// "작은 가게" 샘플 DiagnosisPipelineOutput 을 결정적으로 만든다. 실 크롤/LLM/SERP 호출 0.
//   - 엔진 출력 타입(@boina/engine DiagnosisPipelineOutput)에 정확히 맞춘다.
//   - 영속화 매퍼(diagnosis-persistence)가 5종 테이블(engine_results·competitors·gap_rows·
//     generated_assets·actions)을 채우도록 충분한 항목/필드를 포함한다.
//   - 시나리오: 네이버 일부 노출(yellow)·구글 맛보기·AI 아직 미인용(red/yellow)·갭 6개(영업시간/
//     소개글/리뷰/FAQ/가격/공유 미리보기 — 사장님 언어)·행동 4분류·생성물 4종.
//   - 정직성: 모든 항목은 "(샘플)" 표기(가짜 실측 오인 금지). grounded 실인용 위조 0(AI green 사칭 0).
//   - 점수 비노출: 엔진 impactScore 는 내부 신호로만 둔다(매퍼가 UI 비노출 보증).

import type { DiagnosisItem } from "@boina/contracts/diagnosis";
import type { DiagnosisPipelineInput, DiagnosisPipelineOutput } from "@boina/engine";
import type {
  GapAnalyzerPort,
  GapInputLike,
  GapMatrixRowLike,
  GapResultLike,
  PriorityGapLike,
} from "./gap-service.js";

/** 샘플 항목 식별 마커(정직성) — 제목/설명에 부착해 가짜 실측으로 오인되지 않게 한다. */
export const MOCK_SAMPLE_MARKER = "(샘플)";

/** 결정적 UUID v4 형태 id(영속화는 DB defaultRandom — 여기 id 는 화면/추적 키 용도). */
function sampleItemId(n: number): string {
  const tail = n.toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${tail}`;
}

/**
 * dev/실키없음 생성물(snippet=검색 답변글) 입력용 샘플 FAQ.
 *
 * 생성물 4종(snippet/place_intro/review_request/vendor_prescription)을 채우려면 snippet 후보가
 * 필요한데, snippet 은 FAQ 가 있을 때만 생성된다(추측 답변 0). production 은 실 FAQ 미보유면
 * snippet 을 생략하지만, dev 는 이 샘플 FAQ 로 4종을 모두 보여 S6 가 빈 화면이 되지 않게 한다.
 * 본문은 "(샘플)" 표기로 정직성을 유지하며 카피 가드(효과 단정/전문용어 0)를 통과하는 사실 묘사다.
 */
export function buildMockAssetFaqs(businessName: string): { question: string; answer: string }[] {
  return [
    {
      question: "주차할 수 있나요?",
      answer: `${MOCK_SAMPLE_MARKER} 가까운 공영주차장을 이용하시면 편해요. 자세한 안내는 방문 전 문의해 주세요.`,
    },
    {
      question: "예약하고 가야 하나요?",
      answer: `${MOCK_SAMPLE_MARKER} 미리 연락 주시면 기다리지 않고 바로 안내해 드려요. ${businessName} 많이 찾아주세요.`,
    },
  ];
}

/** 항목이 dev-mock 샘플인지(정직성 표기 검증용). */
export function isMockSampleItem(item: Pick<DiagnosisItem, "title" | "description">): boolean {
  return item.title.includes(MOCK_SAMPLE_MARKER) || item.description.includes(MOCK_SAMPLE_MARKER);
}

/**
 * "작은 가게" 샘플 미통과 항목 6종(엔진 DiagnosisItem 형태).
 *
 * gap_rows = 고유 ruleId(code) 개수(self=미통과 / 경쟁사=통과 가정) → 6개 갭.
 * code 는 gap-service 의 사장님 언어 사전(GAP_LABEL_DICT)에 등록된 코드로 골라, gap_rows label 이
 * 룰 코드값 노출 없이 사장님 언어로 번역되게 한다(07 §4). 채널 분산:
 *   geo → naver(2) / seo → google(2) / aeo → ai_citation(2).
 * 행동 4분류 토대: self_fix / snippet_action / vendor_action / si_action 모두 포함.
 */
function buildSampleItems(): DiagnosisItem[] {
  const base = {
    isAiGenerated: false,
    recommendationText: null as string | null,
    pageUrl: null as string | null,
    ruleVersion: "1.0.0",
  } satisfies Partial<DiagnosisItem>;

  const defs: Array<{
    code: string;
    category: DiagnosisItem["category"];
    actionType: DiagnosisItem["actionType"];
    priority: DiagnosisItem["priority"];
    difficulty: DiagnosisItem["difficulty"];
    title: string;
    description: string;
    expectedEffect: string;
    relatedSnippetType: string | null;
    impactScore: number;
  }> = [
    // 노출(geo→naver) — 영업시간: 직접 5분이면 끝나는 큰 레버.
    {
      code: "GEO-OPENING-HOURS-001",
      category: "geo",
      actionType: "self_fix",
      priority: "high",
      difficulty: "easy",
      title: `${MOCK_SAMPLE_MARKER} 영업시간 안내가 부족해요`,
      description: `${MOCK_SAMPLE_MARKER} 영업시간이 또렷하게 안 적혀 있어요. 채우면 검색에서 알아보기 좋아져요.`,
      expectedEffect: "네이버에서 가게 정보를 알아보기 쉬워져요.",
      relatedSnippetType: null,
      impactScore: 30,
    },
    // 리뷰(geo→naver) — 후기 모음: 꾸준히 쌓는 영역(ongoing).
    {
      code: "GEO-REVIEW-AGGREGATE-001",
      category: "geo",
      actionType: "si_action",
      priority: "medium",
      difficulty: "medium",
      title: `${MOCK_SAMPLE_MARKER} 후기 모음 안내가 없어요`,
      description: `${MOCK_SAMPLE_MARKER} 손님 후기를 모아 보여주면 믿음을 주는 데 도움이 돼요.`,
      expectedEffect: "방문 전 손님이 믿고 찾아오는 데 도움이 돼요.",
      relatedSnippetType: null,
      impactScore: 18,
    },
    // 소개(seo→google) — 검색 소개 문구: 복붙 생성물로 채울 수 있는 항목(snippet).
    {
      code: "SEO-META-001",
      category: "seo",
      actionType: "snippet_action",
      priority: "medium",
      difficulty: "easy",
      title: `${MOCK_SAMPLE_MARKER} 검색에 뜨는 소개 문구가 없어요`,
      description: `${MOCK_SAMPLE_MARKER} 검색 결과에 보이는 한 줄 소개가 비어 있어요. 만들어 둔 문구를 붙이면 돼요.`,
      expectedEffect: "검색 결과에서 가게가 무슨 곳인지 한눈에 보여요.",
      relatedSnippetType: "FAQ_HTML",
      impactScore: 22,
    },
    // 소개(seo→google) — 공유 미리보기: 직접 손대기 어려워 업체에 맡길 만한 항목(vendor).
    {
      code: "SEO-OG-001",
      category: "seo",
      actionType: "vendor_action",
      priority: "low",
      difficulty: "hard",
      title: `${MOCK_SAMPLE_MARKER} 링크 공유 미리보기가 안 떠요`,
      description: `${MOCK_SAMPLE_MARKER} 링크를 공유할 때 미리보기가 안 떠요. 홈페이지 담당자에게 맡기면 좋아요.`,
      expectedEffect: "카톡·문자로 링크를 보낼 때 가게가 예쁘게 보여요.",
      relatedSnippetType: null,
      impactScore: 12,
    },
    // 묻고답하기(aeo→ai_citation) — FAQ: AI 가 답하기 좋게(snippet 으로 채움).
    {
      code: "AEO-FAQ-001",
      category: "aeo",
      actionType: "snippet_action",
      priority: "high",
      difficulty: "medium",
      title: `${MOCK_SAMPLE_MARKER} 자주 묻는 질문 안내가 없어요`,
      description: `${MOCK_SAMPLE_MARKER} 손님이 자주 묻는 질문/답을 적어두면 AI가 답하기 좋아져요.`,
      expectedEffect: "AI가 손님 질문에 우리 가게 정보로 답하기 좋아져요.",
      relatedSnippetType: "FAQ_HTML",
      impactScore: 26,
    },
    // 소개(aeo→ai_citation) — 가격 안내: 직접 채우는 항목(self_fix).
    {
      code: "AEO-PRICE-INFO-001",
      category: "aeo",
      actionType: "self_fix",
      priority: "low",
      difficulty: "easy",
      title: `${MOCK_SAMPLE_MARKER} 가격 안내가 안 적혀 있어요`,
      description: `${MOCK_SAMPLE_MARKER} 대표 메뉴 가격을 적어두면 손님과 AI 모두 안내하기 좋아져요.`,
      expectedEffect: "손님이 가격을 미리 알고 찾아오기 편해져요.",
      relatedSnippetType: null,
      impactScore: 10,
    },
  ];

  return defs.map((d, idx) => ({
    id: sampleItemId(idx + 1),
    code: d.code,
    category: d.category,
    actionType: d.actionType,
    priority: d.priority,
    title: d.title,
    description: d.description,
    evidence: { sample: true, surface: "dev-mock" },
    impactScore: d.impactScore,
    difficulty: d.difficulty,
    expectedEffect: d.expectedEffect,
    isAiGenerated: base.isAiGenerated,
    recommendationText: base.recommendationText,
    relatedSnippetType: d.relatedSnippetType,
    pageUrl: base.pageUrl,
    ruleVersion: base.ruleVersion,
  }));
}

/**
 * dev/실키없음에서 실 엔진 대신 반환할 "작은 가게" 샘플 DiagnosisPipelineOutput.
 *
 * 결정적(동일 입력 → 동일 산출 — 무작위/외부호출 0). partialResult=false 로 핸들러가 completed
 * 로 마감한다. 점수는 "작은 가게" 현실값(낮음~중간) — 신호등은 전달 레이어가 산출(여기 점수는
 * 내부 신호). llmValidation 은 grounded=false(학습기억 모드)로 두어 AI 채널 green 사칭 0(게이팅).
 */
export function buildMockDiagnosisOutput(input: DiagnosisPipelineInput): DiagnosisPipelineOutput {
  const items = buildSampleItems();
  const now = new Date(0).toISOString(); // 결정적 타임스탬프(고정).

  return {
    crawlResult: {
      pages: [],
      partialResult: false,
      startedAt: now,
      completedAt: now,
    },
    scores: {
      // "작은 가게" 현실 점수(낮음~중간). 엔진 내부 신호 — UI 비노출(07 §4).
      seoScore: 58,
      aeoScore: 41,
      geoScore: 63,
      perfScore: null,
      overallScore: 54,
      scoringVersion: "2.1.0",
    },
    items,
    recommendations: [],
    partialResult: false,
    platformLimitations: [],
    businessPresence: {
      primarySourceType: input.sourceType ?? "website",
      primaryUrl: input.startUrl,
      canonicalName: input.businessProfile.businessName,
      services: input.businessProfile.mainServices ?? [],
      surfaces: [],
      limitations: [],
    },
    // AI 아직 미인용(게이팅 유지): grounded=false → 채널 신호등이 green 으로 못 올린다(정직).
    // 경쟁사는 dev 샘플(naver_serp)이 competitor-derivation 에서 별도 산출되므로 여기선 비운다.
    llmValidation: {
      provider: "dev-mock",
      grounded: false,
      disclaimer:
        "개발 샘플 데이터예요(실 측정 아님). AI 추천은 준비가 쌓일수록 좋아져요. 너무 걱정 마세요.",
      geo: null,
      aeo: null,
    },
  };
}

// ---------------------------------------------------------------------------
// dev-mock GapAnalyzer (webpack-safe — 엔진 v2/gap 동적 import 폴백)
// ---------------------------------------------------------------------------
//
// ★ 배경: 잡 핸들러의 loadDefaultGapAnalyzer 는 엔진 GapAnalyzer 를 변수 specifier 로 동적
//   import(@boina/engine/v2/gap) 한다(web 타입체크가 엔진 gap 소스를 끌어오지 않게 하려는
//   의도). vitest/node 는 alias 로 해석되지만 Next dev(webpack) 는 "request of a dependency is
//   an expression" 으로 런타임 해석에 실패할 수 있다. 진단이 실 크롤 단계에서 죽던 시절엔
//   이 경로에 닿지 못해 가려져 있었으나, mock 완주로 영속화까지 도달하면서 드러났다.
//
//   이 모듈은 dev/실키없음 폴백용 GapAnalyzer 를 앱層에 둔다(엔진 동적 import 불필요).
//   알고리즘은 엔진 GapAnalyzer(packages/engine/src/v2/gap/analyzer.ts)와 동형이다 —
//   gap = 경쟁사 pass율 − 자기 pass율. production 은 계속 실 엔진 GapAnalyzer 를 쓴다(폴백 아님).

/** 엔진 GapAnalyzer 우선순위 가중치 미러(analyzer.ts 와 동일값). */
const MOCK_GAP_PRIORITY_WEIGHT: Record<string, number> = { high: 3, medium: 2, low: 1 };
/** 엔진 GapAnalyzer 행동 보너스 미러(analyzer.ts 와 동일값). */
const MOCK_GAP_ACTION_BONUS: Record<string, number> = {
  self_fix: 1.5,
  snippet_action: 1.3,
  vendor_action: 1.0,
  si_action: 0.7,
};

/**
 * dev/실키없음 폴백 GapAnalyzer — 엔진 GapAnalyzer 와 동형 알고리즘(앱層, 동적 import 0).
 *
 * gap = 경쟁사 pass율 − 자기 pass율(양수=경쟁사 우위). self-report 항목은 미통과(passed=false),
 * 경쟁사 리포트 항목은 통과(passed=true) 가정이므로 각 룰이 gap=1 로 드러난다(경쟁사 우위 갭).
 * production 은 실 엔진 GapAnalyzer 를 쓰고 이 폴백은 dev/webpack 에서만 동작한다.
 */
export class MockGapAnalyzer implements GapAnalyzerPort {
  analyze(input: GapInputLike): GapResultLike {
    const ruleMap = new Map<string, GapMatrixRowLike>();
    const competitorTotal = input.competitors.length;

    for (const item of input.selfReport.diagnosisItems) {
      ruleMap.set(item.ruleId, {
        ruleId: item.ruleId,
        category: item.category,
        selfPassed: item.passed,
        competitorPassedCount: 0,
        competitorTotal,
        gap: 0,
        actionType: item.actionType,
        priority: item.priority,
      });
    }

    for (const comp of input.competitors) {
      for (const item of comp.diagnosisItems) {
        const row = ruleMap.get(item.ruleId);
        if (!row) continue;
        if (item.passed) row.competitorPassedCount += 1;
      }
    }

    for (const row of ruleMap.values()) {
      const selfPassRate = row.selfPassed ? 1 : 0;
      const compPassRate = row.competitorPassedCount / Math.max(1, row.competitorTotal);
      row.gap = compPassRate - selfPassRate;
    }

    const matrix = [...ruleMap.values()].sort((a, b) => b.gap - a.gap);
    const priorities = this.selectTop5(matrix);
    const selfStrengths = matrix
      .filter((r) => r.selfPassed && r.competitorPassedCount < r.competitorTotal / 2)
      .map((r) => r.ruleId);

    return {
      matrix,
      priorities,
      selfStrengths,
      // dev 샘플 경쟁사는 점수 미보유 → 시장 평균 0(영속화/UI 는 점수 비노출이라 무해).
      marketAverage: { seo: 0, aeo: 0, geo: 0, perf: 0, overall: 0 },
    };
  }

  private selectTop5(matrix: GapMatrixRowLike[]): PriorityGapLike[] {
    const scored = matrix
      .filter((r) => r.gap > 0)
      .map((r) => {
        const pw = MOCK_GAP_PRIORITY_WEIGHT[r.priority] ?? 1;
        const ab = MOCK_GAP_ACTION_BONUS[r.actionType] ?? 1.0;
        return { row: r, score: r.gap * pw * ab };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return scored.map((s, i) => ({
      rank: (i + 1) as 1 | 2 | 3 | 4 | 5,
      ruleId: s.row.ruleId,
      reason: "(샘플) 경쟁사는 갖췄고 우리는 아직인 항목이에요.",
      actionType: s.row.actionType,
      expectedImpact:
        s.row.priority === "high" ? "high" : s.row.priority === "medium" ? "medium" : "low",
    }));
  }
}
