# 04-Database Design — 경량 개념 모델 (x-sag diagnosis 스키마 차용)

> 목적: 진단부터 행동까지의 흐름을 담는 경량 개념 데이터 모델을 정의한다. x-sag `packages/contracts`의 diagnosis 스키마를 차용하여 맨바닥에서 짓지 않는다.

> ⚠️ 본 문서는 **개념 모델**이다. 물리 컬럼·인덱스·마이그레이션은 구현 단계(Drizzle)에서 확정. 식별자 정책은 07-coding-convention(헌법: UUID) 참조.

---

## 1. 엔티티 개요

| 엔티티 | 설명 | 출처 |
|--------|------|------|
| `user` | 사장님(셀프서비스 사용자) | 신규 (단일 인증, 07 참조) |
| `business` | 진단 대상 내 가게 (네이버 플레이스로 식별) | 신규 (REQ-001) |
| `diagnosis` | 1회 진단 세션 (잡 상태 포함) | **x-sag diagnosis 스키마 차용** |
| `engine_result` | 엔진 분석 결과 (SEO/AEO/GEO·네이버·구글·AI 인용) | **x-sag contracts 차용** |
| `competitor` | 비교 대상 경쟁사 | x-sag competitor 차용 (REQ-003) |
| `gap_row` | 역공학 갭 한 줄 (경쟁사 보유 vs 내 갭) | x-sag GapAnalyzer 차용 (REQ-004) |
| `prescription_snippet` | 생성물 (스니펫/소개글/리뷰문구/처방전 이메일) | x-sag snippet 차용 (REQ-006) |
| `action_completion` | 행동 완료 기록 (4분류·"오늘 딱 하나" 실행 추적) | 신규 (REQ-005·성공지표) |

## 2. 관계 (개념 ERD)

```
user 1───* business 1───* diagnosis 1───* engine_result
                               │
                               ├───* competitor 1───* gap_row
                               ├───* prescription_snippet
                               └───* action_completion
```

## 3. 엔티티별 핵심 필드 (개념 수준)

| 엔티티 | 핵심 필드(개념) | 비고 |
|--------|-----------------|------|
| `user` | id, 식별/연락 정보 | 단일 인증 (07) |
| `business` | id, user_id, name, region, place_id(네이버), homepage_url(선택) | REQ-001, URL은 nullable |
| `diagnosis` | id, business_id, status(pending/running/done/failed), 요약(신호등·한 줄), created_at | 잡 상태 = 02-trd 백그라운드 잡 |
| `engine_result` | id, diagnosis_id, channel(naver/google/ai_citation), seo/aeo/geo 결과, 노출 실측값 | 점수는 저장하되 화면엔 신호등으로 변환(05) |
| `competitor` | id, diagnosis_id, name, place_id, 노출 우위 여부 | REQ-003 손실 프레이밍 |
| `gap_row` | id, competitor_id, 항목, 경쟁사_보유(bool), 내_갭(bool), 설명 | REQ-004 매트릭스 한 줄 |
| `prescription_snippet` | id, diagnosis_id, kind(snippet/place_intro/review_request/prescription_email), content, action_class(🟢🟡🔴⏳) | REQ-006 |
| `action_completion` | id, diagnosis_id, action_ref, action_class, is_today_one(bool), completed_at | REQ-005 + 성공지표(행동 실행률) |

## 4. 차용 명시

- `diagnosis` / `engine_result` / `competitor` / `gap_row` / `prescription_snippet`의 **스키마 형태와 타입은 x-sag `packages/contracts`를 차용**한다.
- 차용 방식(그대로 import vs 추출/복사)은 **[OPEN] OQ-6** (02-trd·07 참조). 결정 전까지 본 모델은 contracts 타입과 1:1 매핑됨을 전제로 한다.
- 신규 엔티티(`user`, `business`, `action_completion`)만 본 제품 고유 설계.

---

## Loop Metadata

- **Upstream docs**: 01-prd.md(REQ), 02-trd.md(엔진 재사용·Postgres/Drizzle·잡 상태)
- **Downstream docs**: 07-coding-convention.md(UUID·리소스 명명), 06-screens.md(화면이 읽는 데이터), tasks-generator
- **Open questions**: OQ-6(엔진/contracts 재사용 방식 — import vs 추출), OQ-2(REQ-007 재진단 포함 시 추이 이력 테이블 필요 여부)
- **Assumptions**: x-sag contracts의 diagnosis 타입을 그대로 매핑 가능 / 식별자는 UUID(07 헌법) / 점수는 내부 저장·화면 미노출
- **Validation criteria**: 한 번의 진단이 diagnosis→engine_result→competitor→gap_row→snippet→action_completion까지 일관되게 기록된다 / 화면 4종(S2~S6)이 본 모델만으로 렌더 가능
- **Risks**: x-sag contracts 변경 시 모델 드리프트(OQ-6 미결정 시 심화) / 재진단 추이(OQ-2) 미정으로 이력 모델 후순위 / 점수 저장값이 화면에 새어나가 정직성 규율 위반
