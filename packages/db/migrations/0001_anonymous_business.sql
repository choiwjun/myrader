-- @TASK Phase2 - businesses.account_id NULLABLE (익명 진단 허용)
-- @SPEC docs/planning/01-prd.md#AC-1 (이름 한 칸으로 진단 시작 — 미인증)
-- @SPEC docs/planning/03-user-flow.md (S1 auth:false — 진단 시작은 익명)
--
-- [통합·no-op] 수정라운드A-4(출시차단 완화): account_id nullable 화는 이제 0000_init.sql
-- 이 *처음부터* 반영한다(clean DB 에 0000 만 적용해도 익명 동작). 이 0001 은 하위호환을
-- 위한 *idempotent no-op* 으로 남긴다 — DECISION_LOG 가 이 파일명을 참조하고, 과거 0000
-- (account_id NOT NULL)을 이미 적용한 DB(예: docker)도 이 문장으로 정합을 맞추기 위함이다.
--
-- ALTER ... DROP NOT NULL 은 이미 nullable 인 컬럼에 대해 에러 없이 no-op 이다(Postgres).
-- 따라서 clean DB(새 0000 = nullable)에 적용해도 무해하고, 구 DB(NOT NULL)에 적용하면 교정된다.
-- account_id 외 다른 컬럼/테이블 구조 변경 없음(발명 금지).

ALTER TABLE "businesses" ALTER COLUMN "account_id" DROP NOT NULL;
