# 00. 전체 개요 — 레이더 플랫폼 기획설계

> 목적: **다음 세션에서 바로 개발 착수 가능한** 구현설계 정본.
> 상위 문서: `N-Content-Radar-역설계.md`, `키워드레이더-사업화계획-v2-크리에이터.md`(§9 부록 포함)
> 작성일: 2026-07-04

---

## 1. 두 개의 제품, 하나의 엔진

```
                    ┌─────────────────────────────┐
                    │   x-sag 엔진 (boina/packages) │
                    │  크롤·파서·SEO/AEO/GEO 점수    │
                    │  AI 실인용(geo-validator)     │
                    │  경쟁사 갭·스니펫 생성          │
                    └──────┬───────────────┬──────┘
                           │               │
        ┌──────────────────┴───┐       ┌───┴──────────────────────┐
        │ ① 서치레이더 (가칭)     │       │ ② boina 레이더 모듈        │
        │ 크리에이터판 · 새 레포    │       │ 소상공인판 · boina 내부     │
        │ 다크 레이더 관제실 웹앱   │       │ "가게 성적표" UX 전면 재설계 │
        │ 미래 월구독(별도 레포) │       │ 무료 주간 스캔 예약        │
        └──────────────────────┘       └──────────────────────────┘
                           ▲               ▲
                    ┌──────┴───────────────┴──────┐
                    │  키워드 레이더 파이프라인 (공용)   │
                    │  자동완성 확장·시드분해 폴백      │
                    │  (사장님레이더-검증에서 검증 완료)  │
                    └─────────────────────────────┘
```

| | ① 서치레이더 (크리에이터) | ② boina 레이더 모듈 (소상공인) |
|---|---|---|
| 코드 위치 | **별도 새 레포** | boina 모노레포 내부 |
| 디자인 | 다크 레이더 관제실 (03 문서) | **"가게 성적표" 신규 시스템 (08 문서)** — boina 기존 비주얼 대체 |
| 핵심 루프 | 발굴→진단→추적 | 진단(기존)→**주간 레이더 스캔 예약**(신규) |
| 결제 | 미래 월 구독(토스 빌링) | **현재 SME v1 범위 아님** — `radar_subscriptions`는 무료 `trialing/active` 스캔 예약 리소스 |
| 착수 순서 | boina 출시 후 별도 새 레포 | **1순위** (현재 `apps/web` 구현 범위) |

## 2. 엔진 공유 전략 (G005 문서 정렬 결정)

현재 SME v1은 **워크스페이스 전용 패키지**를 사용한다. `packages/engine`, `packages/contracts`, `packages/keyword-pipeline`은 모노레포 내부 TS 소스 패키지로 소비하며, 지금 단계에서 `@boina/*`/`@radar/*`를 GitHub Packages에 발행하거나 release workflow를 추가하지 않는다.

1. **현재 범위(SME v1)**: boina 모노레포 내부 `packages/*`를 워크스페이스 의존성으로 연결한다.
   - `packages/keyword-pipeline`은 검증 폴더 JS를 TS 패키지로 이식하되, 배포 산출물 없이 내부 소비한다.
   - `radar_subscriptions`는 유료 결제가 아니라 주간 스캔 예약을 켜는 무료 `trialing/active` 리소스다.
2. **유예 범위(크리에이터 별도 레포 선행조건)**: GitHub Packages 발행은 dist build, package exports, 버전 태그, release workflow가 의도적으로 추가된 뒤 진행한다.
   - 그때 `@boina/engine`, `@boina/contracts`, `@radar/keyword-pipeline` 이름을 사용할 수 있다.
   - 크리에이터 레포는 미래 별도 제품이며 현재 `apps/web` 구현 범위가 아니다.

## 3. 문서 지도

| 문서 | 내용 | 개발 시 용도 |
|------|------|-------------|
| 01-creator-prd.md | 크리에이터판 문제·기능(REQ-C1~C5)·수익·지표 | 범위 판단 기준 |
| 02-creator-screens.md | 화면 8종(S1~S7+S2.5) 상세 명세 — 듀얼 퍼스트 | 프론트 구현 정본 |
| 03-creator-design-system.md | 다크 관제실 토큰·컴포넌트(C-01~C-08)·오픈소스 선정 | UI 구현 정본 |
| 04-sme-radar-module.md | boina 레이더 모듈 PRD (S8/S9 = 홈 카드 ④ 상태) | 기능 명세 정본 |
| 05-architecture.md | 스택·DB·API·잡·엔진 연동 | 백엔드 구현 정본 |
| 06-tasks.md | Phase별 태스크 (ID·의존성·완료 기준) | 실행 계획 |
| **07-boina-sme-ux-redesign.md** | boina IA 재설계 — 위저드→홈 피드, Gap Review 패치 항목 | boina 구조 정본 |
| **08-sme-design-system.md** | "가게 성적표" 디자인 시스템 (M-01~M-07) — boina 비주얼 대체 | boina UI 정본 |
| design/creator-radar-mockup.html | 크리에이터판 S2 성도 뷰 실물 목업 (반응형) | 디자인 기준점 |
| design/boina-home-mockup.html | 소상공인판 홈 실물 목업 (유료 퀄리티 v2) | 디자인 기준점 |

## 4. 착수 규칙

- **boina 레이더 모듈(04+07+08)**: boina의 거버넌스(베이스라인 patch-only)에 따라, 착수 시 07 §5 패치 항목을 boina `docs/planning/`에 Gap Review로 넣고 게이트 판정 후 진행. 현재 `apps/web` 범위는 SME v1이며 Creator Radar 요구사항은 포함하지 않는다.
- **크리에이터판(01~03 및 05~06의 Creator/미래 섹션)**: 미래 별도 새 레포 제품의 요구사항으로 유지한다. GitHub Packages 발행·토스 빌링·Creator 전용 화면은 SME v1 완료 후 dist build/package release workflow를 갖춘 뒤 착수한다.
- 두 작업 모두 이 폴더 문서를 정본으로 참조하고, 변경 시 여기부터 갱신한다.

## 5. 구현 착수 전 확인해야 할 외부 전제

현재 이 저장소가 SME v1 구현 대상이며, `apps/web`, `packages/*`, `docs/planning/`을 함께 갱신한다. 아래 외부 자료가 확인되지 않으면 해당 자료가 필요한 개발 태스크만 보류하고, 현재 저장소 안에서 검증 가능한 SME v1 작업은 계속 진행한다.

| 필요 자료 | 쓰임 | 없을 때 처리 |
|---|---|---|
| boina 모노레포 | Phase A 구현 대상. `docs/planning/` Gap Review, `packages/*`, `apps/web` 수정 | 사용자에게 boina 레포 경로 확인 |
| `사장님레이더-검증/pipeline.js` | `@radar/keyword-pipeline` TS 이식의 원본 산식 | A1-1 착수 전 원본 경로 확인 |
| `N-Content-Radar-역설계.md` | 제품/엔진 상위 분석 근거 | 문서 변경 시만 확인, 구현은 현재 정본 우선 |
| `키워드레이더-사업화계획-v2-크리에이터.md` | 가격·리스크·시장 근거 | 수익모델 변경 시 확인 |
| 네이버 API 키 4종 | 파이프라인 완전 검증 | A1-2 사용자 선행 작업 |
| 토스페이먼츠 빌링 심사 | 미래 Creator/유료 구독 제품 출시 선행 | 현재 SME v1 범위 아님 — 결제 구현 전 별도 결정 |
| 카카오 비즈메시지 발신프로필 | 미래 유료 알림톡/SMS 발송 | 현재 SME v1 범위 아님 — SME v1은 앱 내 홈 카드/주간 스캔 상태 중심 |
