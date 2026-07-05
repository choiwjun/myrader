# 보이나 (boina)

> 소상공인이 **내 가게가 검색·AI에 잘 보이는지 / 경쟁사보다 어떤지 / 그래서 뭘 해야 하는지**를 한눈에 보는 모바일 셀프서비스 진단 도구.

비IT 소상공인(음식점·미용·카페 등)이 직접, 5분 만에 "내 가게가 네이버·구글·AI 추천에 잘 잡히는지"를 확인하고 바로 행동하게 만드는 집중형 제품입니다.

---

## 사장님의 단 하나의 질문

1. 내가 검색·AI에 잘 보이나
2. AI가 나를 잡아 상위 추천하나
3. 경쟁사는 나보다 잘 되나
4. 경쟁사가 잘 되면 어떻게 셋팅했나 (역공학)
5. 그래서 내가 뭘 해야 하나

## 3-스텝 흐름

| 스텝 | 화면 | 내용 |
|------|------|------|
| ① 내 상태 | S2 | **AI 노출(HERO)** → 채널 신호등(네이버·구글·SNS), 점수 대신 신호등 |
| ② 경쟁 비교 + 역공학 | S3·S4 | 경쟁사가 AI에 잡히나 vs 나 (손실 프레이밍) → "걔는 갖췄고 당신은 없음" 갭 매트릭스 |
| ③ 행동 | S5·S6 | 4분류(🟢직접·🟡복붙·🔴업체·⏳꾸준히) + **"오늘 딱 하나"** + 복붙 생성물 |

## 핵심 차별

- **역공학 갭** — 경쟁사를 같은 엔진으로 진단해 "무엇을 갖췄고 당신은 무엇이 없는지"를 매트릭스로.
- **AI 우선** — GEO=AI 검색이 본질. 네이버 순위가 아니라 "AI가 너를 추천하나"를 HERO로.
- **정직성** — 점수·전문용어 숨김, 인과("고치면 1위") 카피 금지, 진짜 레버(리뷰·평판)를 정직하게 안내.

## 기술

- **앱**: Next.js (App Router) 단일 풀스택 + 백그라운드 잡(경량)
- **엔진**: [x-sag](https://github.com/choiwjun/x-sag) 분석 엔진을 **부품으로 재사용** (복사 후 독립 패키지화) — 크롤·파서·SEO/AEO/GEO 점수·AI 실인용·네이버 노출·경쟁사 GapAnalyzer·스니펫 생성
- **DB**: Postgres + Drizzle (x-sag diagnosis 스키마 차용)
- **레이더**: 제품 소유 keyword pipeline 기반 주간 검색어 관심/결과 흐름

```
apps/web/          Next.js App Router (S1~S7)
packages/engine/   x-sag core-engine 재사용 (복사 후 독립)
packages/contracts/ 엔진 경계 타입 (단일 진실)
packages/db/       Postgres + Drizzle
```

## 개발 상태

- **기획**: ✅ 풀 Green (2026-06-14) — PRD·TRD·화면·태스크·게이트 전부 통과
- **구현**: ▶ Phase 0 (모노레포 + x-sag 엔진 통합 + DB + 잡 골격) 착수

### 기획 문서

- 정본: [`docs/planning/01~07-*.md`](docs/planning/) + [`specs/`](specs/) (화면 명세) + [`docs/planning/06-tasks.md`](docs/planning/06-tasks.md) (32 태스크)
- 결정 기록: [`docs/planning/DECISION_LOG.md`](docs/planning/DECISION_LOG.md)
- 게이트: [`docs/planning/loop/`](docs/planning/loop/)

---

> 이 레포에는 개발에 사용하는 `.claude/`(governance·스킬·에이전트)와 `CLAUDE.md`(운영 규칙)가 함께 있습니다 — 제품 빌드 중 게이트·스킬을 그대로 활용합니다.
