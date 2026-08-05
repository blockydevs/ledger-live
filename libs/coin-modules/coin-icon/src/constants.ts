export const ICON_DUMMY_ADDRESS = "hxd3f4224ffb2cfd354f8db2eef39e12aadb7a4ebb";
export const GOVERNANCE_SCORE_ADDRESS = "cx0000000000000000000000000000000000000001";
export const IISS_SCORE_ADDRESS = "cx0000000000000000000000000000000000000000";
export const LIMIT = 100;
export const BERLIN_TESTNET_NID = 7;
export const MAINNET_NID = 1;
export const I_SCORE_UNIT = 1000;
export const RPC_VERSION = 3;
// A plain ICX transfer's step cost under the default fee table, so this
// fallback covers a real transfer even when the node's own estimate is
// zero or unavailable. A value below the real transfer cost lets the
// transaction land on-chain but run out of steps and revert.
export const DEFAULT_STEP_LIMIT = 1_000_000;

export const PREP_TYPE = {
  MAIN: "Main P-Rep",
  SUB: "Sub P-Rep",
  CANDIDATE: "Candidate",
};
