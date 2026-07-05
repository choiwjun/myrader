# @boina/engine

boina 분석 엔진. x-sag `core-engine` 을 **복사 후 독립 패키지화**한 결과물이다.
크롤·파서·analyzers(SEO/AEO/GEO/A11y/Backlink/Perf)·scoring·classification·recommendation·
platform-presence(네이버 노출 실측)·snippets(생성물)·v2(gap/competitor/serp/geo-validator/
aeo-validator/nlp/llm-provider/backlink/a11y/perf/js-render/rule-validator) 를 포함한다.

엔진은 순수·재사용 레이어이며 상위(앱·UI)를 모른다. 모든 입출력은 `@boina/contracts`
타입 경계를 통과한다.

---

## ADR-001: x-sag 엔진 통합 방식 — "복사 후 독립 패키지화" (OQ-6 해소)

- **상태**: 확정 (DECISION_LOG.md, 2026-06). 06-tasks 의 `[OPEN OQ-6]` 은 본 결정으로 해소됨.
- **맥락**: boina 는 x-sag 분석 엔진을 재사용한다. 재사용 방식으로 (A) x-sag 패키지를
  외부 의존성으로 `import`, (B) 소스를 boina 모노레포로 **복사 후 독립화** 가 후보였다.
- **결정**: **(B) 복사 후 독립 패키지화**. x-sag `packages/core-engine` 와 `packages/contracts`
  의 `src/**` 를 boina `packages/engine/src/` · `packages/contracts/src/` 로 복사하고,
  네임스페이스를 `@x-sag/core-engine` → `@boina/engine`, `@x-sag/contracts` → `@boina/contracts`
  로 전수 치환해 boina 가 단일 소유권을 갖는 독립 패키지로 만들었다.
- **근거**:
  - boina 는 x-sag 와 별도 제품·별도 레포로 진화한다 → 외부 레포 결합(import)은 버전·릴리스
    커플링을 만든다.
  - 엔진을 모노레포 내부에 두면 boina 의 typecheck/test/CI 가 엔진을 1급으로 검증한다.
  - x-sag 원본은 **읽기 전용**(절대 수정 금지). 복사 소스로만 사용했다.
- **대안 기각**: (A) import — 외부 레포 의존·버전 동기화 부담, 모노레포 단일 검증 이점 상실.

### 복사 범위
- 포함: `src/**` 전체 (analyzers, platform-presence, recommendation, snippets, utils, v2,
  crawler/parser/pipeline/scoring/classification/report-generator 등) + `__tests__`(엔진 검증용).
- 제외: `node_modules`, `dist`, `*.tsbuildinfo`.
- 복사 파일 수: contracts 26, engine 249 (src 기준).

---

## ADR-002: 경계 규칙 (07 §2 / §6)

- **앱↔엔진 입출력은 `@boina/contracts` 타입으로만 흐른다.** 앱은 엔진 내부 파일을 직접
  import 하지 않는다. 엔진 공개 표면은 이 패키지의 배럴(`src/index.ts`)과 `package.json`
  `exports`(`.`, `./snippets/index`, `./v2/serp`, `./v2/competitor`, `./v2/perf`)뿐이다.
- 엔진 내부 구현(analyzers/recommendation/v2 providers 등)은 배럴 export 경계 **뒤**에 둔다.
- `contracts` 데이터 계약 변경은 **additive optional 만** 허용한다 (07 §6, 어댑터/contracts
  additive-only).

## ADR-003: 점수 비노출 (07 §4)

- 엔진이 산출하는 **점수(score)는 내부 신호**다. `scoreDiagnosis` / `SCORING_VERSION` 등은
  엔진 내부·전달 레이어용이며, **UI 직접 노출 금지**.
- 사용자 노출 시에는 상위(UI 전달 레이어)에서 점수를 **신호등(양호/주의/위험)** 으로
  변환해 표현한다. 엔진은 신호등 변환을 책임지지 않는다.

## ADR-004: 옵셔널 peerDependencies

- `playwright`(JS 렌더), `axe-core`(A11y 정밀), `jsdom` 은 **optional peerDependencies** 다.
  미설치 시 엔진은 mock/unavailable provider 로 폴백한다 (런타임 선택적).
- 단, **typecheck** 가 해당 어댑터 파일의 타입을 해석할 수 있도록 동일 패키지를
  `devDependencies` 로도 둔다 (x-sag 와 동일한 컴파일 계약). 런타임 필수 의존이 아니다.

## ADR-005: 벤더링된 엔진 소스의 lint 범위

- 복사된 `packages/engine/src` · `packages/contracts/src` 는 x-sag 상위 포매터(Biome v2, 탭
  들여쓰기)로 작성됐다. boina 루트 Biome(v1.9, 2-space)로 **재포맷하면 x-sag 원본과 대규모
  diff** 가 발생하고 미세 변경 위험이 있다.
- 따라서 벤더링된 엔진 내부 소스는 루트 `biome.json` `ignore` 에 넣어 **lint 범위에서 제외**한다
  (배럴 경계 뒤의 vendored 코드). boina 가 작성한 배럴 배선·앱·테스트 코드는 정상 lint 대상이다.
- 검증은 **`bun run typecheck`(strict, 전 패키지 exit 0)** 와 **`bun run test`(엔진 `__tests__`
  포함)** 로 보장한다.

---

## Public API (배럴)

`src/index.ts` 에서 re-export. 주요 진입점:

- `runDiagnosisPipeline` — 진단 파이프라인 통합 진입점
- `crawlSite` / `parseHtml` / `fetchSitemap` — 크롤·파서
- `analyzePage` / `analyzeSEO` / `analyzeAEO` / `analyzeGEO` — 분석기
- `scoreDiagnosis` / `scoreToGrade` / `scoreToHealthBand` / `SCORING_VERSION` — 스코어링(내부 신호)
- `classifyResults` — 결과 분류
- `RecommendationEngine` 및 provider 군 — 추천
- `fetchPlatformPresence` 등 — 플랫폼 노출(네이버 실측)
- 서브경로: `@boina/engine/v2/serp`, `@boina/engine/v2/competitor`, `@boina/engine/v2/perf`,
  `@boina/engine/snippets/index`

## 의존성

- runtime: `@boina/contracts`(workspace), `cheerio`, `robots-parser`, `undici`, `zod`
- optional peer: `playwright`, `axe-core`, `jsdom`
