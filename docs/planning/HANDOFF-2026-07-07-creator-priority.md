# Handoff — 2026-07-07 Creator 우선순위 전환

## 현재 결정

- 소상공인 SME v1의 남은 production smoke, AC-7 이해도 검증, 실가게 파일럿은 보류한다.
- 현재 우선순위는 Creator 제품이다.
- Creator도 같은 `@boina/engine` / `@boina/contracts` / `@radar/keyword-pipeline` 기반으로 만든다.
- 추후 공통 버그는 제품별 화면에서 우회하지 말고 엔진/공유 패키지에서 수정한다.

## 완료된 작업

### B0-1 Creator 선행조건

완료 범위:

- `@boina/contracts`, `@boina/engine`, `@radar/keyword-pipeline` dist build 추가
- publish용 `dist/package.json` 생성 스크립트 추가
- workspace dependency를 publish version으로 재작성
- `PACKAGE_VERSION` override 지원
- engine 외부 subpath exports 확장
- GitHub Packages release workflow 추가
  - tag: `packages-vX.Y.Z`
  - 수동 실행: `workflow_dispatch` version 입력
- `docs/06-tasks.md`의 Creator critical path를 현재 우선순위로 갱신
- 기존 SME handoff 문서는 운영 검증 보류 상태로 갱신

검증 완료:

- `bun run packages:pack:dry-run`
- `PACKAGE_VERSION=0.1.2 bun run packages:prepare-publish`
- packed install 후 dist import smoke
- `bun run typecheck`
- `bun run lint`
- `bun run --filter '@radar/keyword-pipeline' test`
- `bunx vitest run tests/smoke.workspace.test.ts tests/keyword-pipeline.workspace.test.ts`
- `bunx vitest run tests/docs-scope.workspace.test.ts`

## 다음 작업

1. B0-2 Creator 레포 부트스트랩
   - Next
   - Tailwind
   - Drizzle
   - Supabase
   - CI

2. B0-3 디자인 토큰 + 컴포넌트 셸
   - `docs/03-creator-design-system.md` 기준
   - C-01~C-07 기본 컴포넌트

3. B1-1 Creator DB 스키마
   - `docs/05-architecture.md`, `docs/02-creator-screens.md` 기준

4. B1-2 이중 점수 산식
   - 근거 jsonb 왕복 포함
   - 순수 함수 + 유닛 테스트 우선

5. B1-3 일일 스캔 잡
   - 네이버 선노출
   - AI 후행
   - SSE 진행 스트리밍
   - 비용/쿼터 가드

## 보류 작업

- SME production credential smoke
- SME AC-7 사장님 이해도 테스트
- SME 실가게 파일럿
- Toss 결제/구독
- Kakao/SMS 알림

## 릴리스 메모

GitHub Packages publish는 다음 둘 중 하나로 실행한다.

- 태그 push: `packages-vX.Y.Z`
- GitHub Actions 수동 실행: `Publish reusable packages` workflow + `version=X.Y.Z`

기본 토큰은 `GITHUB_TOKEN`이다. scope/권한 문제가 있으면 `PACKAGES_TOKEN` secret을 추가한다.
