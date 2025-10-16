import invariant from "invariant";
import type { Transaction as HederaTransaction, TransactionResponse } from "@hashgraph/sdk";
import {
  Client,
  TransferTransaction,
  Hbar,
  AccountId,
  TransactionId,
  TokenAssociateTransaction,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  ContractId,
} from "@hashgraph/sdk";
import { findSubAccountById } from "@ledgerhq/coin-framework/account/helpers";
import { listTokensForCryptoCurrency } from "@ledgerhq/cryptoassets/tokens";
import { getCryptoCurrencyById } from "@ledgerhq/cryptoassets/currencies";
import type { Account, TokenAccount } from "@ledgerhq/types-live";
import { DEFAULT_GAS_LIMIT, HEDERA_TRANSACTION_MODES } from "../constants";
import { isTokenAssociateTransaction } from "../logic";
import { getERC20TokenBalance } from "./mirror";
import type { Transaction } from "../types";
import type { HederaERC20TokenBalance } from "./types";

export function broadcastTransaction(transaction: HederaTransaction): Promise<TransactionResponse> {
  return transaction.execute(getHederaClient());
}

// https://github.com/LedgerHQ/ledger-live/pull/72/commits/1e942687d4301660e43e0c4b5419fcfa2733b290
const nodeAccountIds: AccountId[] = [new AccountId(3)];

async function buildUnsignedCoinTransaction({
  account,
  transaction,
}: {
  account: Account;
  transaction: Transaction;
}): Promise<TransferTransaction> {
  const accountId = account.freshAddress;
  const hbarAmount = Hbar.fromTinybars(transaction.amount.toNumber());

  const tx = new TransferTransaction()
    .setNodeAccountIds(nodeAccountIds)
    .setTransactionId(TransactionId.generate(accountId))
    .setTransactionMemo(transaction.memo ?? "")
    .addHbarTransfer(accountId, hbarAmount.negated())
    .addHbarTransfer(transaction.recipient, hbarAmount);

  if (transaction.maxFee) {
    tx.setMaxTransactionFee(Hbar.fromTinybars(transaction.maxFee.toNumber()));
  }

  return tx.freeze();
}

async function buildUnsignedHTSTokenTransaction({
  account,
  tokenAccount,
  transaction,
}: {
  account: Account;
  tokenAccount: TokenAccount;
  transaction: Transaction;
}): Promise<TransferTransaction> {
  const accountId = account.freshAddress;
  const tokenId = tokenAccount.token.contractAddress;

  const tx = new TransferTransaction()
    .setNodeAccountIds(nodeAccountIds)
    .setTransactionId(TransactionId.generate(accountId))
    .setTransactionMemo(transaction.memo ?? "")
    .addTokenTransfer(tokenId, accountId, transaction.amount.negated().toNumber())
    .addTokenTransfer(tokenId, transaction.recipient, transaction.amount.toNumber());

  if (transaction.maxFee) {
    tx.setMaxTransactionFee(Hbar.fromTinybars(transaction.maxFee.toNumber()));
  }

  return tx.freeze();
}

async function buildUnsignedERC20TokenTransaction({
  account,
  tokenAccount,
  transaction,
}: {
  account: Account;
  tokenAccount: TokenAccount;
  transaction: Extract<Transaction, { mode: typeof HEDERA_TRANSACTION_MODES.Send }>;
}): Promise<ContractExecuteTransaction> {
  const accountId = AccountId.fromString(account.freshAddress);
  const contractId = ContractId.fromEvmAddress(0, 0, tokenAccount.token.contractAddress);
  const recipientEvmAddress = AccountId.fromString(transaction.recipient).toSolidityAddress();
  const gas = (transaction.gasLimit ?? DEFAULT_GAS_LIMIT).toNumber();

  // create function parameters for ERC20 transfer function
  // transfer(address to, uint256 amount) returns (bool)
  const functionParameters = new ContractFunctionParameters()
    .addAddress(recipientEvmAddress)
    .addUint256(transaction.amount.toNumber());

  const tx = new ContractExecuteTransaction()
    .setNodeAccountIds(nodeAccountIds)
    .setTransactionId(TransactionId.generate(accountId))
    .setTransactionMemo(transaction.memo ?? "")
    .setContractId(contractId)
    .setGas(gas)
    .setFunction("transfer", functionParameters);

  if (transaction.maxFee) {
    tx.setMaxTransactionFee(Hbar.fromTinybars(transaction.maxFee.toNumber()));
  }

  return tx.freeze();
}

async function buildTokenAssociateTransaction({
  account,
  transaction,
}: {
  account: Account;
  transaction: Transaction;
}): Promise<TokenAssociateTransaction> {
  invariant(isTokenAssociateTransaction(transaction), "invalid transaction properties");

  const accountId = account.freshAddress;

  const tx = new TokenAssociateTransaction()
    .setNodeAccountIds(nodeAccountIds)
    .setTransactionId(TransactionId.generate(accountId))
    .setTransactionMemo(transaction.memo ?? "")
    .setAccountId(accountId)
    .setTokenIds([transaction.properties.token.contractAddress]);

  if (transaction.maxFee) {
    tx.setMaxTransactionFee(Hbar.fromTinybars(transaction.maxFee.toNumber()));
  }

  return tx.freeze();
}

export async function buildUnsignedTransaction({
  account,
  transaction,
}: {
  account: Account;
  transaction: Transaction;
}): Promise<TransferTransaction | TokenAssociateTransaction | ContractExecuteTransaction> {
  const subAccount = findSubAccountById(account, transaction?.subAccountId || "");
  const isHTSTokenTransaction =
    transaction.mode === HEDERA_TRANSACTION_MODES.Send && subAccount?.token.tokenType === "hts";
  const isERC20TokenTransaction =
    transaction.mode === HEDERA_TRANSACTION_MODES.Send && subAccount?.token.tokenType === "erc20";

  if (isTokenAssociateTransaction(transaction)) {
    return buildTokenAssociateTransaction({ account, transaction });
  } else if (isHTSTokenTransaction) {
    return buildUnsignedHTSTokenTransaction({ account, tokenAccount: subAccount, transaction });
  } else if (isERC20TokenTransaction) {
    return buildUnsignedERC20TokenTransaction({ account, tokenAccount: subAccount, transaction });
  } else {
    return buildUnsignedCoinTransaction({ account, transaction });
  }
}

let _hederaClient: Client | null = null;

export function getHederaClient(): Client {
  _hederaClient ??= Client.forMainnet().setMaxNodesPerTransaction(1);

  //_hederaClient.setNetwork({ mainnet: "https://hedera.coin.ledger.com" });

  return _hederaClient;
}

export async function getERC20Tokens(evmAccountId: string): Promise<HederaERC20TokenBalance[]> {
  const currency = getCryptoCurrencyById("hedera");
  const availableTokens = listTokensForCryptoCurrency(currency);
  const availableERC20Tokens = availableTokens.filter(t => t.tokenType === "erc20");

  const promises = availableERC20Tokens.map(async erc20token => {
    const balance = await getERC20TokenBalance(evmAccountId, erc20token.contractAddress);

    return {
      balance,
      token: erc20token,
    };
  });

  const balances = await Promise.all(promises);

  return balances;
}
