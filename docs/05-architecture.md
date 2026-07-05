# 05. 기술 아키텍처 — 크리에이터판 (새 레포) + 공유 계층

> 소상공인 모듈의 boina 내 통합은 04 문서 §5. 이 문서는 공유 패키지와 크리에이터판 신규 레포를 다룬다.

## 1. 스택 (boina와 의도적으로 동일 계열 — 엔진 호환·운영 지식 재사용)

| 계층 | 선택 | 비고 |
|------|------|------|
| 프레임워크 | Next.js App Router + TypeScript | boina와 동일 |
| 스타일 | Tailwind + 03 문서 토큰(CSS vars) | shadcn/ui 베이스 위 커스텀 |
| 성도 뷰 | PixiJS v8 + @pixi/react + pixi-filters + d3-force | 03 문서 C-08 오픈소스 표 참조 (전부 MIT). SSR 제외 — dynamic import(client only) |
| DB | Postgres (Supabase) + Drizzle | boina 컨벤션 계승 |
| 잡 | Vercel Cron → 잡 러너 route (단계별 청크) + Supabase 큐 테이블 | 초기 규모엔 전용 워커 불필요. 스캔 1회가 함수 타임아웃 넘으면 단계 분할 실행 |
| 결제 | 토스페이먼츠 빌링 | 소상공인 모듈과 코드 공유 목표 |
| LLM | Claude API (프로브·해석문). 엔진 llm-provider 라우터 경유 | 서킷브레이커·리트라이 기제공 |
| 메일 | Resend (주간 리포트·인용 알림·매직링크) | 발송 실패 로깅 + 재시도 1회 |
| 배포 | Vercel + GitHub Actions | |

**클러스터링(cluster_id) 산정 — v1 규칙 기반**: 확장 경로 그룹핑(같은 시드 토큰/같은 1차 hop 부모에서 파생 = 같은 클러스터) + 공통 명사 토큰 병합. 임베딩 클러스터링은 v2로 미룸(원가·복잡도) — `keywords.cluster_id`는 스캔 시 파이프라인이 부여하고, 성도 뷰의 각도 배치가 이를 소비한다.

## 2. 레포 구조

```
searchradar/                      # 새 레포
├── app/                          # Next.js App Router
│   ├── (marketing)/              # 랜딩 (정적)
│   ├── (app)/
│   │   ├── radar/                # S2 홈 (+S3 패널)
│   │   ├── diagnose/             # S4
│   │   ├── citations/            # S5
│   │   ├── reports/[week]/       # S6
│   │   ├── settings/             # S7
│   │   └── onboarding/           # S1
│   └── api/                      # §4 API
├── lib/
│   ├── scoring/                  # 이중 점수 산식 (순수 함수 — 유닛테스트 대상 1호)
│   ├── probe/                    # 인용 프로브 오케스트레이션 (질문 세트 생성→LLM→판정)
│   └── billing/
├── db/schema/                    # Drizzle (§3)
├── jobs/                         # scan.daily / probe.weekly / report.weekly
└── packages 소비: @boina/engine, @boina/contracts, @radar/keyword-pipeline
```

**공유 패키지 (boina 레포에서 발행 — 00 문서 §2)**
- `@boina/engine`, `@boina/contracts`: 기존 그대로 태그 발행
- `@radar/keyword-pipeline`: `사장님레이더-검증` 이식. export: `expand(seed, opts)`(시드 분해 폴백 내장), `collectSignals(keywords)`(블로그/데이터랩/검색광고), `naverScore(signals)`. **소상공인 모듈이 먼저 만들고 크리에이터판이 소비** (착수 순서와 일치).

## 3. DB 스키마 (Drizzle 의사 표기)

```
users            id, email, plan(free|starter|pro), created_at
billing          user_id, toss_billing_key, status(active|past_due|canceled), next_charge_at
topics           id, user_id, name, seed_tokens(text[]), channel_url?, created_at
scans            id, topic_id, trigger(auto|manual), status(queued|expanding|scoring|probing|done|failed)
                 stage_detail, started_at, finished_at        -- S2 스트리밍 진행표시의 원천
keywords         id, scan_id, text, cluster_id, freq, hop, via_token?
                 naver_score, naver_evidence(jsonb: volume, docs, saturation, trend7d)
                 ai_score?, ai_evidence(jsonb: probe_summary, cited_sources, blog_gap)
                 verdict(now|good|normal|watch)               -- SignalBadge 구간
probes           id, keyword_id?|article_id?, model, query_text, response_excerpt,
                 has_mention, has_url, cited_count, run_at    -- geo-validator 결과 착지
articles         id, user_id, url, title, diag_score?, diag_checklist(jsonb), tracked(bool)
citations        id, article_id, probe_id, kind(url|brand|phrase), excerpt, found_at
reports          id, user_id, week, payload(jsonb), emailed_at
lookups          id, user_id, keyword, naver_score, naver_evidence(jsonb),
                 ai_score?, ai_evidence?, created_at         -- 즉시 조회 (히스토리 5건 노출)
usage            user_id, period, scans_used, diags_used, lookups_used  -- 플랜 한도 집행
```

원칙: `*_evidence`를 jsonb로 원본 보존 — S3 "근거 블록"과 방법론 투명성의 데이터 기반. 점수 재산정(산식 튜닝) 시 원본에서 재계산 가능.

## 4. API 계약 (화면 비종속 리소스 지향)

```
POST /api/topics                     주제 생성 (+즉시 스캔 큐잉)
GET  /api/topics/:id/scans/latest    S2 데이터 (keywords 포함, ?cluster=&filter=)
POST /api/scans                      수동 스캔 {topicId} → 402 QUOTA_EXCEEDED 시 쿼터 안내
GET  /api/scans/:id/events           SSE — 첫 스캔 스트리밍 (stage + 발견 키워드 push)
GET  /api/keywords/:id               S3 상세 (evidence 전체)
POST /api/lookups                    {keyword} → 즉시 조회 (확장 없이 단건 신호 수집+점수, 10s 목표)
POST /api/lookups/:id/probe          AI 프로브 옵트인 실행 (비동기, 폴링)
POST /api/diagnoses                  {url} → 진단 실행 (@boina/engine runDiagnosisPipeline)
GET  /api/diagnoses/:id              폴링 (status, score, checklist)
POST /api/articles/:id/track         추적 등록 (플랜 한도 검사)
GET  /api/citations?since=           S5 타임라인
POST /api/billing/checkout          토스 빌링키 발급/첫 결제 진입
POST /api/billing/cancel            1클릭 해지, 다음 결제일까지 이용 가능
POST /api/billing/webhook           토스 웹훅 수신(서명 검증+멱등 처리)
GET  /api/billing/status            현재 플랜/결제 실패/유예 상태
```

- 에러 응답 통일: `{ success:false, code:"QUOTA_EXCEEDED", message }` — 코드는 enum, 화면 전용 문구는 프론트에서 매핑.
- 인증: Supabase Auth (이메일 매직링크 + 구글). 모든 /api/* 라우트 서버측 세션 검사 + 리소스 소유권 검사.
- 레이트리밋: 진단 POST 사용자당 1 concurrent, 수동 스캔 topic당 10분 쿨다운, 즉시 조회 분당 6회(플랜 한도와 별개의 남용 가드).
- 탈퇴: `DELETE /api/me` — 30일 유예 소프트 삭제 후 하드 삭제(개인정보·프로브 응답 원문 포함). 결제 활성 상태면 해지 선행 강제. S7 설정에 노출.
- 결제 상태 전이는 웹훅을 기준으로만 확정한다. 프론트 redirect 성공은 UI 힌트일 뿐이며, DB 반영은 서명 검증된 웹훅과 멱등 키로 처리한다.

## 5. 파이프라인 실행 설계 (핵심 시퀀스)

**일일 스캔 잡 (topic당)**
```
expand(seed)                    ~30 콜, 5s      ┐ stage: expanding
collectSignals(top 30)          블로그+데이터랩    │ stage: scoring   → naver_score 확정, 화면 노출 가능
naverScore → keywords upsert                    ┘
probeQueue push (top 10만)      AI 프로브는 비싸므로 상위만  → stage: probing (비동기 후행)
aiScore 도착 시 keywords update                    → S2 카드의 "측정 대기"가 채워지는 순간
```
- **네이버 점수 먼저 노출, AI 점수 후행 채움** — 3분 대기를 없애는 2단 제공이 UX와 원가 모두의 답.
- 쿼터 가드: 데이터랩 일 1,000콜 — topic당 예산 배정, 소진 시 신호 수집 생략하고 확장 결과만(부분 결과 명시).

**주간 프로브 잡 (추적 글)**: 글당 질문 12종 × 모델 2종 = 24콜. 프로 20글 상한 → 사용자당 주 480콜 상한. 원가 상한: 사용자당 월 ~2,000원 (프로 24,900 대비 8%). 질문 세트는 topic 키워드에서 생성하고 버전 기록(방법론 투명성).

## 6. 보안·운영 체크리스트

- [ ] 크롤 대상 URL SSRF 가드 (사설 IP 차단 — 엔진 crawler 옵션 확인)
- [ ] 토스 웹훅 서명 검증, 결제 상태는 웹훅만 신뢰
- [ ] 토스 웹훅 멱등 처리(`paymentKey`/이벤트 ID 중복 방지), 실패 유예 3일, 무료 플랜 강등 정책 검증
- [ ] 해지/환불 정책 문구와 실제 결제 상태 전이 일치
- [ ] LLM 프로브 응답 원문 저장 시 개인정보 스크럽
- [ ] 네이버 API 키 서버 전용 (Edge 노출 금지), 채널별 키 분리
- [ ] Sentry + 잡 실패 알림 (스캔 실패율 5% 초과 시 경보)
