import type { AleoStakingPosition } from "./react";

export type AleoUnbondingDisplayState = {
  isClaimable: boolean;
  isCountingDown: boolean;
  isSettling: boolean;
  blocksLeft: number | null;
};

/**
 * `syncedHeight` is `account.blockHeight` and decides claimability, because the bridge
 * validates the claim against the same height; `currentHeight` is the live poll and only
 * drives the countdown the user reads.
 */
export function getUnbondingDisplayState({
  position,
  syncedHeight,
  currentHeight,
}: {
  position: AleoStakingPosition;
  syncedHeight: number;
  currentHeight: number;
}): AleoUnbondingDisplayState {
  const { claimableBalance, unbondingHeight } = position;

  const isClaimable = claimableBalance.gt(0);
  const isCountingDown = !isClaimable && unbondingHeight !== null && unbondingHeight > syncedHeight;
  const blocksLeft = unbondingHeight !== null ? Math.max(0, unbondingHeight - currentHeight) : null;
  const isSettling = !isClaimable && blocksLeft === 0;

  return { isClaimable, isCountingDown, isSettling, blocksLeft };
}
