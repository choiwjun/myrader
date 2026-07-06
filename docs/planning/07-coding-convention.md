# 07-Coding Convention — TS/Next 컨벤션 · 엔진 통합 · 헌법 · 카피 가드

> 목적: 본 제품(새 Next.js 앱 + x-sag 엔진 재사용)의 코딩 규약, 엔진 통합 규칙, 헌법(.claude/constitutions) 참조, 정직성/카피 가드 코드 규칙, 대행연결 코드 금지를 정의한다.

---

## 1. TypeScript / Next.js 컨벤션

| 항목 | 규칙 |
|------|------|
| 프레임워크 | Next.js (App Router) 단일 풀스택. 페이지 + Route Handler / Server Action |
| 언어 | TypeScript strict. 엔진 경계 타입은 현재 모노레포 workspace 패키지 `packages/contracts`에서 가져옴 |
| 데이터 | Postgres + Drizzle (x-sag 재사용 가능) |
| 비동기 | 느린 분석은 동기 처리 금지 → 백그라운드 잡(02-trd, 인프라 OQ-5) |
| 명명 | 리소스/엔티티 명명은 04-database-design 개념 모델과 1:1 |

## 2. 엔진 통합 규칙 (x-sag 재사용)

| 규칙 | 내용 |
|------|------|
| 경계 고정 | 엔진과의 모든 입출력은 `packages/contracts` 타입을 통해서만. 앱 코드가 엔진 내부 구현에 직접 의존 금지 |
| 재사용 범위 | core-engine(크롤·파서·analyzers·scoring·v2 gap/competitor/serp/geo-validator/nlp), contracts, naver-presence, llm-provider, snippet |
| 재사용 방식 | **OQ-6 해소(현재 SME v1)** — `packages/*`는 private workspace-only TS 소스 패키지로 import한다. GitHub Packages 발행은 dist build·package exports·버전 태그·release workflow가 의도적으로 추가된 뒤 별도 결정으로 유예한다 |
| 비용 게이팅 | grounded llmValidation·SERP 호출은 게이팅 함수를 거쳐야 함(무분별 호출 금지, 02-trd) |
| 점수 처리 | 엔진이 반환한 점수는 내부 저장만. **UI로 전달하는 레이어에서 신호등으로 변환 강제**(05·다음 4절) |

## 3. 헌법 참조 (.claude/constitutions)

| 헌법 | 경로 | 적용 |
|------|------|------|
| 리소스 중심 API | `nextjs/api-design.md`, `nextjs/api-routes.md` | Route Handler는 리소스 중심 설계 (diagnosis/business/competitor 등) |
| UUID | `common/uuid.md` | 모든 엔티티 식별자는 UUID (04 개념 모델 id) |
| 단일 인증 | `nextjs/auth.md` | 단일 인증 체계 (user, 셀프서비스 직판) |
| Tailwind v4 | `tailwind/v4-syntax.md` | 스타일 규약 (모바일·큰 버튼, 05 비주얼) |
| Seed/검증 | `common/seed-validation.md` | 시드·검증 데이터 규약 |

> 헌법은 항상 자동 적용. 충돌 시 우선순위는 CLAUDE.md 규율을 따른다.

## 4. 정직성 / 카피 가드 코드 규칙 (양보 불가)

| 규칙 | 코드 레벨 강제 |
|------|----------------|
| 점수 비노출 | 점수(number)를 UI 컴포넌트에 직접 props로 넘기지 않음. 신호등 enum(`green`/`yellow`/`red`)으로 변환하는 단일 함수만 통과 |
| 인과 카피 금지 | "고치면 1위/매출↑" 류 문자열을 생성물·UI 카피에 넣지 않음. 카피는 응원·정직 톤(05)만 |
| 누가-하나 부착 | 모든 행동/생성물은 `action_class`(🟢🟡🔴⏳) 필드 필수(04 prescription_snippet·action_completion) |
| 전문용어 차단 | SEO/AEO/GEO 등 용어는 내부 코드/로그 식별자에만. 사용자 노출 문자열에 금지 |
| 생성물 가드 | snippet 엔진 출력도 카피 가드(인과·과장)를 통과해야 UI/이메일로 나감 |

## 5. 대행연결 코드 금지 (스코프 규율)

| 금지 | 사유 |
|------|------|
| 대행/매칭 마켓플레이스 연결 코드 | 01 기각 항목. 무거워짐 — 절대 추가 금지 |
| 외부 업체 매칭·중개·정산 로직 | 비범위. "🔴업체"는 **처방전·이메일 초안 생성까지만**, 업체 연결/중개 코드 작성 금지 |
| 매출/스마트플레이스 성과연결 | GEO 코어 이탈 + API 부재로 종결 — 구현 금지 |

> 위 항목은 스코프 변경 위장 금지(CLAUDE.md) 대상. 추가하려면 사용자 승인 필요.

## 6. 확장성 코딩 규칙(구속)

> **확장성 = 구속 조건**(02-trd 6절 매핑). 원칙: "변할 게 뻔한 축에만 확장점, 나머지는 단순(YAGNI)". x-sag 엔진의 어댑터·contracts·룰 레지스트리·feature flag·provider chain 패턴을 재사용하고, 같은 패턴으로 앱層을 작성하며, 엔진 계약을 깨지 않는다. 아래는 양보 불가 강제 규칙이다.

| 강제 규칙 | 코드 레벨 강제 |
|-----------|----------------|
| 외부 소스 어댑터 격리 | 외부 소스(채널·AI엔진)는 **반드시 어댑터 인터페이스 뒤에**. 서비스/UI에서 외부 API 직접 호출 금지. Mock 어댑터 폴백 유지(테스트·키 미결정 시) |
| 데이터 계약 단일 진실 | 데이터 계약은 `packages/contracts` 단일 진실. 변경은 **additive optional만**(파괴적 변경·스키마 major 금지) |
| 레지스트리화 | 진단 룰·행동타입(`ActionType`)·생성물타입(`AssetType`)은 레지스트리(데이터/핸들러 등록)로. `switch` 하드코딩 금지 |
| feature flag 게이팅 | 신규 기능은 feature flag로 게이팅(다크 출시) |
| 페이월/가격 config화 | 페이월·가격·무료/유료 경계는 config 모듈. **화면 컴포넌트에 금액·경계 하드코딩 금지**. 현재 제외된 "구독"은 Toss/Kakao/SMS/유료 과금이며, Radar `radar_subscriptions`는 무료 `trialing/active` 스캔 예약 리소스라 현재 범위에 포함 |
| 카피 중앙 사전 | 카피는 중앙 사전(i18n식)에서 관리. 화면에 카피 산재 금지. 전문용어 0·인과 금지 규율(4절) 유지 |
| 잡·스토리지 추상화 | 잡 큐·스토리지는 인터페이스 뒤로 추상화(OQ-5 흡수, 인프라 교체 가능) |
| API 버저닝 | API는 `/v1` 버저닝, 응답은 additive(미래 B2B/연동·웹훅 대비) |
| YAGNI | "변할 게 뻔한 축"에만 확장점. 안 변할 것은 추상화 금지(투기적 추상화 금지) |

> 레이어링(엔진 ◀ 어댑터 ◀ 앱 서비스 ◀ UI, 단방향 의존)과 변할 축→패턴 매핑은 02-trd 6절 참조. **UI는 외부 API 직접 호출 금지** — 서비스/contract 경유.

---

## Loop Metadata

- **Upstream docs**: 02-trd.md(아키텍처·엔진 재사용·잡 + 확장성 아키텍처 원칙 6절), 04-database-design.md(모델·UUID), 05-design-system.md(카피 가드)
- **Downstream docs**: 구현 단계(tasks-generator → 구현 스킬), code-review·trinity 품질 게이트
- **Open questions**: OQ-5(잡 인프라 → 비동기 패턴 확정), OQ-4(구글 SERP 키 → 게이팅 함수 구현). OQ-6은 현재 SME v1 기준 workspace-only 패키지 import로 해소됨(외부 발행 유예).
- **Assumptions**: x-sag contracts 타입을 현재 모노레포 workspace 패키지로 사용 / 헌법(.claude/constitutions) 5종이 본 스택에 적용 가능 / Tailwind v4 사용
- **Validation criteria**: 점수가 UI에 직접 노출되는 경로 0건 / 인과·전문용어 카피 0건(린트/리뷰) / 대행연결 코드 0건 / 헌법 위반 0건 / **서비스·UI의 외부 API 직접 호출 0건(전부 어댑터 경유) / contracts 파괴적 변경 0건(additive only) / 룰·타입 switch 하드코딩 0건(전부 레지스트리)**(6절)
- **Risks**: workspace-only 엔진 경계가 앱 내부로 새는 위험 / 카피 가드를 코드로 강제하기 어려움(휴먼 리뷰 의존) / 헌법과 x-sag 관행 충돌
