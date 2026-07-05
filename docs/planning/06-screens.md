# 06-Screens — 홈 피드 IA 화면 목록

> 목적: 기존 S1~S7 선형 화면을 `home/status/rivals/write/settings` 중심으로 재정의한다. 본 문서는 `/screen-spec`와 구현 라우팅의 기준이다.

> 원칙: 모바일 우선 / 한 화면에 하나의 판단 / 홈 피드 우선 / 결제·외부 알림 제외 / S8·S9는 홈 카드 상태.

---

## 1. Primary Screens

| 화면 | route | 기존 대응 | 목적 | 핵심 요소 |
| --- | --- | --- | --- | --- |
| Home | `/home` | 신규 primary | 재방문 시작점. 오늘 상태와 할 일을 한 화면에서 요약 | ① HERO+오늘 하나, ② 채널 상태, ③ 라이벌 한 줄, ④ 주간 검색어 레이더, ⑤ 꾸준한 한 걸음 |
| Status | `/status` | S2 확장 | 채널별 상태와 근거 확인 | signal row, channel status, evidence sheet, 수정 우선순위 |
| Rivals | `/rivals` | S3+S4 통합 | 경쟁자 비교와 역공학 갭을 한 화면에서 확인 | 경쟁자 한 줄 비교, 누락 키워드/사진/리뷰/메뉴, 근거 sheet |
| Write | `/write` | S5+S6 통합 | 오늘 할 일과 복붙 문안을 실행 가능하게 제공 | 추천 액션, 복붙 문안, 미리보기, copy CTA, 기록 |
| Settings | `/settings` | S7 확장 | 가게/계정 관리 | 가게 정보, 연결 계정, 가게 변경/재진단 진입 |

보조 route:

| 화면 | route | 용도 |
| --- | --- | --- |
| Find | `/find` | 첫 방문 또는 가게 변경 시 가게를 찾고 진단을 시작한다. |

제거/흡수:

| 기존 화면 | 신규 처리 |
| --- | --- |
| S3 경쟁 비교 | `rivals`의 상단 비교 섹션으로 통합 |
| S4 역공학 갭 | `rivals`의 갭 섹션으로 통합 |
| S5 행동 | `write`의 추천 액션 섹션으로 통합 |
| S6 생성물 | `write`의 복붙 문안 섹션으로 통합 |
| Checkout | primary route에서 제거. 현재 범위에서는 사용하지 않음 |
| S8/S9 | 별도 화면 아님. `home` 카드 ④ 상태 |

## 2. Home 상세

Home은 재방문 시작점이며 카드 순서는 고정한다.

| 순서 | 카드 | 목적 | 주요 상태 |
| --- | --- | --- | --- |
| ① | HERO + 오늘 하나 | 가장 먼저 볼 변화와 오늘 처리할 한 가지 | 정상 / 진단중 / 근거부족 / 오류 |
| ② | 채널 상태 | 네이버·구글·SNS·AI 재료 상태 요약 | 좋음 / 손볼 곳 / 준비 전 |
| ③ | 라이벌 한 줄 | 경쟁자가 앞서는 이유 한 줄 | 변화 있음 / 변화 없음 / 비교 불가 |
| ④ | 이번 주 사람들이 찾는 말 | 주간 검색어 레이더 카드 | 관심/미확인 / 대기 / 결과 있음 / 빈 결과 / 실패 |
| ⑤ | 꾸준한 한 걸음 | 리뷰·사진·메뉴·소개글 등 지속 행동 | 오늘 할 일 있음 / 완료 / 보류 |

### Home card ④ — 주간 레이더

| 상태 | UI | CTA |
| --- | --- | --- |
| 비구독 | 이번 주 검색어 예시와 가치 설명 | `이번 주 검색어 받아보기` |
| 대기 | 첫 스캔 예정일 표시 | `홈에서 먼저 확인` |
| 결과 있음 | 이번 주 키워드, 변화, 추천 문안 진입 | `문안 만들기` |
| 빈 결과 | 수집량 부족 안내 | `다음 주에도 지켜보기` |
| 실패 | 스캔 또는 알림 실패 안내 | `다시 시도` |

S8/S9 명칭은 내부 문서 호환용으로만 쓴다.

- S8 = 관심/미확인/대기 상태.
- S9 = 주간 결과/빈 결과/실패 상태.

## 3. Status 상세

목적: 홈 카드 ②를 펼쳐 사장님이 무엇을 고쳐야 하는지 확인한다.

필수 요소:

- 채널별 signal row: `● 좋음`, `◐ 손볼 곳`, `○ 준비 전`.
- 채널: 네이버, 구글, SNS, AI 인용 재료.
- evidence sheet: 수집 시간, 원본 URL, 추정/실측 구분.
- 추천 우선순위: 오늘 직접 할 수 있는 항목을 먼저 보여준다.

금지:

- 숫자 점수 primary 노출.
- 근거 없는 실측 표현.
- 공포형 빨간 경고 남발.

## 4. Rivals 상세

목적: 기존 S3 경쟁 비교와 S4 역공학 갭을 한 화면으로 통합한다.

필수 요소:

- 경쟁자 한 줄 요약: `옆집은 있고, 우리는 없는 것`.
- 비교 축: 키워드, 사진, 메뉴, 리뷰, 소개글, AI 인용 재료.
- 갭 카드: 사장님이 할 수 있는 순서대로 정렬.
- evidence sheet: 비교 근거와 수집 시점.

라우팅:

- `/compare` → `/rivals` redirect 또는 alias.
- `/gap` → `/rivals` redirect 또는 alias.

## 5. Write 상세

목적: 기존 S5 행동과 S6 생성물을 통합해 실행까지 연결한다.

필수 요소:

- 오늘 할 일 한 가지.
- 추천 액션 리스트.
- 복붙 문안: 소개글, 리뷰 요청, 메뉴/사진 설명, FAQ/snippet.
- copy CTA와 복사 완료 상태.
- 문안 근거 또는 사용된 키워드 표시.

라우팅:

- `/actions` → `/write` redirect 또는 alias.
- `/assets` → `/write` redirect 또는 alias.

## 6. Settings 상세

목적: 운영 정보와 계정 상태를 관리한다.

필수 요소:

- 가게 정보와 업종.
- 연결 계정.
- 가게 변경 또는 재진단 진입.

## 7. Navigation

```text
첫 방문: /find → /home
재방문: /home
상세: /home → /status | /rivals | /write | /settings
결제: 현재 범위에서 사용하지 않음
```

Primary bottom navigation:

```text
홈 | 상태 | 라이벌 | 문안 | 설정
```

## 8. Screen Spec 패치 기준

`specs/screens/*.yaml`은 아래 기준으로 맞춘다.

| spec | 조치 |
| --- | --- |
| `index` 또는 `home` | 홈 카드 ①~⑤와 card state를 정의한다. |
| `status` | signal row와 evidence sheet를 정의한다. |
| `compare` | `rivals`로 통합하거나 redirect metadata만 남긴다. |
| `gap` | `rivals`로 통합하거나 redirect metadata만 남긴다. |
| `actions` | `write`로 통합하거나 redirect metadata만 남긴다. |
| `assets` | `write`로 통합하거나 redirect metadata만 남긴다. |
| `settings` | 가게 정보, 연결 계정, 가게 변경/재진단 상태를 유지한다. |
| `checkout` | 제거하거나 비사용 route로 둔다. |

---

## Loop Metadata

- **Upstream docs**: 03-user-flow.md, 04-sme-radar-module.md, 07-boina-sme-ux-redesign.md, 08-sme-design-system.md, 08-radar-subscription-gap-review.md
- **Downstream docs**: `specs/screens/*.yaml`, app routing, navigation, component implementation
- **Validation criteria**: primary screens가 home/status/rivals/write/settings다 / S3+S4와 S5+S6가 통합된다 / S8/S9가 home card state다 / checkout page가 primary route에서 제거된다
- **Risks**: 기존 링크 호환, 홈 카드 과밀, 레이더 카드가 무료 진단 가치를 가릴 위험
