import type {
  Balance,
  BalanceOptions,
  Block,
  BlockInfo,
  BroadcastConfig,
  CoinModuleApi,
  CraftedTransaction,
  Cursor,
  FeeEstimation,
  ListOperationsOptions,
  Operation,
  Page,
  Reward,
  Stake,
  StringMemo,
  TransactionIntent,
  TransactionValidation,
  TxDataNotSupported,
  Validator,
  AddressValidationCurrencyParameters,
} from "@ledgerhq/coin-module-framework/api/index";
import coinConfig, { type CardanoConfig } from "../config";

export function createApi(config: CardanoConfig, _currencyId: string): CoinModuleApi<StringMemo> {
  coinConfig.setCoinConfig(() => ({ ...config, status: { type: "active" } }));

  return {
    lastBlock: (): Promise<BlockInfo> => {
      throw new Error("lastBlock is not supported");
    },
    getBlockInfo: (_height: number): Promise<BlockInfo> => {
      throw new Error("getBlockInfo is not supported");
    },
    getBlock: (_height: number): Promise<Block> => {
      throw new Error("getBlock is not supported");
    },
    getValidators: (_cursor?: Cursor): Promise<Page<Validator>> => {
      throw new Error("getValidators is not supported");
    },
    getBalance: (_address: string, _options?: BalanceOptions): Promise<Balance[]> => {
      throw new Error("getBalance is not supported");
    },
    listOperations: (
      _address: string,
      _options: ListOperationsOptions,
    ): Promise<Page<Operation>> => {
      throw new Error("listOperations is not supported");
    },
    getStakes: (_address: string, _cursor?: Cursor): Promise<Page<Stake>> => {
      throw new Error("getStakes is not supported");
    },
    getRewards: (_address: string, _cursor?: Cursor): Promise<Page<Reward>> => {
      throw new Error("getRewards is not supported");
    },
    craftTransaction: (
      _transactionIntent: TransactionIntent<StringMemo>,
      _customFees?: FeeEstimation,
    ): Promise<CraftedTransaction> => {
      throw new Error("craftTransaction is not supported");
    },
    craftRawTransaction: (
      _transaction: string,
      _sender: string,
      _publicKey: string,
      _sequence: bigint,
    ): Promise<CraftedTransaction> => {
      throw new Error("craftRawTransaction is not supported");
    },
    estimateFees: (
      _transactionIntent: TransactionIntent<StringMemo>,
      _customFeesParameters?: FeeEstimation["parameters"],
    ): Promise<FeeEstimation> => {
      throw new Error("estimateFees is not supported");
    },
    combine: (_tx: string, _signature: string, _pubkey?: string): string => {
      throw new Error("combine is not supported");
    },
    broadcast: (_tx: string, _broadcastConfig?: BroadcastConfig): Promise<string> => {
      throw new Error("broadcast is not supported");
    },
    validateIntent: (
      _transactionIntent: TransactionIntent<StringMemo>,
      _balances: Balance[],
      _customFees?: FeeEstimation,
    ): Promise<TransactionValidation> => {
      throw new Error("validateIntent is not supported");
    },
    getNextSequence: (_address: string): Promise<bigint> => {
      throw new Error("getNextSequence is not supported");
    },
    validateAddress: (
      _address: string,
      _parameters: Partial<AddressValidationCurrencyParameters>,
    ): Promise<boolean> => {
      throw new Error("validateAddress is not supported");
    },
    craftTransactionData: (_intent: TransactionIntent<StringMemo>): TxDataNotSupported => {
      throw new Error("craftTransactionData is not supported");
    },
  };
}
