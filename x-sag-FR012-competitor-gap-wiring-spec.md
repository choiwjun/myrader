# FR-012 배선+노출 명세 — 라이벌 역공학(Competitor Gap) 활성화

> 작성: 2026-06-13 · 형식: X-SAG docs/features 패치 문서 (Baseline + Patch-Only)
> 배치 권장 위치: `docs/features/x-sag-diagnosis-engine/PLAN_FR012_COMPETITOR_GAP_WIRING.md`
> 베이스라인: PRD §5.3 FR-012, TRD §19.2.5(GapAnalyzer), RESEARCH_ENGINE_V2.md, 차별화 #5
> 성격: **신규 빌드 아님 — 이미 구현된 엔진을 라이브 플로우에 배선 + 사용자 리포트에 노출**

---

## 0. 배경 — "만들어졌으나 배선 안 된 잠든 기능"

코드 실측(2026-06-13) 결과:
- ✅ **역공학 엔진 풀 구현**: `packages/core-engine/src/v2/gap/`(`GapAnalyzer`, `GapResult`={matrix·priorities·selfStrengths·marketAverage}), `v2/competitor/`(discovery·ranker). 테스트됨.
- ✅ **입력 계약 존재**: `AnalyzeRequest.competitorUrls`(max 3) — `packages/contracts/src/api.ts`.
- 🔴 **라이브 배선 끊김**: `apps/worker/src/processors/analyze-processor.ts`가 `input.competitorUrls`를 읽지 않고 `GapAnalyzer`를 호출하지 않음 → `GapResult` 미생성·미저장·미노출.
- 🔴 **리포트 노출 없음**: 표준 `DiagnosisJson`(`packages/contracts/src/diagnosis.ts`)엔 `competitorTop`(이름·순위)·`llmValidation.competitors`만. 풍부한 갭 매트릭스는 사용자에게 안 감.

→ 본 명세는 **(A) 배선 (B) 노출 (C) 정직성 가드**를 정의한다.

## 1. 범위 / 비범위

**범위**
- `competitorUrls`(수동) 기반 경쟁사 진단 → `GapAnalyzer` 실행 → `GapResult` 생성.
- `GapResult`를 `DiagnosisJson`에 **additive optional** 필드로 노출(스키마 1.x MINOR 무중단).
- DB 저장 + 리포트 UI "라이벌 역공학" 섹션.

**비범위(후속/별도 게이트)**
- 자동 경쟁사 발견(SERP) — **SERP API 키 오너 결정**(RESEARCH_ENGINE_V2 §1, OQ-R-E-001/004) 후. 본 명세는 어댑터 자리만 남김.
- 매출/성과 연결(스마트플레이스) — 별도 종결됨(API 부재, GEO 코어 이탈).

## 2. 현재 상태 (코드 증거)

| 자산 | 위치 | 상태 |
|---|---|---|
| GapAnalyzer + 타입 | `core-engine/src/v2/gap/{analyzer,formatter,types}.ts`, `v2/index.ts` export | ✅ 구현·테스트 |
| 경쟁사 발견/랭킹 | `core-engine/src/v2/competitor/{discovery,ranker}.ts` | ✅ 구현 |
| SERP 어댑터 | `core-engine/src/v2/serp/` | ✅(키 필요) |
| 입력 필드 | `contracts/src/api.ts` `AnalyzeRequest.competitorUrls` | ✅ 계약 |
| 자기 진단 파이프라인 | `core-engine` `runDiagnosisPipeline()` | ✅ (self only) |
| 잡 핸들러 | `apps/worker/.../analyze-processor.ts` | 🔴 competitorUrls/GapAnalyzer 미호출 |
| 리포트 빌더 | `core-engine/src/report-generator.ts` `generateReportJson()` | 🔴 gap 미포함 |
| 리포트 계약 | `contracts/src/diagnosis.ts` `DiagnosisJsonSchema` | 🔴 gap 필드 없음 |
| 영속화 | `apps/worker/src/lib/db-writer.ts` `persistDiagnosisResult()` | 🔴 gap 미저장 |

## 3. 목표 동작

```
/v1/analyze {…, competitorUrls:[A,B,C], modules}
  → analyze-processor:
      self  = runDiagnosisPipeline(self)              (기존)
      comps = competitorUrls.map(u => runDiagnosisPipeline(u, light))   ★신규
      gap   = new GapAnalyzer().analyze({ selfReport: map(self), competitors: map(comps) })  ★신규
  → generateReportJson({…, competitorGap: gap})        ★신규(additive)
  → persist (jsonb)                                    ★신규
  → 리포트 UI: "라이벌 역공학" 섹션 (filterCompetitorAdvantage + PriorityGap + selfStrengths) ★신규
```

## 4. 설계

### 4.1 경쟁사 소스
- **MVP(키 불필요)**: `input.competitorUrls`(수동, max 3) 그대로 사용.
- **후속(키 필요)**: 비어있으면 `v2/competitor/discovery`(SERP)로 동일 카테고리 상위 N 자동 발견. `XSAG_ENABLE_COMPETITOR_AUTODISCOVERY` + SERP 키 게이팅.

### 4.2 경쟁사 진단 실행 → `CompetitorReport`
- 각 `competitorUrl`에 대해 **경량 진단** 실행: `runDiagnosisPipeline()` 재사용하되 경쟁사 크롤 예산 축소(`maxPagesPerSite` 작게, JS렌더 off, LLM/PERF off) — 비용·지연 통제.
- 산출을 `gap/types.ts`의 `CompetitorReport`로 매핑:
  `{ competitorUrl, competitorName?, serpRank?, seoScore?, aeoScore?, geoScore?, perfScore?, overallScore?, diagnosisItems:[{ruleId,category,passed}], isAnonymized? }`
- **비용 가드(필수)**: 경쟁사 진단은 self 대비 N배 크롤. `llmValidation`과 동일 패턴으로 **유료 플랜 게이팅**(`isPaidPlan(job.data.plan)`) + env 플래그 `XSAG_ENABLE_COMPETITOR_GAP`. 무료/guest는 self만(기존 동작 보존).
- **지연 가드**: 경쟁사 진단은 self 완료 후 병렬(`Promise.allSettled`), 개별 타임아웃·실패 graceful(한 곳 실패해도 나머지로 gap 생성). `naverPresence`/`llmValidation`의 "실패 시 생략" 패턴과 동일.

### 4.3 `GapAnalyzer` 호출
- self 진단 결과를 `gap/types.ts` `DiagnosisJson`(경량: reportId·websiteUrl·diagnosisItems[ruleId,category,passed,actionType,priority]·scores)로 매핑.
- `new GapAnalyzer().analyze({ selfReport, competitors })` → `GapResult`.
- `GapResult` = `{ matrix:GapMatrixRow[], priorities:PriorityGap[], selfStrengths:string[], marketAverage:ScoreSnapshot }`. (`GapMatrixRow.gap` 음수=내 우위 / 양수=경쟁사 우위)

### 4.4 노출 — `DiagnosisJson` additive 필드
- `contracts/src/diagnosis.ts`에 **optional** 추가(스키마 1.x MINOR 호환, TRD §13):
  ```ts
  competitorGap: CompetitorGapSchema.optional(),  // gap/types.ts GapResult 미러링 Zod
  ```
- 기존 `competitorTop`(naverPresence)·`llmValidation.competitors`는 *실측 라이벌(누가)*, `competitorGap`은 *역공학(어떻게)* — 역할 분리 유지.
- `report-generator.ts generateReportJson()`에 `competitorGap` passthrough(정의 시에만, naverPresence 패턴 동일).

### 4.5 DB 저장
- `diagnosis_reports`에 `competitor_gap jsonb null` 컬럼 추가(Drizzle migration) 또는 raw JSON(R2)만으로 충분하면 컬럼 생략 가능 — 쿼리 필요 없으면 R2 권장.
- `db-writer.ts persistDiagnosisResult()`에 반영.

### 4.6 리포트 UI — "라이벌 역공학" 섹션
- 위치: Measure-First 계층상 §2(라이벌 실측) 직하 또는 §3(액션) 상단.
- 콘텐츠:
  - **갭 우선순위 Top 5**(`priorities:PriorityGap[]`): "라이벌이 갖춘 것 / 당신은 없는 것" + actionType + 기대영향.
  - **`filterCompetitorAdvantage(matrix)`**: 경쟁사 우위 항목 표(룰·카테고리·self vs 경쟁사 평균/Top1).
  - **`filterSelfStrength`/`selfStrengths`**: "당신이 앞서는 것"(균형·동기부여).
  - 카테고리 그룹(`groupByCategory`) 또는 액션 그룹(`groupByActionType`) 토글.

## 5. 정직성 / POLICY 가드 (Measure-First 일관)
- 갭 매트릭스는 **on-page 룰 비교(기본 위생 수준)**다. **"이걸 따라 하면 AI가 추천한다"는 인과 단정 금지**(자사 n=51: 점수↔실인용 무상관). 카피: *"라이벌이 갖춘 항목 / 당신과의 차이 — 노출을 보장하진 않지만 위생·구조 격차"*.
- `competitorTop`(실 SERP)·`llmValidation.competitors`(실 grounded)의 *실측 라이벌*과, `competitorGap`의 *룰 기반 역공학*을 화면에서 **명확히 구분**(실측 vs 진단).
- 경쟁사명 정직성: `gap`은 룰 통과여부만 다루므로 익명화(`isAnonymized`) 옵션 유지 — 경쟁사 비방·오인 리스크 차단.

## 6. 구현 태스크(분해)
- T1 `analyze-processor.ts`: `competitorUrls` 읽기 + 경량 경쟁사 진단(병렬·게이팅·타임아웃).
- T2 self/경쟁사 결과 → `GapInput` 매핑 어댑터(`gap/types.ts` 형태).
- T3 `GapAnalyzer.analyze()` 호출 + 실패 graceful.
- T4 `contracts/diagnosis.ts` `competitorGap` Zod(additive) + `report-generator.ts` passthrough.
- T5 DB(선택 컬럼/마이그레이션) + `db-writer.ts` 반영.
- T6 web 리포트 "라이벌 역공학" 섹션 + 카피(POLICY §5 정직성).
- T7 게이팅 env(`XSAG_ENABLE_COMPETITOR_GAP`) + 유료 플랜 가드 + 문서.
- T8 테스트: 매핑·gap 생성·additive 스키마 호환·게이팅·graceful 실패.

## 7. 열린 결정 (오너)
- OQ1 **게이팅**: 경쟁사 진단을 유료 플랜만? (권장 yes — `llmValidation`과 동형, 비용 통제)
- OQ2 **저장**: R2 raw JSON만 vs `competitor_gap` jsonb 컬럼(쿼리/어드민 필요 시).
- OQ3 **자동 발견 SERP 키**: 지금은 수동 `competitorUrls`만, 자동은 SERP 키 결정 후(비범위).
- OQ4 **경쟁사 크롤 예산**: maxPages/타임아웃 기본값(지연·비용 vs 진단 충실도).

## 8. 리스크
- **비용·지연**: 경쟁사 N개 추가 크롤 → 진단 시간·비용 N배. → 경량 진단 + 유료 게이팅 + 병렬·타임아웃으로 통제.
- **결정론**: 기존 self 채점 로직 불변 유지(additive only). gap은 별도 산출 — 기존 진단 호환·재현성 보존.
- **정직성**: 인과 과장·경쟁사 비방 → 카피 가드 + 익명화.
- **ToS**: 자동 발견 시 SERP는 정식 API만(자체 SERP 크롤 금지, RESEARCH_ENGINE_V2 §1.2).

## 9. 테스트 계획
- 단위: GapInput 매핑, additive 스키마(1.0.0 + competitorGap 모두 valid), 게이팅 분기.
- 통합: competitorUrls 2~3개 → GapResult.matrix/priorities 생성, 1곳 실패 시 graceful.
- 회귀: competitorUrls 없을 때 기존 리포트 100% 불변(결정론).

---

> 본 문서는 기획 산출물이며 X-SAG 베이스라인을 통째 재작성하지 않는다. FR-012·TRD §19.2.5의 미배선 갭만 패치한다.
