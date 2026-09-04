import type { TransactionIntent } from "@ledgerhq/coin-module-framework/api/index";
import { HEDERA_TRANSACTION_MODES, TINYBAR_SCALE } from "../constants";
import { toEVMAddress } from "../network/utils";
import { getMockedConfig } from "../test/fixtures/config.fixture";
import type { HederaMemo, HederaTxData } from "../types";
import { craftTransaction } from "./craftTransaction";
import { HEDERA_MAX_MEMO_SIZE } from "./validateMemo";
import { getHederaTransactionBodyBytes } from "./utils";

jest.mock("../network/rpc", () => ({
  rpcClient: require("../test/fixtures/rpc.fixture").getMockedRpcClient(),
}));
jest.mock("../network/utils", () => ({
  ...jest.requireActual("../network/utils"),
  toEVMAddress: jest.fn(),
}));

const mockToEVMAddress = jest.mocked(toEVMAddress);
const mockConfig = getMockedConfig();

// app-hedera 1.9.1 issues one APDU per signing call with no chaining. Both the
// legacy signer (whose payload is `4 + body` and is rejected by hw-transport
// at 256 bytes total) and the DMK signer kit (`transaction_too_large`) are
// bound by the single-byte APDU length field: 255 (APDU_MAX_PAYLOAD) minus
// the 4-byte key index leaves 251 bytes for the transaction body.
const APDU_BODY_CEILING = 251;

// the longest memo `validateIntent.ts` accepts on any Hedera transaction, ERC-20 sends included
const MAX_MEMO = "a".repeat(HEDERA_MAX_MEMO_SIZE);

// same character count as MAX_MEMO, but each character is a 3-byte UTF-8 sequence, so the
// protobuf-encoded memo is up to 3x the bytes of the ASCII case
const MAX_MEMO_MULTIBYTE = "漢".repeat(HEDERA_MAX_MEMO_SIZE);

describe("hedera transaction body size against the 251-byte APDU ceiling", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("TransferTransaction: send HBAR", async () => {
    const txIntent = {
      intentType: "transaction",
      type: HEDERA_TRANSACTION_MODES.Send,
      amount: BigInt(5 * 10 ** TINYBAR_SCALE),
      recipient: "0.0.123456789",
      sender: "0.0.987654321",
      asset: { type: "native" },
      memo: { kind: "text", type: "string", value: "Send to exchange" },
    } satisfies TransactionIntent<HederaMemo>;

    const { tx } = await craftTransaction({ txIntent, configOrCurrencyId: mockConfig });
    const body = getHederaTransactionBodyBytes(tx);

    // eslint-disable-next-line no-console
    console.log(`[body-size] TransferTransaction (HBAR send): ${body.length} bytes`);
    expect(body.length).toBeLessThanOrEqual(APDU_BODY_CEILING);
  });

  it("TransferTransaction: transfer HTS token (USDC on Hedera mainnet)", async () => {
    const txIntent = {
      intentType: "transaction",
      type: HEDERA_TRANSACTION_MODES.Send,
      amount: BigInt(25_000000), // 25 USDC at 6 decimals
      recipient: "0.0.123456789",
      sender: "0.0.987654321",
      asset: { type: "hts", assetReference: "0.0.456858" }, // USDC token id on Hedera mainnet
      memo: { kind: "text", type: "string", value: "Send to exchange" },
    } satisfies TransactionIntent<HederaMemo>;

    const { tx } = await craftTransaction({ txIntent, configOrCurrencyId: mockConfig });
    const body = getHederaTransactionBodyBytes(tx);

    // eslint-disable-next-line no-console
    console.log(`[body-size] TransferTransaction (HTS transfer): ${body.length} bytes`);
    expect(body.length).toBeLessThanOrEqual(APDU_BODY_CEILING);
  });

  it("TokenAssociateTransaction: associate a token", async () => {
    const txIntent = {
      intentType: "transaction",
      type: HEDERA_TRANSACTION_MODES.TokenAssociate,
      amount: BigInt(0),
      recipient: "",
      sender: "0.0.987654321",
      asset: { type: "hts", assetReference: "0.0.456858" },
      memo: { kind: "text", type: "string", value: "" },
    } satisfies TransactionIntent<HederaMemo>;

    const { tx } = await craftTransaction({ txIntent, configOrCurrencyId: mockConfig });
    const body = getHederaTransactionBodyBytes(tx);

    // eslint-disable-next-line no-console
    console.log(`[body-size] TokenAssociateTransaction: ${body.length} bytes`);
    expect(body.length).toBeLessThanOrEqual(APDU_BODY_CEILING);
  });

  it("AccountUpdateTransaction: delegate to a validator node", async () => {
    const txIntent = {
      intentType: "transaction",
      type: HEDERA_TRANSACTION_MODES.Delegate,
      amount: BigInt(0),
      recipient: "",
      sender: "0.0.987654321",
      asset: { type: "native" },
      memo: { kind: "text", type: "string", value: "" },
      data: { type: "staking", stakingNodeId: 5 },
    } satisfies TransactionIntent<HederaMemo, HederaTxData>;

    const { tx } = await craftTransaction({ txIntent, configOrCurrencyId: mockConfig });
    const body = getHederaTransactionBodyBytes(tx);

    // eslint-disable-next-line no-console
    console.log(`[body-size] AccountUpdateTransaction (delegate): ${body.length} bytes`);
    expect(body.length).toBeLessThanOrEqual(APDU_BODY_CEILING);
  });

  it("AccountUpdateTransaction: undelegate", async () => {
    const txIntent = {
      intentType: "transaction",
      type: HEDERA_TRANSACTION_MODES.Undelegate,
      amount: BigInt(0),
      recipient: "",
      sender: "0.0.987654321",
      asset: { type: "native" },
      memo: { kind: "text", type: "string", value: "" },
      data: { type: "staking", stakingNodeId: null },
    } satisfies TransactionIntent<HederaMemo, HederaTxData>;

    const { tx } = await craftTransaction({ txIntent, configOrCurrencyId: mockConfig });
    const body = getHederaTransactionBodyBytes(tx);

    // eslint-disable-next-line no-console
    console.log(`[body-size] AccountUpdateTransaction (undelegate): ${body.length} bytes`);
    expect(body.length).toBeLessThanOrEqual(APDU_BODY_CEILING);
  });

  it("ContractExecuteTransaction: ERC-20 transfer (Bonzo Finance aUSDC on Hedera mainnet)", async () => {
    // long-zero EVM address derived from recipient account 0.0.998877
    mockToEVMAddress.mockResolvedValue("0x00000000000000000000000000000000000f3ddd");

    const txIntent = {
      intentType: "transaction",
      type: HEDERA_TRANSACTION_MODES.Send,
      amount: BigInt("1000000000000000000"), // 1 aUSDC, 18 decimals
      recipient: "0.0.998877",
      sender: "0.0.987654321",
      asset: { type: "erc20", assetReference: "0xB7687538c7f4CAD022d5e97CC778d0b46457c5DB" }, // Bonzo aUSDC
      memo: { kind: "text", type: "string", value: "" },
      data: { type: "erc20", gasLimit: BigInt(100000) },
    } satisfies TransactionIntent<HederaMemo, HederaTxData>;

    const { tx } = await craftTransaction({ txIntent, configOrCurrencyId: mockConfig });
    const body = getHederaTransactionBodyBytes(tx);

    // eslint-disable-next-line no-console
    console.log(`[body-size] ContractExecuteTransaction (ERC-20 transfer): ${body.length} bytes`);
    expect(body.length).toBeLessThanOrEqual(APDU_BODY_CEILING);
  });

  it("TransferTransaction: send HBAR with a maximum-length memo", async () => {
    const txIntent = {
      intentType: "transaction",
      type: HEDERA_TRANSACTION_MODES.Send,
      amount: BigInt(5 * 10 ** TINYBAR_SCALE),
      recipient: "0.0.123456789",
      sender: "0.0.987654321",
      asset: { type: "native" },
      memo: { kind: "text", type: "string", value: MAX_MEMO },
    } satisfies TransactionIntent<HederaMemo>;

    const { tx } = await craftTransaction({ txIntent, configOrCurrencyId: mockConfig });
    const body = getHederaTransactionBodyBytes(tx);

    // eslint-disable-next-line no-console
    console.log(`[body-size] TransferTransaction (HBAR send, max memo): ${body.length} bytes`);
    expect(body.length).toBeLessThanOrEqual(APDU_BODY_CEILING);
  });

  it("TransferTransaction: transfer HTS token with a maximum-length memo", async () => {
    const txIntent = {
      intentType: "transaction",
      type: HEDERA_TRANSACTION_MODES.Send,
      amount: BigInt(25_000000), // 25 USDC at 6 decimals
      recipient: "0.0.123456789",
      sender: "0.0.987654321",
      asset: { type: "hts", assetReference: "0.0.456858" }, // USDC token id on Hedera mainnet
      memo: { kind: "text", type: "string", value: MAX_MEMO },
    } satisfies TransactionIntent<HederaMemo>;

    const { tx } = await craftTransaction({ txIntent, configOrCurrencyId: mockConfig });
    const body = getHederaTransactionBodyBytes(tx);

    // eslint-disable-next-line no-console
    console.log(`[body-size] TransferTransaction (HTS transfer, max memo): ${body.length} bytes`);
    expect(body.length).toBeLessThanOrEqual(APDU_BODY_CEILING);
  });

  it("AccountUpdateTransaction: delegate to a validator node with a maximum-length memo", async () => {
    const txIntent = {
      intentType: "transaction",
      type: HEDERA_TRANSACTION_MODES.Delegate,
      amount: BigInt(0),
      recipient: "",
      sender: "0.0.987654321",
      asset: { type: "native" },
      memo: { kind: "text", type: "string", value: MAX_MEMO },
      data: { type: "staking", stakingNodeId: 5 },
    } satisfies TransactionIntent<HederaMemo, HederaTxData>;

    const { tx } = await craftTransaction({ txIntent, configOrCurrencyId: mockConfig });
    const body = getHederaTransactionBodyBytes(tx);

    // eslint-disable-next-line no-console
    console.log(`[body-size] AccountUpdateTransaction (delegate, max memo): ${body.length} bytes`);
    expect(body.length).toBeLessThanOrEqual(APDU_BODY_CEILING);
  });

  it("ContractExecuteTransaction: ERC-20 transfer with a maximum-length memo", async () => {
    // long-zero EVM address derived from recipient account 0.0.998877
    mockToEVMAddress.mockResolvedValue("0x00000000000000000000000000000000000f3ddd");

    const txIntent = {
      intentType: "transaction",
      type: HEDERA_TRANSACTION_MODES.Send,
      amount: BigInt("1000000000000000000"), // 1 aUSDC, 18 decimals
      recipient: "0.0.998877",
      sender: "0.0.987654321",
      asset: { type: "erc20", assetReference: "0xB7687538c7f4CAD022d5e97CC778d0b46457c5DB" }, // Bonzo aUSDC
      memo: { kind: "text", type: "string", value: MAX_MEMO },
      data: { type: "erc20", gasLimit: BigInt(100000) },
    } satisfies TransactionIntent<HederaMemo, HederaTxData>;

    const { tx } = await craftTransaction({ txIntent, configOrCurrencyId: mockConfig });
    const body = getHederaTransactionBodyBytes(tx);

    // eslint-disable-next-line no-console
    console.log(
      `[body-size] ContractExecuteTransaction (ERC-20 transfer, max memo): ${body.length} bytes`,
    );
    // A maximum-length memo on an ERC-20 transfer produces a body above the single-APDU
    // ceiling. app-hedera v1.9.1 cannot sign this transaction on either signer path.
    // The memo cap fix is tracked separately under LIVE-35809.
    expect(body.length).toBeGreaterThan(APDU_BODY_CEILING);
  });

  it("TransferTransaction: send HBAR with a maximum-length multi-byte memo", async () => {
    const txIntent = {
      intentType: "transaction",
      type: HEDERA_TRANSACTION_MODES.Send,
      amount: BigInt(5 * 10 ** TINYBAR_SCALE),
      recipient: "0.0.123456789",
      sender: "0.0.987654321",
      asset: { type: "native" },
      memo: { kind: "text", type: "string", value: MAX_MEMO_MULTIBYTE },
    } satisfies TransactionIntent<HederaMemo>;

    const { tx } = await craftTransaction({ txIntent, configOrCurrencyId: mockConfig });
    const body = getHederaTransactionBodyBytes(tx);

    // eslint-disable-next-line no-console
    console.log(
      `[body-size] TransferTransaction (HBAR send, max multi-byte memo): ${body.length} bytes`,
    );
    // `HEDERA_MAX_MEMO_SIZE` counts UTF-16 code units, not UTF-8 bytes, so a 100-character
    // CJK memo produces a body above the single-APDU ceiling on a plain HBAR send.
    // app-hedera v1.9.1 cannot sign this transaction on either signer path.
    // The memo cap fix is tracked separately under LIVE-35809.
    expect(body.length).toBeGreaterThan(APDU_BODY_CEILING);
  });

  it("ContractExecuteTransaction: ERC-20 transfer with a maximum-length multi-byte memo", async () => {
    // long-zero EVM address derived from recipient account 0.0.998877
    mockToEVMAddress.mockResolvedValue("0x00000000000000000000000000000000000f3ddd");

    const txIntent = {
      intentType: "transaction",
      type: HEDERA_TRANSACTION_MODES.Send,
      amount: BigInt("1000000000000000000"), // 1 aUSDC, 18 decimals
      recipient: "0.0.998877",
      sender: "0.0.987654321",
      asset: { type: "erc20", assetReference: "0xB7687538c7f4CAD022d5e97CC778d0b46457c5DB" }, // Bonzo aUSDC
      memo: { kind: "text", type: "string", value: MAX_MEMO_MULTIBYTE },
      data: { type: "erc20", gasLimit: BigInt(100000) },
    } satisfies TransactionIntent<HederaMemo, HederaTxData>;

    const { tx } = await craftTransaction({ txIntent, configOrCurrencyId: mockConfig });
    const body = getHederaTransactionBodyBytes(tx);

    // eslint-disable-next-line no-console
    console.log(
      `[body-size] ContractExecuteTransaction (ERC-20 transfer, max multi-byte memo): ${body.length} bytes`,
    );
    // `HEDERA_MAX_MEMO_SIZE` counts UTF-16 code units, not UTF-8 bytes, so a 100-character
    // CJK memo produces a body well above the single-APDU ceiling on top of the ERC-20
    // encoding overhead. app-hedera v1.9.1 cannot sign this transaction on either signer path.
    // The memo cap fix is tracked separately under LIVE-35809.
    expect(body.length).toBeGreaterThan(APDU_BODY_CEILING);
  });
});
