import invariant from "invariant";
import type {
  AccountInfo,
  CoinModuleImpl,
  Balance,
  BlockInfo,
  CraftedTransaction,
  FeeEstimation,
  MemoNotSupported,
  Page,
  Stake,
  BalanceOptions,
  Validator,
} from "@ledgerhq/coin-module-framework/api/index";
import { craftTransactionData } from "@ledgerhq/coin-module-framework/logic/craftTransactionData";
import { rejectBalanceOptions } from "@ledgerhq/coin-module-framework/api/getBalance/rejectBalanceOptions";
import { NotEnoughBalance } from "@ledgerhq/ledger-wallet-framework/errors";
import {
  FEE_INTENT_TYPES,
  MAX_PRIVATE_RECORDS_PER_TRANSACTION,
  MAX_PRIVATE_TOKEN_RECORDS_PER_TRANSACTION,
} from "../constants";
import { AleoFeeRecordInsufficientBalance } from "../errors";
import {
  broadcast,
  combine,
  craftTransaction,
  estimateFees,
  getAccountInfo,
  getBalance,
  getStakes,
  getValidators,
  lastBlock,
  register,
  validateAddress,
} from "../logic";
import {
  buildFeeConfigurationForRootIntent,
  getTransactionType,
  resolvePrivacyContext,
} from "../logic/utils";
import {
  getPrivateRootApiData,
  mapPrivateFeeApiIntent,
  mapPrivateRootApiIntent,
  mapPublicApiIntent,
} from "../logic/mapApiTransactionIntent";
import { resolveRecords } from "../logic/resolveRecords";
import { selectRecords } from "../logic/selectRecords";
import type {
  AleoApiPrivateRootIntentData,
  AleoApiTransactionIntent,
  AleoApiTransactionIntentData,
  AleoContext,
  AleoCoinConfig,
  AleoCraftDetails,
  AleoRegistration,
} from "../types";
import { listOperations } from "../logic/listOperations";

type AleoCoinModuleImpl = CoinModuleImpl<
  AleoCoinConfig,
  MemoNotSupported,
  AleoApiTransactionIntentData
>;

function requireViewKey(context: AleoContext, action: string): string {
  const { viewKey } = context;
  if (typeof viewKey !== "string" || viewKey.length === 0) {
    throw new Error(`aleo: a view key is required to ${action}`);
  }
  return viewKey;
}

function getRootBaseFee(
  config: AleoCoinConfig,
  txIntent: AleoApiTransactionIntent,
  options?: { customFees?: FeeEstimation },
): bigint {
  if (options?.customFees) return options.customFees.value;
  return estimateFees({
    configOrCurrencyId: config,
    transactionType: getTransactionType(txIntent),
  }).value;
}

async function craftFeeIntent(
  context: AleoContext,
  config: AleoCoinConfig,
  txIntent: AleoApiTransactionIntent,
): Promise<CraftedTransaction> {
  // txIntent.amount -> base fee
  // txIntent.data.priorityFee -> priority fee (defaults to 0)
  // both should match max_base_fee/max_priority_fee from the FeeConfiguration of the root intent
  if (txIntent.type !== "fee_private") {
    return craftTransaction({
      config,
      txIntent: mapPublicApiIntent(txIntent),
      feeConfiguration: null,
      ...(context.viewKey && { viewKey: context.viewKey }),
    });
  }

  requireViewKey(context, "craft a private fee transaction");
  const { provableId, viewKey } = resolvePrivacyContext(context);
  const data = "data" in txIntent ? txIntent.data : undefined;
  invariant(data?.type === "fee_private", "aleo: intent data is required for fee_private");

  const { records, total } = await resolveRecords({
    config,
    provableId,
    viewKey,
    commitments: [data.recordCommitment],
    pool: { type: "native" },
    maxRecords: 1,
  });

  if (total.lt((txIntent.amount + (data.priorityFee ?? 0n)).toString())) {
    throw new AleoFeeRecordInsufficientBalance();
  }

  return craftTransaction({
    config,
    txIntent: mapPrivateFeeApiIntent(txIntent, records[0]),
    feeConfiguration: null,
    viewKey,
  });
}

async function craftPrivateRoot(
  context: AleoContext,
  config: AleoCoinConfig,
  txIntent: AleoApiTransactionIntent,
  privateData: AleoApiPrivateRootIntentData,
  maxBaseFee: bigint,
): Promise<CraftedTransaction> {
  requireViewKey(context, "craft a private transaction");
  const { provableId, viewKey } = resolvePrivacyContext(context);
  const programId = "programId" in privateData ? privateData.programId : undefined;

  if (privateData.recordCommitments === undefined) {
    const { amountRecords, feeRecord } = await selectRecords({
      config,
      provableId,
      viewKey,
      type: getTransactionType(txIntent),
      amount: txIntent.amount,
      ...(programId !== undefined && { programId }),
      fee: maxBaseFee,
      isFeeSponsored: config.isFeeSponsored,
    });
    const details: AleoCraftDetails = {
      recordCommitments: amountRecords.map(record => record.commitment),
      ...(feeRecord && { feeRecordCommitment: feeRecord.commitment }),
    };
    return { transaction: "0x", details };
  }

  const { records, total } = await resolveRecords({
    config,
    provableId,
    viewKey,
    commitments: privateData.recordCommitments,
    pool: programId !== undefined ? { type: "token", programId } : { type: "native" },
    maxRecords:
      programId !== undefined
        ? MAX_PRIVATE_TOKEN_RECORDS_PER_TRANSACTION
        : MAX_PRIVATE_RECORDS_PER_TRANSACTION,
  });

  const tvks = privateData.tvks ?? [];
  const expectedTvks = records.length > 1 ? records.length + 1 : 0;
  invariant(
    tvks.length === expectedTvks,
    `aleo: expected ${expectedTvks} tvks for ${records.length} records, received ${tvks.length}`,
  );
  if (total.lt(txIntent.amount.toString())) throw new NotEnoughBalance();

  const crafted = await craftTransaction({
    config,
    txIntent: mapPrivateRootApiIntent(txIntent, records),
    feeConfiguration: buildFeeConfigurationForRootIntent({
      isPrivate: true,
      maxBaseFee,
      maxPriorityFee: 0n,
    }),
    viewKey,
  });
  const details: AleoCraftDetails = { recordCommitments: privateData.recordCommitments };
  return { ...crafted, details };
}

// currencyId is captured here (it can't live on the Context). The logic functions are shared with
// the classic bridge (config-based), so each method resolves the config itself and passes it down —
// no context-first wrappers.
//
// Checked against CoinModuleImpl with `satisfies` rather than annotated as it, so the precise shape
// survives and a caller sees exactly which methods exist.
//
// Omitted rather than stubbed: `call`, `craftRawTransaction`, `getBlock`, `getBlockInfo`,
// `getRewards`, `validateIntent` and `getNextSequence`. The consumer resolver applies
// `withDefaults`, which answers "not supported" for each.
//
// `getAccountInfo`, `register` and `validateAddress` stay: they are real implementations —
// enrollment into the Provable record scanner and the scan status it reports are central to Aleo's
// private balance and history, so listing them here is what tells a caller they are not placeholders.
export function createApi(currencyId: string) {
  return {
    broadcast: async (
      context: AleoContext,
      signedTransaction: string,
      _options?,
    ): Promise<string> => {
      const config = await context.config();
      return broadcast({
        configOrCurrencyId: config,
        signedTx: signedTransaction,
      });
    },
    combine: async (
      context: AleoContext,
      transaction: string,
      signatures: string[],
      _options?,
    ): Promise<string> => {
      const config = await context.config();
      const viewKey = requireViewKey(context, "combine a transaction");
      return combine({ config, transaction, signatures, viewKey });
    },
    craftTransaction: async (
      context: AleoContext,
      txIntent: AleoApiTransactionIntent,
      options?: { customFees?: FeeEstimation },
    ): Promise<CraftedTransaction> => {
      invariant(!txIntent.useAllAmount, "aleo: useAllAmount is not supported");

      const config = await context.config();

      if (FEE_INTENT_TYPES.has(txIntent.type)) {
        invariant(!config.isFeeSponsored, "aleo: fee craft is not needed when fees are sponsored");
        invariant(!options?.customFees, "aleo: customFees is not supported for fee intents");
        return craftFeeIntent(context, config, txIntent);
      }

      const maxBaseFee = getRootBaseFee(config, txIntent, options);
      const privateData = getPrivateRootApiData(txIntent);

      if (!privateData) {
        const maxPriorityFee =
          ("data" in txIntent && "priorityFee" in txIntent.data
            ? txIntent.data.priorityFee
            : undefined) ?? 0n;

        return craftTransaction({
          config,
          txIntent: mapPublicApiIntent(txIntent),
          feeConfiguration: buildFeeConfigurationForRootIntent({
            isPrivate: false,
            maxBaseFee,
            maxPriorityFee,
          }),
          ...(context.viewKey && { viewKey: context.viewKey }),
        });
      }

      return craftPrivateRoot(context, config, txIntent, privateData, maxBaseFee);
    },
    estimateFees: async (context: AleoContext, intent, _options?): Promise<FeeEstimation> => {
      const config = await context.config();
      return estimateFees({
        configOrCurrencyId: config,
        transactionType: getTransactionType(intent),
      });
    },
    getAccountInfo: async (context: AleoContext, _address: string): Promise<AccountInfo> => {
      const provableId = context.provableId;
      if (typeof provableId !== "string" || provableId.length === 0) {
        return { type: "none" };
      }
      const config = await context.config();
      return getAccountInfo(config, provableId);
    },
    getBalance: async (
      context: AleoContext,
      address: string,
      options?: BalanceOptions,
    ): Promise<Balance[]> => {
      return rejectBalanceOptions(() => getBalance(context, address), options);
    },
    getStakes: async (context: AleoContext, address: string, _options?): Promise<Page<Stake>> => {
      const config = await context.config();
      return getStakes(config, address);
    },
    getValidators: async (context: AleoContext, _options?): Promise<Page<Validator>> => {
      const config = await context.config();
      const validators = await getValidators(config);
      return {
        items: validators.map(validator => ({
          id: validator.address,
          address: validator.address,
          name: validator.name ?? validator.address,
          balance: BigInt(validator.stakeMicrocredits),
          commissionRate: String(validator.commissionPercent),
          ...(validator.estimatedYearlyRewardsRate !== undefined && {
            apy: validator.estimatedYearlyRewardsRate,
          }),
        })),
      };
    },
    lastBlock: async (context: AleoContext): Promise<BlockInfo> => {
      const config = await context.config();
      return lastBlock(config);
    },
    listOperations: async (context: AleoContext, address, options) => {
      const { provableId, viewKey } = resolvePrivacyContext(context);

      const config = await context.config(currencyId);

      return listOperations({ config, address, options, provableId, viewKey });
    },
    validateAddress: (_context: AleoContext, address, parameters) =>
      validateAddress(address, parameters),
    craftTransactionData: (_context, intent) => craftTransactionData(intent),
    // `address` is unused: enrollment is keyed by the view key, not the address.
    register: async (context: AleoContext, _address: string): Promise<AleoRegistration> => {
      const viewKey = requireViewKey(context, "register with the Provable scanner");
      const config = await context.config();
      return register(config, viewKey);
    },
  } satisfies AleoCoinModuleImpl;
}
