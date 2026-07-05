# Planning Loop Supervisor — 검증 리포트

> 제품: 소상공인 셀프 SEO/AEO/GEO 진단 + 경쟁사 비교 + 행동 안내 (네이버+구글, 한눈에)
> 엔진: x-sag(github.com/choiwjun/x-sag) 분석 엔진 **재사용**. 새 git 레포의 새 제품.
> 감독관 역할: 생산자가 아니라 **감독관**. 설계 문서를 다시 읽어 일관성·추적성·갭·품질·개발가능성을 검증하고 게이트를 파생한다.
> 판정 일자: 2026-06-13 · iteration: 1 · 요구사항: REQ-001 ~ REQ-007

---

## 0. 검증 대상 베이스라인 (입력)

| 문서 | 경로 | 비고 |
|------|------|------|
| PRD | `docs/planning/01-prd.md` | REQ-001~007, OQ-1~6, AC-1~8 |
| TRD | `docs/planning/02-trd.md` | Next.js 풀스택 + x-sag 엔진 import, 백그라운드 잡 |
| User Flow | `docs/planning/03-user-flow.md` | 3-스텝 (가게찾기→내상태→경쟁→역공학→행동) |
| DB Design | `docs/planning/04-database-design.md` | 10리소스 개념모델, x-sag contracts 차용 |
| Design System | `docs/planning/05-design-system.md` | 비IT UX 규율, 신호등, 정직성 카피 가드 |
| Screens | `docs/planning/06-screens.md` | S1~S7 + 상태 |
| Tasks | `docs/planning/06-tasks.md` | 32태스크 (P{N}-R/S{M}), ICV 0누락 통과 |
| Coding Convention | `docs/planning/07-coding-convention.md` | UUID·엔진 통합 규칙 |
| 결정 레저 | `docs/planning/DECISION_LOG.md` | OQ-2·OQ-3 확정, OQ-1·4·5·6 OPEN |
| 스펙 | `specs/` (domain 10리소스 + screens 7 + shared) | 커버리지 0누락 |

---

## 1. LOOP 0~10 요약

| LOOP | 단계 | 결과 |
|------|------|------|
| LOOP 0 | 베이스라인 로드 (9문서 + specs) | 정본 확인 — REQ→flow→screen→resource→task 체인 존재 |
| LOOP 1 | 하드페일 스캔 (치명 결함·추적 단절·발명) | **하드페일 0건** |
| LOOP 2 | Product Clarity / Requirement Completeness | 5 / 4 |
| LOOP 3 | Technical Feasibility / User Flow Coverage | 5 / 4 |
| LOOP 4 | Data Model Fit / UI·Screen Completeness | 4 / 4 |
| LOOP 5 | Design System Applicability / Task Executability | 4 / 4 |
| LOOP 6 | Testability / Traceability | 3 / 5 |
| LOOP 7 | Consistency / Scope Control | 4 / 4 |
| LOOP 8 | Implementation Readiness (핵심) | **3 ⚠️ — 1개 미달** |
| LOOP 9 | 파생 게이트 생성 (REQ-001~007 각 5종 + 횡단 2종) | `08-derived-gates.md` 산출 |
| LOOP 10 | 최종 planning approval | **조건부 Green** → `final-planning-approval.md` |

판정: **조건부 승인(Yellow)** — 핵심 7개 중 6개 ≥4, Implementation Readiness만 3/5 미달. 하드페일 없음.
`gate_pass=false`(조건부) / `gates_derived=true` / `iteration=1`.

---

## 2. 13항목 점수표 (점수 · 근거 · 수정 액션)

| # | 항목 | 점수 | 근거 (1줄) | 수정 액션 |
|---|------|:---:|------------|-----------|
| 1 | Product Clarity | **5/5** | 북극성·사장님 단일 질문·타깃(비IT 40~60대 P1) 명확 | 없음 |
| 2 | Requirement Completeness | **4/5** | REQ-001~007 + 예외 정의됨, 단 무료/유료 **가격 OPEN(OQ-3)** | OQ-3 가격 결정 (사장님 검증 후) |
| 3 | Technical Feasibility | **5/5** | x-sag 엔진 이미 존재·재사용, 신규 구현 리스크 최소 | 없음 |
| 4 | User Flow Coverage | **4/5** | 3-step + 예외 커버, 단 페이월 전환 일부 OPEN | OQ-3 결정 후 페이월 전환 플로우 보강 |
| 5 | Data Model Fit | **4/5** | 10리소스↔화면 0누락, 엔진 contracts 스키마 차용 | OQ-6 결정 후 contracts 매핑 고정 |
| 6 | UI / Screen Completeness | **4/5** | S1~S7 + 상태 정의, 빈상태/페이월 일부 OPEN | 빈상태·페이월 화면 보강 (OQ-3 후) |
| 7 | Design System Applicability | **4/5** | 비IT UX 규율 구체, 비주얼 토큰은 구현 시 확정 | 구현 단계 비주얼 토큰 확정 |
| 8 | Task Executability | **4/5** | 32태스크 TDD·담당·의존 명시, 엔진통합 방식 **OQ-6** | OQ-6 결정 후 P0-R0 통합 방식 명문화 |
| 9 | Testability | **3/5** | 대부분 testable, **AC-7 사장님 이해도·정직성 카피는 정성** → 게이트 보완 | G-사장님이해/G-HONESTY 게이트로 정성 검증 보완 |
| 10 | Traceability | **5/5** | REQ→flow→screen→resource→task + ICV 0누락 | 없음 |
| 11 | Consistency | **4/5** | 문서 간 충돌 없음, OPEN 항목 일관 표기 | 없음 (OPEN 해소 시 동기 갱신) |
| 12 | Scope Control | **4/5** | 대행 제외·v1.5 분리·페이월 명확, **7화면은 비IT엔 다소 많음** 주의 | 7화면 복잡도 모니터링 (사장님 검증 시) |
| 13 | Implementation Readiness | **3/5 ⚠️** | 핵심 미달: **OQ-6 엔진통합·OQ-5 잡인프라·OQ-3 가격 미결정 + 사장님 검증 0** | OQ-5·OQ-6·OQ-3 결정 + AC-7 사장님 검증 수행 |

**합계: 54 / 65** · 핵심 7항목 중 6개 ≥4 (미달 1: Implementation Readiness).

---

## 3. 갭 (= Open Question · 사장님 검증)

문서 결함이 아니라 **결정·검증 미수행**으로 인한 갭이다. 따라서 patch(문서 재생성)가 아니라 **upstream gap**으로 기록한다.

| 갭 | 출처 | 영향 | 해소 경로 |
|----|------|------|-----------|
| **OQ-6** 엔진 재사용 방식 (import vs 추출/복사) | 02-trd §4, 06-tasks P0-R0 | Task Executability·Data Model Fit | P0-R0에서 결정 → 07 §2 명문화 |
| **OQ-5** 백그라운드 잡 인프라 | 02-trd §3, 06-tasks P0-T3 | Implementation Readiness | P0-T3에서 결정 (추상화 뒤 더미로 시작) |
| **OQ-3** 무료/유료 가격 액수 | 01-prd §7, DECISION_LOG | Requirement Completeness·페이월 | 사장님 검증 후 가격 확정 |
| **OQ-4** 구글 실 SERP 키·비용 | 02-trd §2, REQ-002 | User Flow (구글 노출) | **v1.5로 분리** — v1 게이트 보류 |
| **REQ-004 GapAnalyzer 배선** (x-sag에선 미배선) | 04-db gap_row, 06-tasks P2-R4 | REQ-004 구현 | P2-R4에서 GapAnalyzer 배선 (upstream-gap) |
| **REQ-007 재진단/추이** | 01-prd, 06-screens S7 | — | **v1.5로 분리** — v1 게이트 보류 |
| **사장님 검증 0/2-3 (AC-7)** | 01-prd AC-7, 05-design 게이트 | Testability·Implementation Readiness | 비IT 사장님 2~3명 5분 이해도 테스트 — **✅ 해소 2026-06-14** (목업 검증, §6 참조) |

---

## 4. Patch 미수행 사유 (명시)

- **iteration = 1** 에서 종료. 추가 patch 루프를 돌리지 않았다.
- **사유**: 미달 항목(Implementation Readiness 3/5)의 원인이 **문서 결함이 아니라 ① OQ 결정(OQ-5·OQ-6·OQ-3) 미수행 ② 사장님 검증(AC-7) 미수행**이다.
- 이 두 가지는 **문서를 재생성한다고 해소되지 않는다** (결정·실험·사용자 테스트가 필요). 따라서 Gap Review 기반 섹션 패치가 적용 불가하며, **upstream gap 조건**으로 기록하고 게이트 증거 통과 조건으로 이관했다.
- 베이스라인 문서 자체는 **patch-only 정책상 보존**되며 재생성하지 않는다 (충돌 시 우선순위: 사용자 결정 > 게이트 판정 > 승인된 베이스라인).

---

## 5. 산출물 & 다음 단계

| 산출물 | 경로 |
|--------|------|
| 루프 상태 | `docs/planning/loop/loop-state.json` |
| 본 리포트 | `docs/planning/loop/planning-loop-report.md` |
| 파생 게이트 | `docs/planning/loop/08-derived-gates.md` |
| 루프 차터 | `docs/planning/loop/00-loop.md` |
| 최종 승인 | `docs/planning/loop/final-planning-approval.md` |

**다음 단계**: 조건부 Green이므로 P0 셋업 + P1 공통 + P2 프론트 화면(S1~S7) 착수 가능. 단 P0-R0(OQ-6)·P0-T3(OQ-5) 결정 선행, P2-R4(GapAnalyzer 배선)은 upstream-gap. 풀 Green은 §08-derived-gates의 4조건 충족 시.

---

## 6. 승격 업데이트 (iteration 2 · 2026-06-14)

> ⚠️ 위 §1~§5는 **iteration 1 (2026-06-13) 스냅샷**이다. 아래는 그 이후 조건 해소에 따른 승격 기록.

- **풀 Green 4조건 전부 충족** → 조건부 Green → **🟢 풀 Green 승격**, v1 개발 착수 승인.
  - ✅ OQ-6 엔진통합(복사 후 독립 패키지화) · OQ-5 잡 인프라(경량) — DECISION_LOG 2026-06-13
  - ✅ OQ-3 페이월/가격(일회성 실행팩 ~4,900~5,900원) — DECISION_LOG 2026-06-13
  - ✅ AC-7 사장님 검증 — 2026-06-13 목업(`design/mockup/sajangnim-validation.html`) 검증, 사용자 보고 2026-06-14 (※ 목업 리뷰 기반 만족 확인, 정량 stopwatch 아님 → 정식 오픈 후 실사용 데이터 재확인 권장)
  - ✅ OQ-4 구글 실 SERP v1.5 분리
- **잔존**: OQ-4(구글 키, v1.5 진입 시 결정) / REQ-004 GapAnalyzer 배선(P2-R4, 구현 중 해소) / Implementation Readiness 점수는 조건 해소로 실질 상향(재채점 생략 — 조건 해소 기반 승격).
- **다음**: Phase 0(모노레포+엔진통합+DB+잡)부터 구현 착수. v1 '구현완료'는 `08-derived-gates.md` 게이트 증거 통과 후에만 선언 가능.
