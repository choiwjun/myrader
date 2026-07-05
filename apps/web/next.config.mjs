// @TASK P0-T1 - Next.js 설정
// @SPEC docs/planning/02-trd.md#1-아키텍처-개요
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // workspace 패키지를 TS 소스 그대로 트랜스파일한다.
  // 모든 @boina/* 패키지는 빌드 산출물 없이 src/*.ts 를 직접 export 하고
  // NodeNext/Bundler 관례상 상대 import 에 .js 확장자를 쓰므로(예: ./queue/index.js),
  // webpack 이 .js → .ts 로 해석하도록 전부 transpilePackages 에 포함한다.
  // (@boina/jobs·@boina/db 누락 시 ./queue/index.js·./gating/index.js Module not found)
  transpilePackages: ["@boina/engine", "@boina/contracts", "@boina/db", "@boina/jobs"],
  // 확장자 전략 통일: 워크스페이스 패키지는 NodeNext/Bundler 관례상 상대 import 에
  // .js 확장자를 쓰지만(예: export * from "./queue/index.js") 실제 파일은 .ts 다.
  // tsc(Bundler)·vitest(esbuild)는 .js→.ts 를 자동 해석하나 webpack 은 하지 않아
  // "Module not found: Can't resolve './queue/index.js'" 가 난다. extensionAlias 로
  // webpack 도 .js 요청을 .ts/.tsx 소스로 매핑해 세 도구의 해석 전략을 통일한다.
  webpack: (config, { isServer }) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };
    // P1-R2: 엔진 크롤러가 의존하는 Playwright 류는 server-only 네이티브 모듈이라
    // 웹팩 번들 대상이 아니다(optional peer chromium-bidi 가 번들 시 Module-not-found).
    // 서버 빌드에선 commonjs external 로 두어 런타임 require 로 해석한다(잡 워커=Node).
    // 클라이언트 빌드에선 절대 도달하지 않지만 방어적으로 false 처리한다.
    const playwrightExternals = ["playwright", "playwright-core", "chromium-bidi"];
    if (isServer) {
      const existing = config.externals ?? [];
      config.externals = [
        ...(Array.isArray(existing) ? existing : [existing]),
        ({ request }, callback) => {
          if (
            request &&
            playwrightExternals.some((p) => request === p || request.startsWith(`${p}/`))
          ) {
            return callback(null, `commonjs ${request}`);
          }
          return callback();
        },
      ];
    } else {
      config.resolve.alias = {
        ...(config.resolve.alias ?? {}),
        playwright: false,
        "playwright-core": false,
        "chromium-bidi": false,
      };
    }
    return config;
  },
};

export default nextConfig;
