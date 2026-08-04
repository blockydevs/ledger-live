import type { Config } from "jest";

// The `@ledgerhq/source` export condition resolves workspace @ledgerhq/*
// packages — notably @ledgerhq/coin-icon — from their TypeScript source, so
// this tester runs the coin module's current source without a prior build of
// lib/.
const config: Config = {
  testEnvironment: "node",
  setupFilesAfterEnv: ["@ledgerhq/wallet-framework-test-setup"],
  testEnvironmentOptions: {
    customExportConditions: ["@ledgerhq/source", "node", "require", "default"],
  },
  transform: {
    "^.+\\.(t|j)sx?$": ["@swc/jest", { jsc: { target: "esnext" } }],
  },
  // @ledgerhq packages resolve to their TS source, so swc must transform them
  // even inside node_modules.
  transformIgnorePatterns: ["/node_modules/.pnpm/(?!@ledgerhq\\+)"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  // @ledgerhq sources use ESM ".js" specifiers on ".ts" files.
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  testMatch: ["**/?(*.)+(spec|test).[jt]s?(x)"],
  reporters: ["default", ...(process.env.CI ? ["github-actions"] : [])],
  globalSetup: "<rootDir>/src/globalSetup.ts",
  globalTeardown: "<rootDir>/src/globalTeardown.ts",
};

export default config;
