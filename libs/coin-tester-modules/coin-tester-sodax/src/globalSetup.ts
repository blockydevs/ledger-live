import "@ledgerhq/wallet-framework-test-setup";
import { spawnGoloop } from "./goloop";

export default async function globalSetup(): Promise<void> {
  await spawnGoloop();
}
