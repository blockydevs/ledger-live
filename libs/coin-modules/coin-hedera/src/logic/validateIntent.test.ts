import BigNumber from "bignumber.js";
import type { Balance, TransactionIntent } from "@ledgerhq/coin-module-framework/api/types";
import { HEDERA_TRANSACTION_MODES } from "../constants";
import type { HederaCoinConfig } from "../config";
import type { HederaMemo, HederaTxData } from "../types";
import { validateIntent } from "./validateIntent";

type Intent = TransactionIntent<HederaMemo, HederaTxData>;

jest.mock("../network/utils", () => ({
  ...jest.requireActual("../network/utils"),
  safeParseAccountId: jest.fn(),
  getCurrencyToUSDRate: jest.fn(),
  checkAccountTokenAssociationStatus: jest.fn(),
}));
jest.mock("./estimateFees");
jest.mock("./getTokenFromAsset");
jest.mock("./getStakes");
jest.mock("./getValidators");

import {
  safeParseAccountId,
  getCurrencyToUSDRate,
  checkAccountTokenAssociationStatus,
} from "../network/utils";
import { estimateFees } from "./estimateFees";
import { getTokenFromAsset } from "./getTokenFromAsset";
import { getStakes } from "./getStakes";
import { getAllValidators } from "./getValidators";

const coinConfig: HederaCoinConfig = {
  status: { type: "active" },
  useNetworkTimestamp: false,
  networkType: "testnet",
  consensusNodes: {},
  apiUrls: { mirrorNode: "http://localhost", hgraph: "http://localhost" },
};

const SENDER = "0.0.1001";
const RECIPIENT = "0.0.1002";

const HTS_TOKEN = {
  id: "hedera/hts/llt",
  tokenType: "hts",
  contractAddress: "0.0.5005",
  parentCurrencyId: "hedera",
  units: [{ name: "LLT", code: "LLT", magnitude: 6 }],
} as const;

const ERC20_TOKEN_ADDRESS = "0x0000000000000000000000000000000000001388";

function nativeSendIntent(overrides: Partial<Intent> = {}): Intent {
  return {
    intentType: "transaction",
    type: HEDERA_TRANSACTION_MODES.Send,
    sender: SENDER,
    recipient: RECIPIENT,
    amount: 100n,
    asset: { type: "native" },
    useAllAmount: false,
    memo: { type: "string", kind: "text", value: "" },
    ...overrides,
  } as Intent;
}

function htsSendIntent(overrides: Partial<Intent> = {}): Intent {
  return {
    intentType: "transaction",
    type: HEDERA_TRANSACTION_MODES.Send,
    sender: SENDER,
    recipient: RECIPIENT,
    amount: 100n,
    asset: { type: "hts", assetReference: HTS_TOKEN.contractAddress, assetOwner: SENDER },
    useAllAmount: false,
    memo: { type: "string", kind: "text", value: "" },
    ...overrides,
  } as Intent;
}

function erc20SendIntent(overrides: Partial<Intent> = {}): Intent {
  return {
    intentType: "transaction",
    type: HEDERA_TRANSACTION_MODES.Send,
    sender: SENDER,
    recipient: RECIPIENT,
    amount: 100n,
    asset: { type: "erc20", assetReference: ERC20_TOKEN_ADDRESS, assetOwner: SENDER },
    useAllAmount: false,
    memo: { type: "string", kind: "text", value: "" },
    ...overrides,
  } as Intent;
}

function nativeBalances(value: bigint, locked = 0n): Balance[] {
  return [{ value, locked, asset: { type: "native" } }];
}

// One token sub-account balance plus the native (fee-paying) balance, mirroring what
// `extractBalances` produces for an account holding both HBAR and a token.
function tokenBalances(assetReference: string, tokenValue: bigint, nativeValue: bigint): Balance[] {
  return [
    { value: tokenValue, locked: 0n, asset: { type: "hts", assetReference } },
    { value: nativeValue, locked: 0n, asset: { type: "native" } },
  ];
}

function erc20Balances(tokenValue: bigint, nativeValue: bigint): Balance[] {
  return [
    {
      value: tokenValue,
      locked: 0n,
      asset: { type: "erc20", assetReference: ERC20_TOKEN_ADDRESS },
    },
    { value: nativeValue, locked: 0n, asset: { type: "native" } },
  ];
}

beforeEach(() => {
  jest
    .mocked(safeParseAccountId)
    .mockResolvedValue([null, { accountId: RECIPIENT, checksum: null }]);
  jest.mocked(estimateFees).mockResolvedValue({ tinybars: new BigNumber(50) });
  jest.mocked(getTokenFromAsset).mockResolvedValue(HTS_TOKEN as never);
});

describe("validateIntent — coin send", () => {
  it("passes a well-formed send", async () => {
    const result = await validateIntent(
      coinConfig,
      "hedera",
      nativeSendIntent(),
      nativeBalances(1_000n),
    );

    expect(result.errors).toEqual({});
    expect(result.amount).toBe(100n);
    expect(result.totalSpent).toBe(150n);
    expect(result.estimatedFees).toBe(50n);
  });

  it("flags a zero amount", async () => {
    const result = await validateIntent(
      coinConfig,
      "hedera",
      nativeSendIntent({ amount: 0n }),
      nativeBalances(1_000n),
    );

    expect(result.errors.amount?.name).toBe("AmountRequired");
  });

  it("flags insufficient balance", async () => {
    const result = await validateIntent(
      coinConfig,
      "hedera",
      nativeSendIntent({ amount: 1_000n }),
      nativeBalances(1_000n),
    );

    expect(result.errors.amount?.name).toBe("NotEnoughBalance");
  });

  it("resolves useAllAmount against the available (locked-aware) balance", async () => {
    const result = await validateIntent(
      coinConfig,
      "hedera",
      nativeSendIntent({ amount: 0n, useAllAmount: true }),
      nativeBalances(1_000n, 200n),
    );

    // available = 1000 - 200 = 800; amount = available - fee = 800 - 50 = 750
    expect(result.amount).toBe(750n);
    expect(result.errors.amount).toBeUndefined();
  });

  it("flags sending to the same account as the sender", async () => {
    jest
      .mocked(safeParseAccountId)
      .mockResolvedValue([null, { accountId: SENDER, checksum: null }]);

    const result = await validateIntent(
      coinConfig,
      "hedera",
      nativeSendIntent({ recipient: SENDER }),
      nativeBalances(1_000n),
    );

    expect(result.errors.recipient?.name).toBe("InvalidAddressBecauseDestinationIsAlsoSource");
  });
});

describe("validateIntent — HTS token send", () => {
  it("passes a well-formed send once the recipient is already associated", async () => {
    jest.mocked(checkAccountTokenAssociationStatus).mockResolvedValue(true);

    const result = await validateIntent(
      coinConfig,
      "hedera",
      htsSendIntent(),
      tokenBalances(HTS_TOKEN.contractAddress, 1_000n, 1_000n),
    );

    expect(result.errors).toEqual({});
    expect(result.warnings).toEqual({});
    expect(result.amount).toBe(100n);
  });

  it("flags missingAssociation when the recipient is not associated", async () => {
    jest.mocked(checkAccountTokenAssociationStatus).mockResolvedValue(false);

    const result = await validateIntent(
      coinConfig,
      "hedera",
      htsSendIntent(),
      tokenBalances(HTS_TOKEN.contractAddress, 1_000n, 1_000n),
    );

    expect(result.warnings.missingAssociation?.name).toBe(
      "HederaRecipientTokenAssociationRequired",
    );
  });

  it("flags unverifiedAssociation when the association check fails", async () => {
    jest.mocked(checkAccountTokenAssociationStatus).mockRejectedValue(new Error("network down"));

    const result = await validateIntent(
      coinConfig,
      "hedera",
      htsSendIntent(),
      tokenBalances(HTS_TOKEN.contractAddress, 1_000n, 1_000n),
    );

    expect(result.warnings.unverifiedAssociation?.name).toBe(
      "HederaRecipientTokenAssociationUnverified",
    );
  });

  it("flags insufficient token balance", async () => {
    jest.mocked(checkAccountTokenAssociationStatus).mockResolvedValue(true);

    const result = await validateIntent(
      coinConfig,
      "hedera",
      htsSendIntent(),
      tokenBalances(HTS_TOKEN.contractAddress, 50n, 1_000n),
    );

    expect(result.errors.amount?.name).toBe("NotEnoughBalance");
  });

  it("flags insufficient native balance for the fee", async () => {
    jest.mocked(checkAccountTokenAssociationStatus).mockResolvedValue(true);

    const result = await validateIntent(
      coinConfig,
      "hedera",
      htsSendIntent(),
      tokenBalances(HTS_TOKEN.contractAddress, 1_000n, 10n),
    );

    expect(result.errors.amount?.name).toBe("NotEnoughBalance");
  });
});

describe("validateIntent — ERC20 token send", () => {
  it("passes a well-formed send and always carries the unverifiedEvmAddress warning", async () => {
    const result = await validateIntent(
      coinConfig,
      "hedera",
      erc20SendIntent(),
      erc20Balances(1_000n, 1_000n),
    );

    expect(result.errors).toEqual({});
    expect(result.warnings.unverifiedEvmAddress?.name).toBe(
      "HederaRecipientEvmAddressVerificationRequired",
    );
    expect(result.amount).toBe(100n);
  });

  it("flags a zero amount", async () => {
    const result = await validateIntent(
      coinConfig,
      "hedera",
      erc20SendIntent({ amount: 0n }),
      erc20Balances(1_000n, 1_000n),
    );

    expect(result.errors.amount?.name).toBe("AmountRequired");
  });

  it("flags insufficient token balance", async () => {
    const result = await validateIntent(
      coinConfig,
      "hedera",
      erc20SendIntent(),
      erc20Balances(50n, 1_000n),
    );

    expect(result.errors.amount?.name).toBe("NotEnoughBalance");
  });

  it("flags insufficient native balance for the fee", async () => {
    const result = await validateIntent(
      coinConfig,
      "hedera",
      erc20SendIntent(),
      erc20Balances(1_000n, 10n),
    );

    expect(result.errors.amount?.name).toBe("NotEnoughBalance");
  });
});

describe("validateIntent — token associate", () => {
  const associateIntent: Intent = {
    intentType: "transaction",
    type: HEDERA_TRANSACTION_MODES.TokenAssociate,
    sender: SENDER,
    recipient: SENDER,
    amount: 0n,
    asset: { type: "hts", assetReference: HTS_TOKEN.contractAddress, assetOwner: SENDER },
    useAllAmount: false,
    memo: { type: "string", kind: "text", value: "" },
  } as Intent;

  it("requires no minimum balance once the token is already associated", async () => {
    jest.mocked(checkAccountTokenAssociationStatus).mockResolvedValue(true);

    const result = await validateIntent(
      coinConfig,
      "hedera",
      associateIntent,
      nativeBalances(1_000n),
    );

    expect(result.errors.insufficientAssociateBalance).toBeUndefined();
  });

  it("flags insufficient USD-denominated balance for a fresh association", async () => {
    jest.mocked(checkAccountTokenAssociationStatus).mockResolvedValue(false);
    jest.mocked(getCurrencyToUSDRate).mockResolvedValue(new BigNumber(0.00000001));

    const result = await validateIntent(coinConfig, "hedera", associateIntent, nativeBalances(1n));

    expect(result.errors.insufficientAssociateBalance?.name).toBe(
      "HederaInsufficientFundsForAssociation",
    );
  });
});

function delegateIntent(stakingNodeId: number | null): Intent {
  return {
    intentType: "staking",
    type: HEDERA_TRANSACTION_MODES.Delegate,
    sender: SENDER,
    recipient: SENDER,
    amount: 0n,
    asset: { type: "native" },
    useAllAmount: false,
    data: { type: "staking", stakingNodeId },
  } as Intent;
}

function stakeOf(nodeId: number | null, amountRewarded = 0n) {
  return {
    items:
      nodeId === null
        ? []
        : [
            {
              uid: SENDER,
              address: SENDER,
              asset: { type: "native" as const },
              state: "active" as const,
              amount: 0n,
              amountDeposited: 0n,
              amountRewarded,
              actions: [],
              details: { stakedNodeId: nodeId, overstaked: false },
            },
          ],
  };
}

function validatorList(nodeIds: number[]) {
  return nodeIds.map(id => ({
    address: `0.0.${id}`,
    nodeId: String(id),
    name: `node-${id}`,
    description: "",
    balance: 0n,
    apy: 0,
  }));
}

describe("validateIntent — staking", () => {
  beforeEach(() => {
    jest.mocked(getAllValidators).mockResolvedValue(validatorList([3, 5, 7]));
    jest.mocked(getStakes).mockResolvedValue(stakeOf(null));
  });

  it("accepts a delegation to a validator present in the node list", async () => {
    const result = await validateIntent(
      coinConfig,
      "hedera",
      delegateIntent(5),
      nativeBalances(1_000n),
    );

    expect(result.errors.stakingNodeId).toBeUndefined();
    expect(result.errors.missingStakingNodeId).toBeUndefined();
  });

  it("flags an unset node id", async () => {
    const result = await validateIntent(
      coinConfig,
      "hedera",
      delegateIntent(null),
      nativeBalances(1_000n),
    );

    expect(result.errors.missingStakingNodeId?.name).toBe("HederaInvalidStakingNodeIdError");
  });

  it("does not also flag a redundant node on a first-time delegation with no node id set", async () => {
    jest.mocked(getStakes).mockResolvedValue(stakeOf(null));

    const result = await validateIntent(
      coinConfig,
      "hedera",
      delegateIntent(null),
      nativeBalances(1_000n),
    );

    expect(result.errors.missingStakingNodeId?.name).toBe("HederaInvalidStakingNodeIdError");
    expect(result.errors.stakingNodeId).toBeUndefined();
  });

  it("flags a node id absent from the validator list", async () => {
    const result = await validateIntent(
      coinConfig,
      "hedera",
      delegateIntent(99),
      nativeBalances(1_000n),
    );

    expect(result.errors.stakingNodeId?.name).toBe("HederaInvalidStakingNodeIdError");
  });

  it("flags redelegating to the current node", async () => {
    jest.mocked(getStakes).mockResolvedValue(stakeOf(5));

    const result = await validateIntent(
      coinConfig,
      "hedera",
      delegateIntent(5),
      nativeBalances(1_000n),
    );

    expect(result.errors.stakingNodeId?.name).toBe("HederaRedundantStakingNodeIdError");
  });

  it("ADR 0004: keeps the invalid-node error when the invalid node also happens to be the current one", async () => {
    // The node the account is currently delegated to has since dropped out of the validator list.
    jest.mocked(getAllValidators).mockResolvedValue(validatorList([3, 7]));
    jest.mocked(getStakes).mockResolvedValue(stakeOf(5));

    const result = await validateIntent(
      coinConfig,
      "hedera",
      delegateIntent(5),
      nativeBalances(1_000n),
    );

    expect(result.errors.stakingNodeId?.name).toBe("HederaInvalidStakingNodeIdError");
  });
});
