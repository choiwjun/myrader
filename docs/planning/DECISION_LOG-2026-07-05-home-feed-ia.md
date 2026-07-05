# DECISION_LOG Addendum — Wizard IA에서 Home Feed IA로 전환

- 작성일: 2026-07-05
- 상태: A0-3 UX restructure decision
- 관련 문서: `docs/planning/08-radar-subscription-gap-review.md`, `docs/planning/03-user-flow.md`, `docs/planning/06-screens.md`, `docs/planning/05-design-system.md`, `specs/screens/index.yaml`, `specs/screens/home.yaml`

## 결정

기존 S1~S7 선형 진단 흐름을 `home/status/rivals/write/settings` 중심의 재방문형 홈 피드 구조로 전환한다.

## 근거

사장님 사용자는 매번 진단 터널을 통과하기보다 오늘 처리할 일과 최근 변화만 빠르게 확인해야 한다. 신규 주간 레이더 구독도 별도 화면보다 홈 카드 ④에서 상태로 보여주는 편이 재방문 사용 맥락에 맞다.

## 영향

- 첫 방문은 `/find`에서 시작하지만 진단 완료 후 `/home`으로 이동한다.
- 재방문 시작점은 `/home`이다.
- Primary menu는 `/home`, `/status`, `/rivals`, `/write`, `/settings`다.
- 기존 S3 경쟁 비교와 S4 역공학 갭은 `/rivals`로 통합한다.
- 기존 S5 행동과 S6 생성물은 `/write`로 통합한다.
- S8/S9 레이더 구독은 별도 route가 아니라 `home`의 weekly_search_terms card 상태로 관리한다.
- 별도 checkout route는 primary IA에서 제거한다.
- 2026-07-05 사용자 지시에 따라 Toss 결제와 Kakao/SMS 알림은 현재 범위에서 제외한다.

## 검증

2026-07-05 원격 fetch로 아래 반영을 확인했다.

- `docs/planning/03-user-flow.md`: home feed flow, S8/S9 home card state, routing 전환 규칙.
- `docs/planning/06-screens.md`: home/status/rivals/write/settings primary screen과 card order.
- `docs/planning/05-design-system.md`: `가게 성적표` UX, M-01~M-07, `●/◐/○` 상태 표현.
- `specs/screens/index.yaml`: v3 primary menu와 legacy redirects.
- `specs/screens/home.yaml`: home card ①~⑤, weekly_search_terms S8/S9 state.
- `specs/screens/vs-competitor.yaml`: `/rivals` 통합 스펙.
- `specs/screens/actions.yaml`: `/write` 통합 스펙.

## 남은 구현 조건

- 앱 라우팅과 UI 코드는 이 문서 기준으로 별도 구현해야 한다.
- `packages/keyword-pipeline`은 제품 소유 TypeScript pipeline으로 완료 판단한다. 외부 JS 자료는 참고용이며 완료 기준은 현재 패키지 계약이다.
