import "@ledgerhq/wallet-framework-test-setup";
import { killGoloop } from "./goloop";

export default async function globalTeardown(): Promise<void> {
  await killGoloop();
}
