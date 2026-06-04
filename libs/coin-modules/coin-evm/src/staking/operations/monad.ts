import type { OperationParamsMonad, StakingProtocol } from "./types";

const monadProtocol: StakingProtocol<OperationParamsMonad> = {
  delegate: ({ valId }) => [BigInt(valId)],
  claimReward: ({ valId }) => [BigInt(valId)],
  undelegate: ({ valId, amount, withdrawId }) => {
    if (withdrawId === undefined) {
      throw new Error("monad undelegate requires withdrawId");
    }
    return [BigInt(valId), amount, BigInt(withdrawId)];
  },
};

export default monadProtocol;
