// @TASK P0-T1 - PostCSS 설정 (Tailwind v4)
// @SPEC .claude/constitutions/tailwind/v4-syntax.md
// v4 는 @tailwindcss/postcss 플러그인 사용 (tailwind.config.js 불필요)
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
