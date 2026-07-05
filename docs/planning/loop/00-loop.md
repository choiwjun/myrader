# 00 — Loop Charter (루프 차터)

> 이 문서는 `/planning-loop-supervisor`가 운영하는 **상위 검증 루프**의 헌장이다.
> 감독관(Supervisor)은 **생산자가 아니라 감독관**이다 — 기획 문서를 만들지 않고, 만들어진 문서를 다시 읽어 검증하고 게이트를 파생한다.

- **Project**: 소상공인 셀프 SEO/AEO/GEO 진단 + 경쟁사 비교 + 행동 안내 (네이버+구글, 한눈에)
- **Engine**: x-sag 분석 엔진 재사용 (새 git 레포의 새 제품)
- **Scope**: REQ-001 ~ REQ-007 · 화면 S1~S7 · 32태스크 · 10도메인 리소스
- **Iteration**: 1 · 일자: 2026-06-13

---

## 1. 상위 원칙 (Supervisor Principles)

1. **감독관은 생산하지 않는다.** 베이스라인(`01~07`, `specs/`)을 재생성하지 않고, 검증·갭리뷰·게이트 파생만 수행한다.
2. **증거 기반 판정.** 실행하지 않은 체크를 통과로 주장하지 않는다 (Confirmed / Assumption / Unknown / Blocked 라벨).
3. **하드페일 우선.** 치명 결함·추적 단절·발명(근거 없는 사실 주입)은 점수와 무관하게 즉시 Red.
4. **핵심 항목 게이팅.** 핵심 7항목(Product Clarity, Requirement Completeness, Technical Feasibility, Traceability, Consistency, Task Executability, Implementation Readiness)은 **≥4/5**가 Green 조건. 하나라도 미달이면 최대 **조건부(Yellow)**.
5. **Patch-Only.** 문서 결함은 해당 섹션만 Gap Review로 패치한다. 단, **문서 결함이 아닌 결정·검증 미수행**은 patch가 아니라 **upstream gap**으로 기록한다.
6. **발명 금지.** OPEN(OQ) 항목을 임의로 확정하지 않는다. 미결정은 `[OPEN]`으로 보존한다.
7. **게이트 파생.** 검증 후 설계 산출물에서 프로젝트별 세부 게이트(`08-derived-gates.md`)를 파생한다.

## 2. 루프 단계 (LOOP 0~10)

| LOOP | 내용 |
|------|------|
| 0 | 베이스라인 로드 (9문서 + specs) |
| 1 | 하드페일 스캔 |
| 2~8 | 13항목 채점 (2개씩, LOOP 8 = Implementation Readiness 핵심) |
| 9 | 파생 게이트 생성 (`08-derived-gates.md`) |
| 10 | 최종 planning approval (`final-planning-approval.md`) |

각 게이트 판정은 **Green / Yellow / Red / Blocked**. 스킵은 기록된 사유가 있어야 한다.

## 3. 이번 루프 결과 (요약)

- **하드페일**: 0건
- **점수**: 54/65 — 핵심 7항목 중 6개 ≥4, **Implementation Readiness 3/5 미달**
- **판정**: 조건부 승인(Yellow) → 최종 **조건부 Green** (착수 가능하나 조건부)
- **Patch**: 미수행 — 미달이 OQ 결정·사장님 검증이라 문서 재생성으로 해소 불가 → upstream gap으로 이관
- **파생 게이트**: REQ-001~007 각 5종 + 횡단 2종(G-HONESTY, G-사장님이해)
- **🟢 승격 (iteration 2 · 2026-06-14)**: 풀 Green 4조건 모두 충족 — ① OQ-5·OQ-6 결정 ② OQ-3 페이월/가격 결정(①② DECISION_LOG 2026-06-13) ③ AC-7 사장님 이해도 검증(2026-06-13 목업 검증, 사용자 보고) ④ 구글 실 SERP v1.5 분리 → **조건부 Green → 풀 Green 승격, v1 개발 착수 승인.** 근거: DECISION_LOG + 사용자 결정(2026-06-14).

## 4. 이 프로젝트의 "완료 정의" (Definition of Done)

> ⚠️ **이 프로젝트의 완료는 `00-loop.md`(본 차터)와 `08-derived-gates.md`를 함께 충족할 때만 성립한다.**

구현완료 = 다음을 **모두** 만족:

1. 본 차터의 상위 원칙(증거 기반·발명 금지·patch-only)을 위반하지 않음.
2. `08-derived-gates.md`의 각 REQ Hard/Metric/Domain/Evidence 게이트 **증거 통과**.
3. 횡단 게이트 **G-HONESTY**(점수·인과·전문용어 0) Green.
4. 횡단 게이트 **G-사장님이해**(AC-7, 비IT 사장님 2~3명 5분 이해도) Green.
5. **풀 Green 4조건**: ① OQ-5·OQ-6 결정 ② OQ-3 페이월/가격 결정 ③ 사장님 이해도 검증(AC-7) ④ 구글 실 SERP는 v1.5(OQ-4)로 분리.

위 중 미충족이 있으면 **조건부 Green(착수 가능)**까지만 인정되고, **출시·v1 구현완료로 승격 불가**다.

## 5. 충돌 시 우선순위

사용자 결정 > 게이트 판정 > 승인된 베이스라인 > `08-derived-gates.md` > 스킬 내부 규칙 > 에이전트 구현 디테일.

## 6. 연결 문서

- `docs/planning/loop/loop-state.json` — 기계 판독 루프 상태
- `docs/planning/loop/planning-loop-report.md` — 13항목 점수표·갭·patch 미수행 사유
- `docs/planning/loop/08-derived-gates.md` — 파생 게이트 (완료 정의의 절반)
- `docs/planning/loop/final-planning-approval.md` — 최종 착수 승인
