# 02-TRD — 기술 요구사항 (새 Next.js 앱 + x-sag 엔진 재사용)

> 목적: 본 제품을 새 Next.js 풀스택 앱으로 짓되 x-sag 분석 엔진을 부품으로 재사용하는 아키텍처·데이터소스·백그라운드 잡·재사용 경계·리스크를 정의한다. (엔진 추출·통합 계획 자체는 별도 문서, 본 문서는 제품層 기술 기획.)

---

## 1. 아키텍처 개요

| 레이어 | 선택 | 근거 |
|--------|------|------|
| 앱 골격 | **Next.js (App Router) 단일 풀스택** — 페이지 + Route Handler / Server Action | 입력 최소·모바일 중심 셀프서비스에 풀스택 단일 앱이 가장 가벼움 |
| 엔진 | x-sag 분석 엔진을 **현재 모노레포 workspace 패키지로 import** | SME v1은 `@boina/*`/`@radar/*`를 외부 발행하지 않고 내부 TS 소스 패키지로 소비. GitHub Packages 발행은 dist build와 release workflow를 의도적으로 추가한 뒤로 유예 |
| 비동기 처리 | 백그라운드 잡 (분석이 느림) | 진단·AI 인용·SERP 호출은 즉답 불가 → 잡 큐 필요 |
| DB | **Postgres** (Drizzle 재사용 가능) | x-sag diagnosis 스키마 차용 (04-database-design 참조) |
| 디자인 | 별도 투자 (UX가 본 제품의 본체) | 05-design-system |

```
[모바일 브라우저]
      │
      ▼
[Next.js App (App Router)]
   ├─ Pages (S1~S7)
   ├─ Route Handler / Server Action  ── 진단 요청 enqueue
   └─ import @engine/* (workspace)
      │
      ▼
[백그라운드 잡 워커]  ── 느린 분석 실행
   ├─ llm-provider: AI 실인용(grounded llmValidation)  ── ① HERO 신호
   ├─ core-engine: 크롤·파서·analyzers·scoring·v2(gap/competitor/serp/geo-validator/nlp) + SNS 멀티플랫폼 source detection  ── ② 비교 / ③ SNS 연료
   ├─ naver-presence: 네이버 노출 실측  ── ③ 레버(연료) 1순위
   └─ snippet: 생성물(FAQ/스키마/소개글/리뷰문구/처방전)
      │
      ▼
[Postgres (Drizzle)]  ── diagnosis / engine_result / competitor / gap_row …
```

## 2. 데이터 소스 (우선순위 — 확정)

> 정보 계층(05-design-system 1-A) 확정에 맞춰 데이터 소스 우선순위를 재정렬한다. **AI 실인용이 HERO 신호**(GEO=AI 검색이 본질), 경쟁사/갭이 2순위, 채널 노출(네이버>구글>SNS)은 AI 노출을 끌어올리는 **레버(연료)**로 3순위다.

| 우선순위 | 소스 | 용도 | 비용·게이팅 | 비고 |
|----------|------|------|------------|------|
| **1순위 — HERO** | **AI 실인용 (grounded llmValidation)** | "AI가 나를 인용/추천하나" (REQ-002 ②) — 제품의 본질 신호 | **비용 발생 → 게이팅** | llm-provider 재사용. 무분별 호출 금지. 작은 가게엔 "모름"(미인용)이 흔함 → 실패가 아니라 **미래지향 가치**로 처리, 빈 결과도 **증거로 측정·노출** |
| **2순위 — 비교** | 경쟁사 진단 / GapAnalyzer (on-page SEO/AEO/GEO 룰) | 경쟁사가 AI에 잡히나 vs 나, 보유 vs 갭 (REQ-003·004) | 엔진 내장 (즉시·무료) | core-engine v2 gap/competitor 재사용. 구글 페이지에도 동일 룰 적용 가능 |
| **3순위 — 레버(채널/연료)** | **네이버 노출 (Naver Search API)** | 네이버 노출 실측 (REQ-002·003) — AI 노출을 끌어올리는 1차 연료 | API 호출 | naver-presence 재사용 |
| 3순위 (하위) | **구글 SERP·AI Overview** | 구글 노출 (조건부) | **[OPEN] 키 채택·비용 = OQ-4** (SerpAPI / SearchAPI, v1.5) | v1 포함 여부 = OQ-2 |
| 3순위 (하위) | **SNS (인스타·블로그·유튜브)** | SNS 노출 — 멀티플랫폼 source detection | 엔진 멀티플랫폼 분석 | core-engine 멀티플랫폼/source detection 재사용 |

> AI 측정이 작은 가게엔 "모름"이 흔하다는 점은 리스크가 아니라 전제다(5절 참조): 정직하게 "아직 안 나와요"로 노출하되 미래지향 가치 + 현재 증거 측정으로 처리한다.

## 3. 백그라운드 잡

| 항목 | 내용 |
|------|------|
| 필요성 | 진단(크롤·SERP·AI 인용)은 수초~수십초 소요 → 동기 응답 불가 |
| 후보 | **[OPEN] 인프라 선택 = OQ-5** — BullMQ(규모 과하면 부담) vs 경량 큐 / 서버리스 잡 |
| 결정 원칙 | 초기 트래픽·단위경제에 맞춰 가장 가벼운 선택. 규모 커지면 교체 |
| 상태 모델 | 잡 상태(pending/running/done/failed)를 diagnosis에 반영 → 화면은 "한 번에 하나"로 진행 표시 |

## 4. 재사용 vs 신규 경계

| 구분 | 항목 |
|------|------|
| **재사용 (x-sag)** | `packages/core-engine` (크롤·파서·analyzers·scoring·v2: gap/competitor/serp/geo-validator/nlp), `packages/contracts` (스키마·diagnosis/api 타입), naver-presence, llm-provider, snippet 로직 |
| **신규** | Next.js 앱(페이지 + Route Handler / Server Action), 백그라운드 잡 배선, 모바일 UX(05), 4분류 행동 안내(REQ-005), "오늘 딱 하나" 우선순위 로직, 정직성 카피 가드 |
| **재사용 방식** | **OQ-6 해소(현재 SME v1)** — `packages/engine`, `packages/contracts`, `packages/keyword-pipeline` 등 모노레포 workspace 패키지를 TS 소스 상태로 import한다. GitHub Packages 외부 발행은 dist 산출물·exports 정리·release workflow가 준비된 뒤 별도 결정으로 진행한다 |

> DB·TRD 상당 부분은 엔진 스키마(`packages/contracts`)를 차용하므로 맨바닥이 아니다.

## 5. 리스크

| 리스크 | 영향 | 완화 |
|--------|------|------|
| AI 인용·SERP 비용 폭증 | 단위경제 악화 | grounded llmValidation·SERP 호출 게이팅, 캐싱/재진단 정책(REQ-007 OQ-2) |
| 구글 SERP 키 미결정(OQ-4) | 구글 노출 기능 불확실 | v1에서 구글을 조건부로 두고 OQ-2와 함께 컷 결정 |
| 잡 인프라 과/소설계(OQ-5) | 운영 부담 or 확장 한계 | 경량으로 시작, 추상화 레이어로 교체 가능하게 |
| 엔진 결합 강도(OQ-6) | workspace-only 패키지 경계가 새어 앱이 엔진 내부에 끌려다님 | contracts 타입 경계 고정, 현재는 내부 workspace import만 허용. 외부 패키지 발행은 dist build/release workflow 준비 전까지 금지 |
| on-page 점수 ≠ AI 실인용 | 잘못된 약속 → 신뢰 붕괴 | 정직성 규율(05·07): 점수 과신 금지, 진짜 레버는 리뷰·평판·브랜드임을 명시 |

## 6. 확장성 아키텍처 원칙(구속)

> **기지 결정(확정): 확장성 = 구속 조건.** 원칙은 "변할 게 뻔한 축에만 확장점을 두고, 나머지는 단순하게(YAGNI)". x-sag 엔진이 이미 어댑터·contracts·룰 레지스트리·feature flag·provider chain 패턴을 갖추고 있으므로, **그 패턴을 재사용 + 같은 패턴으로 앱層을 작성 + 엔진 계약(contracts)을 깨지 않는 것**이 핵심이다. 코딩 강제 규칙은 07-coding-convention 6절에 매핑된다.

### 6-A. 변할 축 → 흡수 패턴

| 변할 축 | 흡수 패턴 | x-sag 재사용 |
|---------|-----------|--------------|
| 채널 추가 (네이버·구글·SNS → 카카오·당근·유튜브) | `ChannelAdapter` 인터페이스 — 채널 추가 = 어댑터 1개 구현 | x-sag `SerpAdapter` 차용 |
| AI 엔진 추가 (GPT·퍼플렉시티·제미나이 → 클로드·네이버AI) | `AiEngineAdapter` + provider chain | x-sag `llm-provider` 재사용 |
| 진단 룰 추가 | 룰 레지스트리(데이터 주도) — 하드코딩 금지 | x-sag 105룰 방식 |
| 리포트/데이터 모양 변경 | `contracts` 단일 진실 + additive optional 필드(스키마 1.x MINOR 무중단, 옛 데이터 안 깨짐) | x-sag `packages/contracts` |
| 가격·무료/유료 경계 | 페이월/티어를 config로 — 화면 하드코딩 금지 | — |
| UI 피드백 (화면·카피·순서) | 컴포넌트 주도 + `data_requirements`, 카피 중앙 관리(i18n식) | — |
| 새 행동/생성물 타입 | `ActionType`/`AssetType` enum + 핸들러/제너레이터 레지스트리 | snippet 제너레이터 |
| 인프라 교체 (잡·DB) | 잡 큐·스토리지를 인터페이스 뒤로 (OQ-5 흡수) | — |
| 미래 B2B/연동 | API `/v1` 버저닝 + 웹훅 | x-sag `external-api` 차용 |

### 6-B. 레이어링 (의존 방향 단방향)

```
[엔진(순수·재사용)]  ◀──  [어댑터(외부)]  ◀──  [앱 서비스]  ◀──  [UI]
   core-engine            ChannelAdapter        앱 비즈니스        Pages/컴포넌트
   contracts              AiEngineAdapter        오케스트레이션
   (계약 불변)            (외부 경계 격리)        (서비스 경유)
```

- 의존은 **오른쪽 → 왼쪽** 단방향. 엔진은 어떤 상위層도 모른다(순수·재사용).
- **UI는 외부 API를 직접 호출하지 않는다** — 반드시 앱 서비스 / contract를 경유한다.
- 외부(채널·AI엔진)는 항상 어댑터 인터페이스 뒤에 둔다.

### 6-C. YAGNI 규율 · 엔진 계약 불변

- **변할 게 뻔한 축에만** 확장점(어댑터·레지스트리·config·버저닝)을 둔다. 안 변할 것은 추상화하지 않는다(투기적 추상화 금지).
- **x-sag 패턴 재사용**: 새 추상화를 발명하지 않고 엔진의 어댑터·contracts·룰 레지스트리·feature flag·provider chain 패턴을 그대로 따른다.
- **엔진 계약 불변**: `packages/contracts`는 단일 진실. 변경은 additive optional만(파괴적 변경·스키마 major 금지 → 옛 데이터 무중단).

---

## Loop Metadata

- **Upstream docs**: 01-prd.md (REQ-001~007, OQ-2/4/5/6)
- **Downstream docs**: 04-database-design.md(엔진 스키마 차용), 07-coding-convention.md(엔진 통합 규칙 + 확장성 코딩 규칙 6절), 03-user-flow.md(잡 진행 표시)
- **Open questions**: OQ-2(MVP 컷·구글/역공학/재진단), OQ-4(구글 SERP 키·비용), OQ-5(잡 인프라). OQ-6은 현재 SME v1 기준 **workspace-only 패키지 사용**으로 해소됨(외부 발행 유예).
- **Assumptions**: Naver Search API 접근 가능 / x-sag contracts 타입을 현재 모노레포 workspace 패키지로 사용할 수 있음 / Postgres+Drizzle 재사용 가능 / **데이터 소스 우선순위 = AI 실인용(HERO) > 경쟁사·GapAnalyzer > 네이버>구글(v1.5)>SNS(연료)**(2절, 확정) / 작은 가게의 AI "모름"을 미래지향 가치+증거 측정으로 처리 / **확장성 = 구속 조건: 변할 축에만 확장점(어댑터·레지스트리·config·버저닝), x-sag 패턴 재사용, 엔진 계약 불변·additive only**(6절, 확정)
- **Validation criteria**: 진단 잡이 비동기로 완주하고 신호등 결과를 반환한다 / 비용 게이팅이 동작한다 / 엔진 패키지가 신규 앱에서 workspace import되어 동작한다 / 문서가 release workflow나 GitHub Packages 발행을 현재 범위로 요구하지 않는다
- **Risks**: 데이터 소스 비용 / 키 미결정 / 잡 인프라 선택 / 엔진 결합 강도 / 점수≠실인용 신뢰 리스크 (위 5절)
