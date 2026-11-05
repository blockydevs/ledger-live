import { killRippled } from "./rippled";

export default async function globalTeardown(): Promise<void> {
  await killRippled();
}
