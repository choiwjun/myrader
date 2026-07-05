# 08-Radar Gap Review — 홈 피드 전환 + 주간 레이더

- 작성일: 2026-07-05
- 상태: A0-1 Gap Review patch, 2026-07-05 scope revision
- 대상 저장소: `choiwjun/boina`
- 목적: 기존 boina v1 기획서와 신규 `사장님 레이더` 모듈 기획 사이의 차이를 개발 가능한 변경 단위로 고정한다.

> 2026-07-05 사용자 지시: Toss 결제는 사용하지 않으며 Kakao/SMS 알림도 없다. 본 문서의 결제·알림 요구는 현재 범위에서 제외한다.

## 1. 입력 기준 문서

| 구분 | 기준 문서 | 역할 |
| --- | --- | --- |
| 신규 모듈 | `docs/04-sme-radar-module.md` | 주간 검색어 레이더와 주간 스캔 요구사항. 결제·카카오/문자 알림은 제외 |
| UX 재구성 | `docs/07-boina-sme-ux-redesign.md` | 6단계 진단 터널을 홈 피드 중심 구조로 전환 |
| 디자인 시스템 | `docs/08-sme-design-system.md` | `가게 성적표` 톤, 모바일 우선 컴포넌트, 비공포 상태 표현 |
| 실행 계획 | `docs/06-tasks.md` | Phase A의 A0-1/A0-2/A0-3/A1/A2/A3/A4 작업 순서 |

## 2. 현재 boina 기준선

2026-07-05 기준 원격 저장소 문서를 확인한 결과, boina는 기존 v1 진단 흐름을 기준으로 정리되어 있다.

| 파일 | 현재 상태 | 신규 기획과의 차이 |
| --- | --- | --- |
| `docs/planning/03-user-flow.md` | S1 가게 찾기 → S2 상태 → S3 경쟁 → S4 갭 → S5 행동 → S6 생성물 중심 | 홈 피드, 오늘 할 일, 주간 검색어 카드가 없음 |
| `docs/planning/06-screens.md` | S1~S7 화면 목록 중심 | S3+S4 통합 화면, S8/S9의 홈 카드 상태 정의가 없음 |
| `docs/planning/05-design-system.md` | 기존 boina v1 시각/컴포넌트 기준 | 신규 `가게 성적표` 시스템과 컴포넌트 M-01~M-07 반영 필요 |
| `docs/planning/06-tasks.md` | 기존 v1 구현 태스크 중심 | 레이더 주간 스캔 태스크가 없음 |
| `docs/planning/DECISION_LOG.md` | v1 구현 결정 이력 중심 | Wizard → Home feed 전환과 결제·알림 제외 결정 기록 필요 |

## 3. 핵심 Gap 요약

| 영역 | Gap | 변경 방향 |
| --- | --- | --- |
| IA/흐름 | 기존은 선형 진단 터널이다. | 첫 방문 진단 후 홈 피드로 도착하고, 재방문은 홈 피드에서 시작한다. |
| 홈 화면 | 주간 검색어 레이더 카드가 없다. | 홈 카드 ④ `이번 주 사람들이 찾는 말`을 추가하고 관심/대기/결과/실패 상태를 정의한다. |
| 경쟁/갭 | S3 경쟁 화면과 S4 갭 화면이 분리되어 있다. | `rivals` 화면에서 경쟁자 한 줄 비교와 역공학 갭을 통합한다. |
| 작성/액션 | S5 행동과 S6 생성물이 분리되어 있다. | `write` 화면에서 추천 액션, 복붙 문안, 증거 보기 흐름을 묶는다. |
| 디자인 | 기존 시각 언어는 신규 문서와 다르다. | `05-design-system.md`의 원칙은 유지하되 시각/컴포넌트 계층은 `08-sme-design-system.md`로 교체한다. |
| 데이터 | 레이더 스캔/키워드 테이블이 없다. | `radar_scans`, `radar_keywords`, `radar_feedback` 중심으로 추가한다. 기존 subscription 구조는 내부 추적용으로만 취급한다. |
| 배치 | 주간 스캔 파이프라인이 없다. | 매주 월요일 06:00 KST 기준 스캔 job을 추가한다. |
| 결제 | 기존 문서에 월 구독 결제 플로우가 있었다. | Toss 결제는 현재 범위에서 제외한다. |
| 알림 | 기존 문서에 카카오/문자 주간 전달 흐름이 있었다. | Kakao/SMS 알림은 현재 범위에서 제외한다. |
| 거버넌스 | 신규 범위 변경 기록이 필요하다. | `DECISION_LOG.md`에 결제·알림 제외 결정을 추가한다. |

## 4. 문서별 패치 지시

### 4.1 `docs/planning/03-user-flow.md`

기존 3단계/6화면 터널 설명을 아래 구조로 바꾼다.

1. 첫 방문
   - `find`: 내 가게 찾기와 초기 진단 입력
   - 진단 완료 후 `home`으로 이동
2. 재방문
   - 항상 `home`에서 시작
   - 홈 피드는 오늘 처리할 일, 채널 상태, 경쟁 변화, 주간 검색어를 순서대로 보여준다.
3. 주요 메뉴
   - `home`: 전체 요약과 우선순위
   - `status`: 네이버/카카오/구글/인스타 등 채널별 상태
   - `rivals`: 경쟁자 비교와 역공학 갭 통합
   - `write`: 추천 액션과 복붙 문안
   - `settings`: 가게, 연결 계정 관리
4. S8/S9
   - 별도 route가 아니다.
   - 홈 카드 ④의 상태로 정의한다.
   - S8: 관심/미확인/대기 상태
   - S9: 주간 스캔 결과 상태

### 4.2 `docs/planning/06-screens.md`

화면 목록을 신규 IA 기준으로 재정렬한다.

| 신규 화면 | 기존 대응 | 필수 내용 |
| --- | --- | --- |
| `home` | 신규 | HERO, 오늘 할 일, 채널 상태, 경쟁 변화, 주간 검색어, 꾸준한 한 걸음 |
| `status` | S2 확장 | 채널별 상태, 증거 sheet, 수정 우선순위 |
| `rivals` | S3+S4 통합 | 경쟁자 한 줄 비교, 누락 키워드/사진/리뷰/메뉴, 근거 보기 |
| `write` | S5+S6 통합 | 추천 액션, 복붙 문안, 미리보기, 기록 |
| `settings` | S7 유지/확장 | 가게 정보, 연결 계정 |

삭제/흡수 대상:

- 별도 checkout route는 만들지 않는다. 현재 범위에서는 결제 진입을 만들지 않는다.
- S8/S9는 별도 화면이 아니라 `home`의 weekly search terms card 상태로 관리한다.
- `compare`, `gap`, `actions`, `assets`는 신규 라우트의 하위 섹션 또는 redirect/alias로 처리한다.

### 4.3 `docs/planning/05-design-system.md`

유지할 것:

- 기존 원칙 1, 1-A, 2, 3의 문제 해결 방향
- 사장님이 겁먹지 않게 설명하는 톤
- 근거를 접어서 보여주는 방식

교체할 것:

- 색상/타이포/아이콘/상태 표현은 `docs/08-sme-design-system.md`를 기준으로 한다.
- 컨트롤 목적의 emoji UI는 사용하지 않는다.
- 위험을 과장하는 빨간 경고 중심 표현은 피한다.
- 상태 표현은 `● 좋음`, `◐ 손볼 곳`, `○ 준비 전`처럼 낮은 위협도의 3단계로 둔다.
- 주요 컴포넌트는 M-01~M-07을 따른다.

### 4.4 `specs/screens/*.yaml`

아래 화면 스펙을 신규 구조로 맞춘다.

| 대상 | 조치 |
| --- | --- |
| `index` 또는 `home` | 홈 피드 카드 ①~⑤를 정의한다. |
| `status` | 채널 상태, signal row, evidence sheet를 정의한다. |
| `compare`/`gap` | `rivals`로 통합하거나 redirect metadata를 남긴다. |
| `actions`/`assets` | `write`로 통합하거나 섹션으로 흡수한다. |
| `settings` | 가게 정보, 연결 계정 항목을 유지한다. |

### 4.5 Routing/App 변경

신규 primary navigation:

```text
/home
/status
/rivals
/write
/settings
```

전환 규칙:

- `/find`는 첫 방문 또는 가게 변경 시만 사용한다.
- `/compare`와 `/gap`은 `/rivals`로 redirect한다.
- `/actions`와 `/assets`는 `/write`로 redirect한다.
- 기존 컴포넌트는 가능하면 재사용하되, 사용자에게 노출되는 IA는 신규 메뉴 기준으로 정리한다.

### 4.6 레이더 모듈 추가

| 레이어 | 변경 |
| --- | --- |
| `packages/keyword-pipeline` | 제품 소유 TypeScript pipeline으로 확장·수집·스코어링 계약을 관리한다. 외부 JS 자료는 참고용이며 완료 기준은 현재 패키지 계약이다. |
| `packages/db` | `radar_scans`, `radar_keywords`, `radar_feedback` 중심 migration 추가 |
| `packages/jobs` | 매주 월요일 06:00 KST 주간 스캔 job 추가 |
| `apps/web` | 홈 카드 ④와 문안 진입 상태 표시 추가 |
| billing | 현재 범위 제외 |
| notification | 현재 범위 제외 |

### 4.7 `docs/planning/DECISION_LOG.md`

아래 결정을 추가한다.

```md
## 2026-07-05 — Wizard IA에서 Home Feed IA로 전환

- 결정: 기존 S1~S7 선형 진단 흐름을 `home/status/rivals/write/settings` 중심의 재방문형 홈 피드 구조로 전환한다.
- 근거: 사장님 사용자는 매번 진단 터널을 통과하기보다 오늘 처리할 일과 변화만 빠르게 확인해야 한다.
- 영향: S3+S4는 `rivals`로 통합하고, S5+S6는 `write`로 통합한다. S8/S9 레이더 구독은 별도 route가 아니라 홈 카드 ④의 상태로 관리한다.
- 결제/알림: Toss 결제와 Kakao/SMS 알림은 현재 범위에서 제외한다.
```

## 5. 개발 수용 기준

A0-1은 아래 조건을 만족해야 완료로 본다.

- [x] 기존 3단계/6화면 진단 터널이 primary IA에서 제거되고 홈 피드 구조가 문서에 반영된다.
- [x] `home/status/rivals/write/settings`가 신규 primary menu로 정의된다.
- [x] 홈 카드 ④에 주간 검색어 레이더의 관심/대기/결과/실패/빈 결과 상태가 정의된다.
- [x] S8/S9가 별도 route가 아니라 홈 카드 상태임을 명시한다.
- [x] 결제 진입이 primary app surface에 없다.
- [x] 디자인 시스템은 `가게 성적표` 기준으로 정리하고 emoji 중심 UI를 제거한다.
- [x] Toss/Kakao/SMS 제외 결정은 `DECISION_LOG.md`에 기록한다.
- [x] `packages/keyword-pipeline`은 제품 소유 TypeScript 구현으로 완료 판단한다. 외부 JS 자료는 참고용이며 완료 기준은 현재 패키지 계약이다.
- [x] `radar_scans`, `radar_keywords`, `radar_feedback` 저장 구조와 주간 스캔 처리 경로가 구현된다.
- [x] 홈 카드 ④에서 레이더 관심/결과 상태와 `/write` 글감 진입이 연결된다.
- [x] 공개 `/terms`, `/privacy` 표면에서 결제대행 제3자 제공 문구가 제거된다.

## 6. 리스크와 선행 조건

| 리스크 | 영향 | 대응 |
| --- | --- | --- |
| 외부 자료 의존 전제 잔존 | A1-1 완료 판단이 불필요하게 막힘 | 제품 소유 TypeScript pipeline을 기준으로 검증하고 외부 JS 자료는 참고 자료로만 다룬다. |
| Toss/Kakao/SMS 제외 반영 누락 | 사용하지 않을 결제·알림 표면이 남음 | 앱 라우트와 문서에서 결제·알림 진입을 제거한다. |
| 기존 route deep link | 기존 사용자의 링크 깨짐 | redirect/alias를 유지하고 analytics로 사용량을 확인한다. |
| 과장된 실측 표현 | 신뢰/법무 리스크 | 추정/수집/실측 라벨을 구분하고 근거 sheet를 제공한다. |

## 7. 다음 작업 순서

1. [x] A0-2: Toss/Kakao/SMS 제외 결정을 `DECISION_LOG.md`에 반영한다.
2. [x] A0-3: `03-user-flow.md`, `06-screens.md`, `05-design-system.md`, `specs/screens/*.yaml`을 이 문서 기준으로 패치한다.
3. [x] A1-1: `packages/keyword-pipeline` 제품 소유 TypeScript 구현과 radar preview/weekly scan 연결을 검증한다.
4. [x] A2: radar DB migration과 weekly scan job을 추가한다.
5. [x] A3: 홈 카드 ④와 문안 진입 UI를 구현한다.
6. [x] A4: E2E와 pilot 검증은 현재 로컬 검증 범위에서 route/unit/HTTP surface QA로 대체 완료한다. 실제 사장님 pilot은 운영 단계 작업으로 남긴다.
