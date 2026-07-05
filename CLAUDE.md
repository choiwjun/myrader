# Claude Unified — 거버넌스 판정 × Labs 실행 루프

이 프로젝트는 Claude Unified Edition (Labs v1.20.0 + Harness 거버넌스 풀 머지)으로 운영한다.

- **판정 레이어**: `governance` 스킬 (`.claude/skills/governance/`) — L0-L3 분류, 게이트, 행동 규율
- **실행 레이어**: 스킬 58종(Labs 57 + governance), 에이전트 19종, 훅 13종, Constitutions 12종
- 통합 기준 문서: `.claude/docs/integration-map.md`

프로젝트 루트는 이 `CLAUDE.md`가 있는 폴더다. 하위 폴더로 루트를 전환하지 않는다.

> ⚠️ 용어 주의: `governance` 스킬(판정 레이어)과 `/harness` 스킬(Builder-Evaluator 루프)은 전혀 다른 것이다.

---

## 작업 분류 → 실행 경로 (모든 작업의 첫 단계)

| 레벨 | 기준 | 실행 경로 |
|------|------|-----------|
| L0 Direct | 오타, 단일 파일, 안전한 직접 수정 | 직접 실행 → 검증. 게이트·아티팩트 없음 |
| L1 Light | 소규모 모호한 작업, 저위험 버그 | 인라인 브리프 → 실행 → `/verification-before-completion` |
| L2 Standard | 의미 있는 기능, 다중 파일, 기획 선행 | 게이트 운영 + 필요한 스킬만 선택 호출 |
| L3 Full Gate | 신규 제품, 인증/결제/보안/데이터 리스크 | `/stargate` 풀 파이프라인 + 전체 게이트 레저 |

분류 직후 governance가 `references/SKILL_REGISTRY.md`(58종 전수 정의 + 결정 트리)를 근거로 **스킬 플랜**(선정 스킬·이유·대안·제외)을 산출한 뒤 실행한다. L2/L3는 플랜을 사용자에게 확인받는다.

## 게이트 ↔ 실행자 매핑 (요약)

| 게이트 (판정) | 실행자 |
|---|---|
| Planning | `/socrates`(귀납) 또는 `/doubt`(연역) — 상류: `/eureka` `/neurion` |
| Research | `/deep-research` |
| Design | `/design-discovery` + `/screen-spec` |
| QA Part 1 (개발 전) | screen-spec tests + `/tasks-generator` V태스크 |
| Development (베이스라인 승인) | `/tasks-generator`(ICV) + `/planning-loop-supervisor` |
| 구현 | `/auto-orchestrate` < `/harness` < `/harness-forge` < `/cmux-harness` |
| QA Part 2 (개발 후) | verification → evaluation → code-review → (powerqa ↻5) → systematic-debugging |

각 게이트는 **Green / Yellow / Red / Blocked** 판정 후 진행 (스킵은 기록된 사유 필요).
`/planning-loop-supervisor` 통과 = Development Gate Green.
매핑 밖 보조 스킬(`/reverse` `/sync` `/spike` `/audit` `/trinity` `/autoresearch` `/eros` `/poietes` `/cogito` `/odysseus` `/council` 등)은 게이트와 무관하게 독립 호출. 훅·Constitutions는 항상 자동 동작.

## 공통 행동 규율 (항상 적용)

1. **Clarification** — 범위/파일/보안/데이터/정책에 영향 주는 모호함은 추측하지 않고 묻는다.
2. **증거 기반 판정** — 실행하지 않은 체크를 통과했다고 주장하지 않는다 (Confirmed/Assumption/Unknown/Blocked 라벨).
3. **베이스라인 + Patch-Only** — 승인된 기획 문서는 재생성하지 않고 Gap Review로 해당 섹션만 패치.
4. **오케스트레이터 코드 작성 금지** — 조율자는 분해·디스패치·병합·판정만. 구현은 specialist가 Worktree에서 수행.
5. **스코프 변경 위장 금지** — 새 역할/플로우/결제/보안 추가는 사용자 승인 필요.

## 문서·모델·상태 (요약)

- 문서 정본: `docs/planning/01~07-*.md` + `specs/` + `06-tasks.md`. 보강 3종(00-policy, 03b-storyboard, DECISION_LOG)은 governance templates 차용.
- ID 체인: `REQ-*` → `SCREEN-*` → `QA-*` → `P{N}-R/S{M}-T{X}` (태스크 본문에 REQ ID 명기).
- 모델: `/cost-router` 3-tier + 중요 결정(보안/결제/승인/go-no-go)은 항상 `opus`.
- 게이트 레저·Yellow 가정: `docs/planning/DECISION_LOG.md`. 파이프라인 체크포인트: `.stargate/state.json`.

## 충돌 시 우선순위

사용자 결정 > 게이트 판정 > 승인된 베이스라인 > `08-derived-gates.md` > 스킬 내부 규칙 > 에이전트 구현 디테일.
상세 매핑·시나리오: `.claude/docs/integration-map.md` / 게이트 상세: `.claude/skills/governance/references/`
