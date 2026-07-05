# DECISION_LOG — 게이트 레저 · 결정 기록

> 제품: (가칭 미정) 소상공인 셀프 SEO/AEO/GEO 진단 + 경쟁사 비교 + 행동 도구 (네이버+구글, 한눈에)
> 엔진: x-sag(github.com/choiwjun/x-sag) 분석 엔진 *재사용*. 새 git 레포의 새 제품.

## 게이트 레저

| 일자 | 게이트 | 판정 | 근거/산출물 |
|------|--------|------|------------|
| 2026-06-13 | 상류·Research (neurion/deep-research) | 완료(대화) | 메모리 `smb-geo-product` |
| 2026-06-13 | **Planning Gate** (socrates 포맷 직접 문서화) | **베이스라인 산출** | `docs/planning/01~07-*.md` |
| 2026-06-13 | Planning OQ 해소 | OQ-2·OQ-3 확정 / OQ-1·4·5·6 OPEN | 아래 |
| 2026-06-13 | **Design Gate** (/screen-spec) | **완료** | `specs/`(도메인 10리소스 + 7화면 + 공통), 커버리지 0누락 |
| 2026-06-13 | **Tasks** (/tasks-generator) | **완료** | `docs/planning/06-tasks.md` (32태스크, ICV 통과) |
| 2026-06-13 | **Development Gate** (/planning-loop-supervisor) | 🟡 **조건부 Green** | `docs/planning/loop/` (13항목, 하드페일 0, Impl Readiness 3/5). 풀 Green 4조건 미충족 |
| 2026-06-14 | **Development Gate 승격** | 🟢 **풀 Green** | 4조건 충족(OQ-5/6·OQ-3 결정 + AC-7 사장님 검증 + 구글 v1.5) → v1 개발 착수 승인. 근거: 아래 결정 + 사용자 결정 |
| 2026-06-14 | 구현 (/auto-orchestrate) | 🟢 **완료** | Phase 0~3 **32태스크 전부 구현·커밋·push**(github.com/choiwjun/boina, 8커밋). bun 모노레포. test 3470 pass/0 fail, 4게이트(typecheck/lint/build/test) Green |
| 2026-06-14 | **QA Part 2 — 보안 검토** | 🟢 **GREEN** | OWASP·시크릿·결제·인증·페이월·익명진단 Critical 0·프로덕션 High 0. dev 의존성 1건 비차단 |
| 2026-06-15 | **QA Part 2 — 브라우저 실사용 검증 (전 화면 대조)** | 🟢 **GREEN** | dev 실행 → mock 진단 완주 → S2~S6 5화면 스크린샷 mockup/05-design-system 대조. 발견·수정 2건: (1) S4 `/gap` 런타임 크래시 — `GapActionTier`(도메인)→`ActionTier`(UI) 미변환으로 `tierLabel.emoji` undefined. `gapActionTierToClass()` 추가 + ui-labels default 폴백. (2) business 재진단 500 — `naver_place_id` UNIQUE 위반. `confirmBusiness` 멱등화(`findByNaverPlaceId` 재사용). 2-mode 게이트: env-less(typecheck/lint/build exit 0) + env-present(test **3575 pass/0 fail ×2**). 신규 테스트 23(gap-actiontier 3·business-idempotent 3·mock-pipeline 9·business-service +8) |
| 2026-06-15 | **신뢰 골격 보강 (trust-set, 사용자 승인 스코프)** | 🟢 **GREEN** | 사용자 우려("플랫폼 같지 않아 의심") → 신뢰 요소 부재 진단(운영주체·약관·사회적증거 0). 결정: "플랫폼처럼 화려하게"가 아니라 **단순 유지 + 신뢰 앵커**(회의적 페르소나엔 과장 역효과). 구현(중간 풀세트): 홈 강화(왜중요·4스텝·안심 2×2·CTA·**베타 정직 표기**), `SiteFooter`+`site-meta.ts`(운영주체 단일출처, 빈 필드="(오픈 전 등록 예정)" — **가짜값 0**), `/terms`·`/privacy`(초안 고지 박스 + 토스결제·수집항목·면책[순위/매출 보장 안함] 명시). **신규 화면/플로우/결제/역할 추가 없음.** 2-mode 게이트: env-less(typecheck/lint/build exit 0) + env-present(test **3605 pass/0 fail ×2 연속**). 홈/약관/개인정보 스크린샷 시각 검증. ⚠️ **오픈 전 필수**: SITE_META 6필드(상호·대표·사업자번호·주소·이메일·통신판매업번호) 실값 입력 + 약관 법무 검토 |
| 2026-06-15 | **누락 화면 복구 — `/login` (브라우저 실사용 버그)** | 🟢 **GREEN** | 사용자가 ⚙️설정 클릭 시 `/login?next=/settings` **404**. 원인: 인증 백엔드·미들웨어·가드·테스트는 완성됐으나 **`/login` 화면 UI가 32태스크 구현에서 누락**(06-screens 에도 미정의). 수정: `app/login/page.tsx`(이메일/비번 + dev 로그인, `next`/`returnTo` 둘 다 수용) + `lib/auth/safe-redirect.ts`(**오픈 리다이렉트 방지** — 외부/프로토콜상대/스킴/역슬래시/제어문자 차단, 단위테스트 8). 검증: `/settings`(미인증)→307→`/login`→**200**(404 해소), 스크린샷. 2-mode 게이트: env-less exit 0 + env-present test **3623 pass/0 fail ×2 연속**. 신규 테스트 18. ⚠️ **OPEN(비즈니스 결정 필요)**: 프로덕션 로그인/계정 전략 미정 — 회원가입 플로우 없음 + 외부 IdP(카카오 등) `[OPEN]`. 현재 베타는 dev-login 으로만 진입 가능. 결제 유료화 전 "계정을 어떻게 만들 것인가"(카카오 OAuth vs 이메일가입 vs 결제시 자동생성) 결정 필요. **사용자 결정(2026-06-15): 지금은 미루기 — 베타(무료 진단 흐름·수요 검증) 우선, 계정/로그인 전략은 결제 유료화 직전에 결정.** 베타 내부 테스트는 dev-login 으로 진행 |
| 2026-06-15 | **기획 대비 구현 전수 감사 (5차원 병렬)** | 🟢 **완료** | REQ/AC·화면스펙·32태스크·데이터모델/엔진·디자인/정직성 5축 병렬 감사 + 핵심 갭 직접 재검증. **정상 확인**: 32태스크 산출물+테스트 전부 존재, 디자인/정직성 위반 0, 프로덕션 실엔진/GapAnalyzer 배선 정상. **확정 갭 발견**: ①REQ-005 4분류 런타임 붕괴 ②헤더 이메일 노출 ③prod GapAnalyzer 변수 specifier import ④S7 업종 누락 ⑤REQ-006 스니펫 prod 누락 ⑥AC-5 딥링크 정밀도. 의도 보류(구글 실순위·재진단·실키)는 갭 아님 확인 |
| 2026-06-15 | **감사 갭 수정 (#1·#2·#3·#4, 사용자 승인 — 스키마 변경 포함)** | 🟢 **GREEN** | **#1 4분류 붕괴**: `gap_rows` 에 actionTier 컬럼 부재→`deriveGapViewFromPersisted` 가 전부 self_fix 하드코딩→런타임 행동이 전부 🟢. `gap_action_tier` enum + `gap_rows.action_tier` 컬럼 추가, 영속화/읽기 왕복 보존. **검증: /api/action tier 분포 {green_self,yellow_copy,gray_ongoing} distinct + /actions 가 🟢🟡⏳ 섹션 렌더**(이전 전부 🟢). **#2 헤더**: layout 이 이메일 대신 가게명 전달(없으면 브랜드만). **+ 발견·수정(보안)**: `findById`/`findByEmail` 의 `SELECT *` 가 raw row 에 password_hash 를 버퍼링→dev RSC flight 에 **scrypt 해시 직렬화 노출**. 컬럼 명시 선택으로 차단(검증: home flight scrypt 0). **#3**: prod GapAnalyzer 변수 specifier 동적 import→문자열 리터럴 고정(webpack 정적 분석 안전). **#4 업종**: `businesses.category` 컬럼 + confirmBusiness 저장 + settings GET/PUT + SettingsClient 업종 필드. 마이그레이션 `0002_*.sql` 손작성·docker DB 적용 확인. 2-mode 게이트: env-less typecheck/lint/build exit 0(14/14) + env-present test **3623 pass/0 fail**(DB통합 1건 병렬 플래키 — 단독 3/3 통과, 회귀 아님). ⚠️ **잔여(별도)**: confirmBusiness 가 세션 account 에 가게를 연결하지 않아 로그인 사용자의 설정/헤더 가게명이 비는 흐름은 계정전략 결정과 함께 후속 |
| 2026-06-16 | **감사 갭 수정 (#5·#6, 사용자 승인)** | 🟢 **GREEN** | **#5 REQ-006 스니펫 prod 누락**: snippet 은 FAQ 있을 때만 생성 + FAQ 는 dev mock 에서만 주입 → prod 4종 중 스니펫 항상 빠짐. `buildSnippetStarterContent`(프로필 기반 시작 템플릿, 다른 3종과 동일한 복붙 골격) 추가 → FAQ 없으면 시작 템플릿으로 **항상 생성**. 빈 FAQ→snippet 생성 단위테스트로 검증(스니펫은 유료·dev 는 mock FAQ 라 prod no-FAQ 경로가 핵심). **#6 갭→행동 tier 연결**: S4 갭 카드 클릭이 tier 구분 없이 일괄 /actions 이동했음 → 각 갭의 actionTier(#1 으로 확보) 전달 `/actions?tier=` 진입 → 해당 4분류 섹션 스크롤·강조. 뷰포트 스크린샷으로 🟡 섹션 포커스 확인. **#6 part1(갭별 딥링크 URL)은 미수정** — 네이버 스마트플레이스가 섹션 딥링크 미제공(플랫폼 한계, [OPEN] 공통 진입 URL 유지). 2-mode 게이트: env-less typecheck/lint/build exit 0 + env-present test 3623 pass/0 fail(run1, DB E2E 병렬 플래키는 단독 통과·회귀 아님). 참고: 세션 중 Docker 데몬 다운으로 DB 테스트 일시 전체 실패 → Docker 재기동·컨테이너 복구, 마이그레이션 컬럼 볼륨 영속 확인 |
| 2026-06-16 | **기술부채 — DB 통합 테스트 병렬 플래키 격리** | 🟢 **GREEN** | 실 docker PG 접속 통합·E2E 테스트(~17파일)가 병렬 실행 시 동시접속·DB 상태 경합으로 간헐 1건 실패(단독은 항상 통과)하던 부채. vitest `projects` 로 **unit(병렬) / db(단일 fork 직렬)** 분리 — `DB_INTEGRATION_TESTS` 명시 목록을 db project 에서 `poolOptions.forks.singleFork=true` 로 직렬화(동시 PG 접속 0). 검증: 전체 테스트 **4회 연속 3623 pass/0 fail**(이전 ~1/2 확률 플래키 → 0). 테스트 수·총량 동일(3637), 패키지 typecheck/lint 0 |
| 2026-07-05 | **A0-2 — 주간 레이더 구독 결제 L3 결정** | 🟡 **L3 기록 완료** | 신규 주간 레이더 구독은 Toss billing key 기반 월 19,900원으로 분리한다. 별도 checkout route가 아니라 홈 카드 ④의 payment sheet에서 시작하며, 운영/환불/알림 정책 확정 전 production 배포는 금지한다. 근거: `docs/planning/08-radar-subscription-gap-review.md` |
| 2026-07-05 | **A0-2R — 결제·알림 범위 변경** | 🟢 **사용자 지시 반영** | 사용자가 Toss 결제 미사용, Kakao/SMS 알림 없음으로 범위를 변경했다. A0-2의 Toss billing/Kakao/SMS 결정은 현재 개발 범위에서 폐기한다. |
| 2026-07-05 | **A0-7 — 결제 route 비활성화** | 🟢 **GREEN** | `/checkout`은 `/home` redirect로 남기고 `/api/payment`는 `PAYMENT_DISABLED` 410 계약으로 닫는다. PaywallGate export와 결제 성공 흐름 테스트를 제거하고 결제 제외 회귀 테스트로 교체한다. 검증: `payment-disabled-green-3`, `payment-disabled-scope-tests`, lint/typecheck 통과. 실제 Next HTTP dev server는 로컬 Next 설치 불완전으로 차단되어 별도 artifact에 기록 |
| 2026-07-05 | **A0-8 — 공개 약관/개인정보 결제 문구 제거** | 🟢 **GREEN** | `/terms`와 `/privacy`에서 Toss 결제, 결제대행 제3자 제공, 결제정보 보관 문구를 제거하고 현재 결제 기능/결제정보 수집/외부 알림 사업자 제공이 없음을 명시했다. 검증: `public-legal-no-payment-tests`, `public-legal-no-payment-source-scan` |
| 2026-07-05 | **A0-9 — specs/config/schema 결제·알림 전제 제거** | 🟢 **GREEN** | `specs/screens/*`, `specs/shared/components.yaml`, README, `.env.example`, `vitest.config.ts`, radar subscription schema/migrations/repository에서 Toss 결제와 Kakao/SMS 알림 전제를 제거했다. `no-payment-notification-scope`는 active specs/config/schema까지 스캔한다. 검증: `final-scope-review-fix-tests-2`, `final-scope-review-fix-scan-2`, `final-quality-targeted-tests-3`, `final-quality-typecheck-3` |

## 결정 기록

**A0-2 — 주간 레이더 구독 결제 L3 결정 (확정: 2026-07-05, A0-2R로 superseded)**
- 아래 결정은 이력 보존용이다. 현재 개발 범위에서는 적용하지 않는다.
- 신규 `사장님 레이더`는 기존 v1의 일회성 실행팩 결제와 분리된 **월 구독 상품**으로 둔다.
- 가격 기준은 **월 19,900원**이며, 결제 방식은 **Toss billing key 기반 정기결제**를 기본안으로 한다.
- 결제 진입은 별도 checkout page가 아니라 홈 카드 ④(`이번 주 사람들이 찾는 말`)의 **contextual payment sheet**에서 처리한다.
- 구독 중 사용자는 매주 월요일 06:00 KST 스캔 결과를 홈 카드와 카카오/문자 알림으로 받는다.
- 알림은 카카오 알림톡을 우선하고 실패 시 SMS fallback을 둔다.
- 이 결정은 결제·알림·개인정보·환불 정책을 동반하므로 **L3**로 분류한다. production 배포 전에는 Toss 심사, 환불/해지 문구, 알림 수신 동의, 개인정보 처리 항목을 확정해야 한다.
- 구현상 `packages/keyword-pipeline`은 제품 소유 TypeScript pipeline으로 완료 판단한다. 외부 JS 자료는 참고용이며 완료 기준은 현재 패키지 계약이다.

**A0-2R — 결제·알림 범위 변경 (확정: 2026-07-05)**
- 사용자 지시: Toss 결제는 사용하지 않는다.
- 사용자 지시: Kakao/SMS 알림은 없다.
- 영향: 홈 카드 ④는 결제 유도나 외부 알림 설정이 아니라 검색어 관심/확인 흐름으로 처리한다.
- 영향: Settings는 가게 정보와 연결 계정 관리에 집중하며 결제수단, 구독 해지, 영수증, Kakao/SMS 수신 설정을 포함하지 않는다.
- 영향: `/checkout`, payment sheet, Toss billing key, Kakao 알림톡, SMS fallback은 현재 개발 범위에서 제외한다.
- 구현상 `packages/keyword-pipeline`은 제품 소유 TypeScript pipeline으로 완료 판단한다. 외부 JS 자료는 참고용이며 완료 기준은 현재 패키지 계약이다.

**A1-1 — 제품 소유 keyword pipeline 결정 (확정: 2026-07-05)**
- 사용자 지시: pipeline은 외부 완성본을 기다리는 것이 아니라 우리가 만든다.
- 결정: `packages/keyword-pipeline`을 제품 소유 TypeScript 구현의 기준 source of truth로 둔다.
- 영향: radar preview와 weekly scan job은 `@radar/keyword-pipeline`의 `expand`, `collectSignals`, `naverScore` 계약을 사용한다.
- 영향: 외부 JS 자료가 나중에 들어오더라도 참고·비교 자료로만 취급하고, 현재 완료 판단을 막지 않는다.
- 제외: Toss 결제, Kakao/SMS 알림은 A0-2R에 따라 이 결정의 범위가 아니다.

**OQ-2 — MVP 컷 (확정: 추천안)**
- v1 ✅: 가게 찾기 → 내 상태(네이버 실측 + on-page SEO/AEO/GEO + AI 인용 샘플) → 경쟁 비교 → **역공학 갭(핵심 차별)** → 행동 4분류 + "오늘 딱 하나" → 쉬운 것 생성(소개글·리뷰문구·스니펫).
- v1.5 ⏭: 구글 실 SERP 순위 추적(SerpAPI 키), 재진단/추이 모니터링, grounded AI 대량측정.
- 영구 제외 🚫: 대행/매칭 마켓플레이스.
- 근거: 구글은 v1에 "on-page 준비도+AI Overview" 맛보기만, 돈 드는 실순위는 키 결정 후. 무료·즉시 가능한 것으로 핵심 가치 먼저 증명.

**OQ-3 — 수익 모델 (확정: 페르소나 기반)**
- 유입자 = 능동적으로 GEO 분석하러 온 *마케팅 의식 있는 상위 소수* → WTP 있음(단 대행에 데어 회의적).
- **무료**: 진단 + 내 상태 + 경쟁 비교 + 역공학 요약 + "오늘 딱 하나" (훅·신뢰 형성. 정직한 무료 레버 노출).
- **유료 v1 = 일회성 "실행 팩"**: 전체 역공학 갭 + 생성물 전체(소개글·리뷰문구·스니펫·업체 처방전) + 우선순위 실행 플랜. (가끔 쓰는 패턴·낮은 결제장벽)
- **유료 v1.5 = 구독**: 재진단·추이·경쟁사 변화 알림(모니터링 = recurring value).
- 포지셔닝: 대행 월비 대비 저렴 + 시간 절감.
- **가격 확정(2026-06-13, 사장님 검증 반영)**: 무료 진단(저비용: on-page+네이버+AI 맛보기) / **유료 일회성 실행팩 ~4,900~5,900원(커피값)** = 전체 역공학+grounded AI+생성물 / v1.5 구독(모니터링, 진짜 매출 엔진). 근거: 사장님 검증 — 커피값(4~6천)엔 큰 거부감 없음. 세그먼트 2종(대행사 사용=second opinion / 직접관리=비치헤드).
- **단위 경제**: 비싼 비용(grounded AI+역공학 LLM)은 **유료 플랜만** 실행(x-sag isPaidPlan 게이팅+ChatMock $0+AI 예산상한 재사용) → 무료 ~$0, 유료가 자기 AI비용 커버+마진. **가격은 config**로 두고 출시 후 가격 테스트로 확정.

**정보 계층 / 포지셔닝 (확정: 2026-06-13 — AI 우선 재정렬)**
- GEO = AI 검색이 본질. 네이버플레이스 순위로 리드하면 "또 하나의 플레이스 도구"(레드오션) → 정체성 상실.
- **정보 계층(전 화면·데이터 소스 우선순위)**: ①**AI 노출(HERO)** — "AI가 너를 추천하나" (grounded llmValidation) → ②**라이벌 비교·역공학** — "경쟁사는 되는데 너는? 걔는 어떻게?" (GapAnalyzer) → ③**레버 채널: 네이버 > 구글 > SNS(인스타·블로그·유튜브)** — "AI가 널 찾게 하는 연료".
- 작은 가게는 현재 AI 노출이 거의 "모름"이라 → **정직 + 미래지향 프레이밍**: "아직 안 나와요(대부분 그래요) → 지금 준비하는 가게가 AI 시대에 먼저 잡혀요". 현재 AI 측정은 *증거*로 노출.
- n=51 진실(리뷰·평판이 AI 인용 동력)은 *헤드라인*이 아니라 *레버(수단)*로 배치.
- 반영: 목업(design/mockup), 05-design-system(정보 계층), 02-trd(데이터 소스 우선순위), 06-screens(S2/S3 순서·SNS 채널) patch.

**확장성 아키텍처 (확정: 2026-06-13 — 구속 조건)**
- 원칙: "변할 게 뻔한 축에만 확장점, 나머지는 단순(YAGNI)". x-sag 엔진이 이미 이 패턴(어댑터·contracts·룰 레지스트리·feature flag·provider chain)이라 *재사용 + 같은 패턴으로 앱층 작성 + 엔진 계약 안 깨기*가 핵심.
- 변할 축→패턴: 채널(어댑터) · AI엔진(AiEngineAdapter+provider chain) · 진단룰(레지스트리) · 리포트모양(contracts additive optional, 스키마 1.x 무중단) · 가격/페이월(config) · UI피드백(컴포넌트+data_requirements, 카피 중앙관리) · 행동/생성물타입(핸들러 레지스트리) · 인프라(잡·스토리지 인터페이스) · B2B(API /v1 버저닝+웹훅).
- 레이어링: 엔진(순수·재사용) ← 어댑터(외부) ← 앱 서비스 ← UI. **UI는 외부 API 직접 호출 금지**(서비스/contract 경유).
- 반영: 02-trd(확장성 원칙 섹션), 07-coding-convention(구속 코딩 규칙). auto-orchestrate/verification이 이를 게이트로 소비.

**제품명 · 구현 결정 (확정: 2026-06-13)**
- **OQ-1 제품명 = "보이나"** (가칭). 사장님의 단 하나의 질문("AI·검색에 내 가게 보이나?") 그대로. 비IT 친화·전문용어 0. (placeholder들 빌드 시 치환)
- **OQ-6 엔진 통합(권장)**: x-sag `core-engine` + `contracts`(+필요시 platform-presence·v2 gap/competitor/serp)를 새 모노레포에 **패키지로 가져와 독립**(복사 후 독립 패키지화가 MVP 최단). 어댑터·계약 불변(엔진 안 깨기).
- **OQ-5 잡 인프라(권장)**: MVP는 *경량*(DB 기반 큐/서버리스 백그라운드/소형 워커). BullMQ+Redis는 트래픽 늘면. 확장성 규칙대로 **잡 인터페이스 뒤**라 나중에 교체 자유.
- 둘 다 인터페이스 뒤에 격리 → 지금 가볍게 결정, 나중에 교체 OK.

**피드백 수집 채널 (확정: 2026-06-14)**
- 실사용 피드백은 **정식 오픈 후 고객센터 등 운영 채널**로 수집. 앱 내 피드백 수집/관리 기능은 **v1 비범위**(개발 착수 전 고려 대상 아님).
- 단, 확장성 구속 조건(02-trd §6 / 07 §6)은 유지 → 추후 피드백으로 인한 기능 추가는 **기존 흡수 구조(레지스트리·feature flag·config·API 버저닝)**로 처리. 별도 in-app 피드백 기능을 v1에 넣지 않아도 확장성은 보장됨.

**구현 착수 — governance 스킬 플랜 (확정: 2026-06-14)**
- **분류 L3** (신규 풀스택·인증(P1)·결제(P3 Toss)·데이터). 기획~Development Gate 풀 Green → `/stargate` 전체 아닌 **구현 게이트부터 진입**.
- **개발**: `/auto-orchestrate` (결정트리: 06-tasks.md 있음+단일워커=기본빌더, 의존성 직렬/병렬+Worktree+TDD). 조건부 `/reverse`(P0-R0 엔진통합 시 x-sag 구조 파악).
- **검수(QA Part 2)**: verification→evaluation→code-review→(powerqa↻5)→systematic-debugging. 프론트(Phase 2) vercel-review·출시 전 audit+trinity 조건부.
- **제외**: /stargate(기획완료)·harness/harness-forge/cmux-harness(auto-orchestrate가 적합)·socrates/doubt(기획완료)·odysseus(상태명확).
- **모델**: cost-router 3-tier + 인증/결제/데이터 결정·go-no-go는 opus 강제.
- **레포**: 현재 폴더(claude)=boina 모노레포 루트. `git init -b main` + origin=github.com/choiwjun/boina(빈 레포). Labs 배포물(install*·uninstall·INSTALL·CHANGELOG·WORKFLOW·pipeline-map)은 `.gitignore` 제외(로컬 보존), README는 보이나용 교체.
- **x-sag 소스**: `C:\Users\wj941\OneDrive\바탕 화면\x-sag` 읽기 접근 확인(Read 도구+PowerShell OpenRead). 복사 대상 = core-engine 252파일·contracts 29·db 42(~2.76MB). deps: cheerio·undici·zod·robots-parser(+optional playwright/axe-core/jsdom). ※ Glob 도구는 작업디렉토리 밖이라 미접근 → 복사·탐색은 PowerShell/Read(절대경로) 사용.

**익명 진단 + Phase 2 구현 결정 (확정: 2026-06-14)**
- **익명 진단**: `businesses.account_id`를 **nullable**로(마이그레이션 `0001_anonymous_business.sql`) — S1 auth:false / **AC-1 "이름 한 칸으로 진단 시작"** 정합. 미인증 진단 → 결제(P3)/설정(S7) 시 account 귀속. 인증 경계: **S1~S6 익명, S7·결제만 인증**.
- **영속화**: DiagnosisJson → `engine_results(channel)`/`competitors`/`gap_rows`/`generated_assets`/`actions` (04 §4 의도 구현). **engine `./v2/gap` export 활성화**(잠든 GapAnalyzer 라이브 배선 — FR-012).
- **flaky 개선**: vitest `server.deps.inline:[/@boina\//]`로 engine 배럴 import 병렬 경쟁 제거(2회 연속 0 failed).
- **누적 [OPEN] (대부분 v1.5/P3, 발명 금지로 미구현 보존)**: drizzle meta 저널 미유지(직접 SQL 적용) / 익명 business 행 GC 정책 / 익명→account claim 엔드포인트(P3 결제) / business.category derived(04 미보유 컬럼) / naverPresence.competitorTop 정밀 영속화(실 네이버 키, v1.5) / 페이월 금액 OQ-3(P3).

**v1 구현 완료 (2026-06-14)**
- Phase 0~3 **32태스크 전부 구현·커밋·push** (github.com/choiwjun/boina, main, 8커밋: baseline→P0→P1-R1→P1→P2-R→P2영속화→P2-S→P3). 현재 폴더(claude)=boina 모노레포 루트(Labs 배포물은 .gitignore 제외).
- **스택**: bun workspaces — apps/web(Next.js 15 App Router·Tailwind v4) + packages/{engine,contracts,db,jobs}. Postgres+Drizzle(docker), Vitest, biome.
- **핵심(2026-06-14 당시 이력)**: x-sag 엔진 실배선(crawler·analyzers·scoring·v2 gap/competitor/serp/llm — **잠든 GapAnalyzer 활성화**), 익명 진단(account_id nullable·AC-1), 진단 파이프라인→DB 영속화(04 §4), 채널 신호등(naver/google맛보기/AI grounded 게이팅), 경쟁 비교, 역공학 갭(무료 Top3/유료 전체), 행동 4분류+오늘딱하나, 생성물 4종, 페이월 서버 강제, Toss 일회성 결제(mock+실키), 8페이지(S1~S7+checkout). 현재 범위에서는 A0-2R/A0-7에 따라 결제 표면을 닫는다.
- **품질**: test **3470 pass/0 fail**(2회 안정), 4게이트 Green, 정직성 가드(점수/전문용어/인과 0), **보안 게이트 GREEN**(Critical 0).
- **출시 전 잔여(코드 외, v1.5/운영)**: 실키 연동(네이버 Search·grounded AI·Toss prod·구글 SERP=OQ-4 v1.5) / 가격 확정(OQ-3 config 조정) / 사장님 실사용 검증(목업 이해도 검증은 2026-06-13 완료) / 엔진 차기버전 보안(DNS rebinding·dev 의존성 bump) / 결제이력·재진단(REQ-007) 영속화=v1.5.

**수정 라운드 — production readiness (확정: 2026-06-14, 외부 GPT QA 반영)**
- 외부 QA가 출시차단·운영 이슈 다수 적발(valid). 교훈: **개발 게이트(typecheck/test/build with env) 통과 ≠ 출시 준비**. 매 검증에 env 주입·docker PG가 있어 "env 없이 build 실패"를 못 봤음. **신규 게이트 추가: "env 없이 `bun run build` 성공"**.
- **R-A(backend)**: 빌드 env 독립(DB route force-dynamic → env 없이 build exit 0) / **mock production fail-fast**(production에서 Toss·네이버 키 없으면 503 — 가짜 결제 DONE·가짜 사업장 노출 차단) / **rate limit**(business 검색·확정·diagnosis enqueue) + **diagnosisId=비추측 UUID capability token 명문화**(익명 진단 설계) + businessId 존재 404 가드 / 마이그레이션 `0000_init` account_id **nullable 통합**(clean DB 0000만으로 익명 동작) / .env.example 운영키 전수 문서화 / engine dead import 제거.
- **R-B(frontend)**: 홈 `/` 실제 랜딩(보이나 소개+"내 가게 살펴보기"→/find, P0-T1 스켈레톤 제거) / **제품명 "보이나" 반영**(AppHeader, OQ-1 해소) / 접근성 pinch-zoom 허용(userScalable) / getCurrentUser 런타임 에러 가시화(빌드타임/런타임 분기).
- **게이트**: ✅ env 없이 typecheck/lint/build exit 0(신규) + env 있이 **test 3507/0 fail**(2회 안정). 회귀 0.
- **잔여(출시단계/v1.5)**: rate limit 단일프로세스 in-memory(분산은 OQ-5 인프라 확정 후 동일 인터페이스 교체) / OQ-3 금액 placeholder / 실키 연동·사장님 실사용 검증 / GPT QA의 일부(루트 typecheck "tsc 못 찾음"=GPT 환경 bun install 미실행, layout metadata "깨짐"=정상)는 비해당.

**autoplan 3관점 리뷰 + R2 수정 (확정: 2026-06-14)**
- gstack autoplan(codex 미설치 → Claude single-model) CEO·Design·Eng **3관점 독립 리뷰 → 전원 출시 차단(NO-GO)**. 게이트 통과(test)가 "동작"을 보증 못 한 치명 결함 적발.
- **최고신뢰 cross-phase 발견(Eng+Design 독립 일치)**: 잡 큐 `drain()` 호출자가 프로덕션에 없어 진단 영구 `queued`(**0% 동작**) → S3~S5 빈 화면. test 3507 통과는 테스트가 drain을 직접 호출한 맹점.
- **R2-A(backend)**: `DbBackedJobQueue` + 2경로 drain(enqueue 직후 백그라운드 + `/api/jobs/process` cron route + vercel.json) + **핸들러 db 주입**(영속화가 프로덕션 0이던 추가 결함) + 경쟁사/갭 영속화(S3~S5 실데이터) + 타임아웃 180s/dedup + **잡 실행 E2E**(프로덕션 트리거 경로 검증).
- **R2-B(frontend)**: S2 **AI-HERO 재배선**(검증 목업 일치 — overall-도트 역전 수정, AC-7 정합 회복) + 빈데이터 **정직성 카피**(측정부재≠승리) + S5 모순 카피 제거 + 브랜드 위계.
- 게이트: env 없이 build exit 0 + **test 3552/0 fail**(2회 안정).
- **전략 이슈(코드 아님 — CEO No-Go, 비즈니스 결정 영역)**: 수요 미검증(7 프리미스 중 6 가정)·단위경제(CAC/LTV) 미설계·일회성 ~5천원 LTV 회수 곤란·정직성 vs 전환 충돌 → **출시 전 수요 스모크테스트 + 단위경제 모델 + 구독(v1.5) 당김 검토** 권고.

## 미해결 (OPEN)
- OQ-4 구글 SERP 키·비용 (v1.5 진입 시 결정 — SerpAPI vs SearchAPI vs DataForSEO)

## 해소됨 (RESOLVED)
- ✅ **AC-7 사장님 이해도 검증** (2026-06-14) — 2026-06-13 제작 목업(`design/mockup/sajangnim-validation.html`) 검증으로 사장님 이해/만족 확인(사용자 보고). G-사장님이해 게이트 충족 → **Development Gate 조건부 Green → 풀 Green 승격.** ※ 목업 리뷰 기반 만족 확인이며 정량 stopwatch 측정은 아님 — 정식 오픈 후 실사용 행동 데이터로 재확인 권장.
