import type { Config } from "jest";

const base = {
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
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
};

const config: Config = {
  reporters: ["default", ...(process.env.CI ? ["github-actions"] : [])],
  // devnet.test.ts and scenarii.test.ts share one devnet booted by globalSetup;
  // running them concurrently would race user 0's balance between the two files.
  maxWorkers: 1,
  projects: [
    {
      ...base,
      displayName: "unit",
      testMatch: ["<rootDir>/src/signer.test.ts"],
    },
    {
      ...base,
      displayName: "devnet",
      testMatch: ["<rootDir>/src/devnet.test.ts", "<rootDir>/src/scenarii.test.ts"],
      globalSetup: "<rootDir>/src/globalSetup.ts",
      globalTeardown: "<rootDir>/src/globalTeardown.ts",
    },
  ],
};

export default config;
