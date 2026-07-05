-- @TASK 회원 관리(차단·세션 무효화) - accounts.blocked_at + accounts.sessions_revoked_at
-- @SPEC packages/db/src/schema/account.ts (accounts 테이블)
--
-- 배경(회원 관리 기능):
--   blocked_at        : 차단 시각(설정되면 차단 상태, 해제 = null). 차단 회원 필터용 인덱스 동반.
--   sessions_revoked_at: 강제 로그아웃 기준 시각 — 이 시각 이전 발급된 세션 토큰을 거부. null이면 미적용.
--
-- 이 파일은 기존 docker DB(0000+0001+0002 적용 완료) 용 idempotent ALTER 다(drizzle-kit journal 없음 —
-- psql 로 직접 적용). IF NOT EXISTS 가드로 재실행해도 안전(no-op).

ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "blocked_at" timestamp with time zone;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "sessions_revoked_at" timestamp with time zone;
CREATE INDEX IF NOT EXISTS "accounts_blocked_at_idx" ON "accounts" ("blocked_at");
