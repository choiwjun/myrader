# 03-User Flow — 홈 피드 중심 흐름

> 목적: 기존 S1→S7 선형 진단 터널을 재방문형 홈 피드 구조로 바꾼다. 사장님은 매번 긴 진단을 다시 통과하지 않고, 홈에서 오늘 볼 것과 할 일을 바로 확인한다.

> 원칙: 모바일 우선 / 한 번에 하나 / 입력 최소 / 보고서 아닌 이야기 / 홈 피드가 기본 시작점.

---

## 1. 핵심 구조

| 상황 | 시작점 | 목표 |
| --- | --- | --- |
| 첫 방문 | `find` | 가게 이름 한 칸으로 가게를 찾고 첫 진단을 만든다. |
| 진단 완료 직후 | `home` | 오늘 상태, 경쟁 변화, 주간 검색어, 오늘 할 일을 한 화면에서 본다. |
| 재방문 | `home` | 새 변화와 다음 행동만 빠르게 확인한다. |
| 가게 변경/재진단 | `find` 또는 `settings` | 가게를 다시 선택하거나 연결 정보를 수정한다. |

Primary navigation은 아래 5개다.

```text
/home
/status
/rivals
/write
/settings
```

`/find`는 첫 방문과 가게 변경에만 쓰는 보조 진입이다.

## 2. 텍스트 플로우

```text
[첫 방문] find
  사장님: 가게 이름(+지역)을 한 칸에 입력
    └ 네이버 플레이스 후보에서 내 가게 선택
        └ 진단 job enqueue
            └ 완료 후 home으로 이동

[기본 시작] home
  ① HERO + 오늘 하나
     "지금 가장 먼저 볼 것"과 오늘 처리할 한 가지를 보여준다.
  ② 채널 상태
     네이버/구글/SNS/AI가 가게를 알아볼 재료를 충분히 갖췄는지 요약한다.
  ③ 라이벌 한 줄
     경쟁자가 앞서는 이유와 내게 없는 것을 한 줄로 보여준다.
  ④ 이번 주 사람들이 찾는 말
     주간 검색어 레이더 카드. 결제나 알림 없이 홈에서 먼저 확인한다.
  ⑤ 꾸준한 한 걸음
     리뷰, 사진, 메뉴, 소개글처럼 지속적으로 쌓아야 할 행동을 제안한다.

[상세] status
  홈의 ②를 펼쳐 채널별 상태, 근거 sheet, 수정 우선순위를 본다.

[상세] rivals
  홈의 ③을 펼쳐 경쟁자 비교와 역공학 갭을 같이 본다.
  기존 S3 경쟁 비교와 S4 역공학 갭은 이 화면으로 통합한다.

[상세] write
  홈의 ①·⑤에서 이어진 추천 액션과 복붙 문안을 만든다.
  기존 S5 행동과 S6 생성물은 이 화면으로 통합한다.

[보조] settings
  가게 정보와 연결 계정을 관리한다.
```

## 3. S8/S9 재정의 — 별도 route가 아니다

`사장님 레이더`의 S8/S9는 새 화면이 아니라 `home` 카드 ④의 상태다.

| 상태 | 설명 | CTA |
| --- | --- | --- |
| S8 관심/미확인 | 이번 주 사람들이 어떤 말로 찾는지 일부 예시와 가치 설명을 보여준다. | `이번 주 검색어 받아보기` |
| S8 대기 | 첫 스캔 전 상태다. | `홈에서 먼저 확인할게요` |
| S9 결과 있음 | 이번 주 검색어, 변화, 복붙 문안 진입을 보여준다. | `문안 만들기` → `write` |
| S9 빈 결과 | 충분한 키워드가 없거나 수집량이 부족한 상태다. | `다음 주에도 지켜볼게요` |
| S9 실패 | 스캔 실패 상태다. | `다시 시도` 또는 고객센터 안내 |

## 4. Routing 전환 규칙

| 기존 route | 신규 처리 |
| --- | --- |
| `/find` | 첫 방문/가게 변경 전용으로 유지 |
| `/status` | 유지하되 홈 카드 ②의 상세 화면으로 재정의 |
| `/compare` | `/rivals`로 redirect 또는 alias |
| `/gap` | `/rivals`로 redirect 또는 alias |
| `/actions` | `/write`로 redirect 또는 alias |
| `/assets` | `/write`로 redirect 또는 alias |
| `/checkout` | primary route에서 제거. 현재 범위에서는 결제 route를 사용하지 않음 |
| `/settings` | 유지하고 가게/계정 관리를 담당 |

## 5. 결제·알림 제외

2026-07-05 사용자 지시로 Toss 결제와 Kakao/SMS 알림은 현재 개발 범위에서 제외한다.

- 홈 카드 ④는 결제 진입이 아니라 검색어 관심/확인 흐름으로 처리한다.
- Kakao 알림톡과 SMS fallback은 구현하지 않는다.
- 결제/구독 상태, 결제수단, 해지/영수증 관리는 Settings에 넣지 않는다.

## 6. 흐름 규율

- 홈 피드가 primary 시작점이다.
- 한 카드에는 하나의 판단 또는 하나의 행동만 둔다.
- S3+S4는 `rivals`, S5+S6는 `write`로 통합한다.
- S8/S9는 route가 아니라 home card state다.
- 결제와 외부 알림은 현재 범위에서 제외한다.
- 측정/추정/실패/빈 결과를 구분해 표시한다. 근거 없는 실측 표현은 금지한다.

---

## Loop Metadata

- **Upstream docs**: 01-prd.md, 04-sme-radar-module.md, 07-boina-sme-ux-redesign.md, 08-sme-design-system.md, 08-radar-subscription-gap-review.md
- **Downstream docs**: 06-screens.md, 05-design-system.md, `specs/screens/*.yaml`, routing implementation
- **Open questions**: 실제 네이버/데이터랩/검색광고 운영 키와 quota 정책 확정
- **Validation criteria**: 재방문 시작점이 home이다 / primary menu가 home-status-rivals-write-settings다 / S8/S9가 home card ④ 상태다 / checkout route가 primary IA에서 빠진다
- **Risks**: 기존 deep link 깨짐, S3/S4 통합 시 정보 과밀, 레이더 카드가 홈을 과도하게 점유할 위험
