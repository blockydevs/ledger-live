import type { Config } from "jest";

// Shaped like the sibling coin-testers (e.g. coin-tester-cosmos). The load-bearing option is the
// `@ledgerhq/source` export condition: it resolves workspace @ledgerhq/* packages — notably
// @ledgerhq/coin-hedera and @ledgerhq/live-common — from their TypeScript SOURCE, so this tester
// exercises current source without a prior `pnpm build` of lib/.
const config: Config = {
  testEnvironment: "node",
  setupFilesAfterEnv: ["@ledgerhq/wallet-framework-test-setup"],
  testEnvironmentOptions: {
    customExportConditions: ["@ledgerhq/source", "node", "require", "default"],
  },
  transform: {
    "^.+\\.(t|j)sx?$": [
      "@swc/jest",
      {
        jsc: {
          target: "esnext",
        },
      },
    ],
  },
  // @ledgerhq packages resolve to their TS source (via the condition above), so swc must transform
  // them even inside node_modules; everything else there stays ignored.
  transformIgnorePatterns: ["/node_modules/.pnpm/(?!@ledgerhq\\+)"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  // @ledgerhq sources use ESM ".js" specifiers on ".ts" files; strip the extension so jest resolves
  // the TypeScript source.
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  testMatch: ["**/?(*.)+(spec|test).[jt]s?(x)"],
  reporters: ["default", ...(process.env.CI ? ["github-actions"] : [])],
};

export default config;
