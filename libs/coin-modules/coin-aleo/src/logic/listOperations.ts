import type { Operation } from "@ledgerhq/coin-framework/api/types";
// import network from "@ledgerhq/live-network";

export const MOCKED_WALLET_ADDRESS =
  "aleo1zcwqycj02lccfuu57dzjhva7w5dpzc7pngl0sxjhp58t6vlnnqxs6lnp6f";

// const fetch = <Result>(path: string) => {
//   return network<Result>({
//     method: "GET",
//     url: `https://api.explorer.provable.com/v2/mainnet/${path}`,
//   });
// };

export async function listOperations(
  _address: string,
  _pagination: unknown,
): Promise<[Operation[], string]> {
  // eslint-disable-next-line no-console
  console.log("LIST OPERATIONS FIRED", MOCKED_WALLET_ADDRESS);
  return [[], ""];
  // throw new Error("TODO: not implemented");
}
