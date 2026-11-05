import { killRippled, spawnRippled } from "./rippled";

function cleanup(): Promise<void> {
  return killRippled().catch(() => {});
}

export default async function globalSetup(): Promise<void> {
  await killRippled();

  process.once("SIGINT", cleanup);
  process.once("SIGTERM", cleanup);

  try {
    await spawnRippled();
  } catch (error) {
    // A failed globalSetup skips globalTeardown.
    await cleanup();
    throw error;
  }
}
