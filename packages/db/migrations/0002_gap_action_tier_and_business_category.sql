-- @TASK 감사수정 #1·#4 - gap_rows.action_tier + businesses.category (DB 스키마 변경 승인됨)
-- @SPEC apps/web/lib/diagnosis/gap-service.ts (deriveGapViewFromPersisted — actionTier 보존)
-- @SPEC apps/web/lib/business/business-service.ts (S7 설정 업종 확인/수정)
--
-- 배경(감사 확정 버그):
--   #1 4분류(🟢🟡🔴⏳) 런타임 붕괴: gap_rows 에 action_tier 컬럼이 없어 읽기 경로가 모든
--      행동을 self_fix(→green_self)로 하드코딩 → 🟡복붙·🔴업체·⏳꾸준히 카드가 사라졌다.
--      action_tier 를 영속화해 영속화→읽기 왕복에서 tier 를 보존한다(S4 갭 배지·S5 4분류 정상화).
--   #4 S7 설정 업종 누락: businesses 에 category 가 없어 사장님이 업종을 확인/수정 못 했다.
--      자유 텍스트 category 컬럼을 추가한다(엔진 category enum 과 무관 — seo/aeo/geo enum 금지).
--
-- 이 파일은 기존 docker DB(0000+0001 적용 완료) 용 idempotent ALTER 다(drizzle-kit journal 없음 —
-- psql 로 직접 적용). clean DB 는 0000_init.sql 이 이미 두 변경을 처음부터 반영한다.
-- IF NOT EXISTS / EXCEPTION 가드로 재실행해도 안전(no-op).

-- #1: gap_action_tier enum 타입(중복이면 무시) + gap_rows.action_tier 컬럼.
DO $$ BEGIN
	CREATE TYPE "gap_action_tier" AS ENUM('self_fix', 'snippet', 'vendor', 'ongoing');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "gap_rows" ADD COLUMN IF NOT EXISTS "action_tier" "gap_action_tier" NOT NULL DEFAULT 'self_fix';

-- #4: businesses.category(자유 텍스트 — 네이버 후보 업종 문자열).
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "category" text;
