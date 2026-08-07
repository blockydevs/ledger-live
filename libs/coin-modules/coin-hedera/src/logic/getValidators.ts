import type { Cursor, Page, Validator } from "@ledgerhq/coin-module-framework/api/types";
import type { HederaCoinConfig } from "../config";
import type { HederaMirrorNode } from "../types";
import { apiClient } from "../network/api";
import { calculateAPY, extractCompanyFromNodeDescription } from "./utils";

// The generic framework `Validator` has no node-identity field: `address` alone (the node's
// account id, e.g. "0.0.3") doesn't carry the raw node id that staking intents key off. Widen
// the returned item with `nodeId` rather than have every consumer cast to read it.
export type ValidatorWithNodeId = Validator & { nodeId: string };

function toValidator(node: HederaMirrorNode): ValidatorWithNodeId {
  return {
    id: node.node_id.toString(),
    address: node.node_account_id,
    nodeId: node.node_id.toString(),
    name: extractCompanyFromNodeDescription(node.description),
    description: node.description,
    balance: BigInt(node.stake),
    apy: calculateAPY(node.reward_rate_start),
  };
}

export async function getValidators({
  configOrCurrencyId,
  cursor,
}: {
  configOrCurrencyId: HederaCoinConfig | string;
  cursor: Cursor | undefined;
}): Promise<Page<ValidatorWithNodeId>> {
  const res = await apiClient.getNodes({
    configOrCurrencyId,
    fetchAllPages: false,
    ...(cursor && { cursor }),
  });

  return {
    next: res.nextCursor ?? undefined,
    items: res.nodes.map(toValidator),
  };
}

/**
 * The whole node set, across every mirror-node page. Callers that must decide whether a node
 * id exists need the same list the UI offers, which is built from all pages.
 */
export async function getAllValidators({
  configOrCurrencyId,
}: {
  configOrCurrencyId: HederaCoinConfig | string;
}): Promise<ValidatorWithNodeId[]> {
  const res = await apiClient.getNodes({ configOrCurrencyId, fetchAllPages: true });
  return res.nodes.map(toValidator);
}
