/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  testEnvironmentOptions: {
    customExportConditions: ["@ledgerhq/source"],
  },
  testRegex: ".integ.test.ts$",
  testPathIgnorePatterns: ["lib/", "lib-es/"],
  testTimeout: 90_000,
  forceExit: true,
  // @ledgerhq packages resolve to their TS source (via the condition above), so
  // swc must transform them even inside node_modules; everything else there
  // stays ignored.
  transformIgnorePatterns: ["/node_modules/.pnpm/(?!@ledgerhq\\+)"],
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
};
