// casperDevnet.ts transitively imports fixtures.ts, which resolves the "casper" currency at
// module load — the resolver bootstrap normally runs via setupFilesAfterEnv, which globalSetup
// runs before. Registering it here first keeps that import from crashing.
import "@ledgerhq/wallet-framework-test-setup";
import { spawnDevnet } from "./casperDevnet";

export default async function globalSetup(): Promise<void> {
  await spawnDevnet();
}
