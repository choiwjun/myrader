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
| `engine_result` | 엔진 분석 결과 (SEO/AEO/GEO·네이버·구글·AI 인용 준비/실측 evidence) | workspace `@boina/*` 스키마 |
| `competitor` | 비교 대상 경쟁사 | x-sag competitor 차용 (REQ-003) |
| `gap_row` | 역공학 갭 한 줄 (경쟁사 보유 vs 내 갭) | x-sag GapAnalyzer 차용 (REQ-004) |
| `prescription_snippet` | 생성물 (스니펫/소개글/리뷰문구/처방전 이메일) | x-sag snippet 차용 (REQ-006) |
| `action_completion` | 행동 완료 기록 (4분류·"오늘 딱 하나" 실행 추적) | 신규 (REQ-005·성공지표) |
| `radar_subscription` / `radar_scan` / `radar_keyword` / `radar_feedback` | 주간 키워드 레이더 구독·스캔·키워드·피드백 | SME Radar 모듈 |

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
| `engine_result` | id, diagnosis_id, channel(`naver`/`google`/`ai_citation`), category, code, evidence, impact_score(내부) | UI/API display channel은 service layer에서 `naver`/`google`/`ai`로 변환. SNS는 v1 채널 아님 |
| `competitor` | id, diagnosis_id, name, place_id, 노출 우위 여부 | REQ-003 손실 프레이밍 |
| `gap_row` | id, competitor_id, 항목, 경쟁사_보유(bool), 내_갭(bool), 설명 | REQ-004 매트릭스 한 줄 |
| `prescription_snippet` | id, diagnosis_id, kind(snippet/place_intro/review_request/prescription_email), content, action_class(🟢🟡🔴⏳) | REQ-006 |
| `action_completion` | id, diagnosis_id, action_ref, action_class, is_today_one(bool), completed_at | REQ-005 + 성공지표(행동 실행률) |

## 4. 차용 명시

- `diagnosis` / `engine_result` / `competitor` / `gap_row` / `prescription_snippet`의 형태는 현재 모노레포 workspace 패키지(`packages/db`, `packages/contracts`)를 정본으로 삼는다.
- OQ-6은 현재 SME v1 기준 workspace-only 패키지 사용으로 해소되었고, 외부 package release/GitHub Packages 발행은 미래 Creator/별도 레포 단계로 유예한다.
- 신규/제품 고유 엔티티(`account`, `business`, `action`, `radar_*`)는 현재 Drizzle schema와 마이그레이션을 기준으로 문서를 맞춘다.

---

## Loop Metadata

- **Upstream docs**: 01-prd.md(REQ), 02-trd.md(엔진 재사용·Postgres/Drizzle·잡 상태)
- **Downstream docs**: 07-coding-convention.md(UUID·리소스 명명), 06-screens.md(화면이 읽는 데이터), tasks-generator
- **Open questions**: OQ-2(REQ-007 재진단 포함 시 추이 이력 테이블 필요 여부), OQ-4(구글 실 SERP/AI Overview rank).
- **Assumptions**: workspace `packages/db`/`packages/contracts`를 현재 SME v1 정본으로 사용 / 식별자는 UUID(07 헌법) / 점수는 내부 저장·화면 미노출 / display channel은 `naver/google/ai`.
- **Validation criteria**: 한 번의 진단이 diagnosis→engine_result→competitor→gap_row→generated_asset→action까지 일관되게 기록된다 / 화면(Home/Status/Rivals/Write)이 본 모델만으로 렌더 가능 / Radar subscription→scan→keyword→feedback이 credential absence를 honest unavailable로 처리한다.
- **Risks**: 재진단 추이(OQ-2) 미정으로 이력 모델 후순위 / 점수 저장값이 화면에 새어나가 정직성 규율 위반 / future SNS channel을 v1 display channel과 혼동하는 문서 드리프트
