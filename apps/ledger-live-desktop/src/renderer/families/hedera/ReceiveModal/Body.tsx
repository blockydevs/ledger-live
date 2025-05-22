import React, { useState, useCallback, useEffect } from "react";
import { compose } from "redux";
import { connect, useDispatch } from "react-redux";
import { TFunction } from "i18next";
import { Trans, withTranslation } from "react-i18next";
import { createStructuredSelector } from "reselect";
import { SyncSkipUnderPriority } from "@ledgerhq/live-common/bridge/react/index";
import useBridgeTransaction from "@ledgerhq/live-common/bridge/useBridgeTransaction";
import { getAccountBridge } from "@ledgerhq/live-common/bridge/index";
import { Transaction, TransactionStatus } from "@ledgerhq/live-common/families/hedera/types";
import Track from "~/renderer/analytics/Track";
import { Account, AccountLike, Operation, TokenAccount } from "@ledgerhq/types-live";
import { TokenCurrency } from "@ledgerhq/types-cryptoassets";
import { Device } from "@ledgerhq/live-common/hw/actions/types";
import { getAccountCurrency } from "@ledgerhq/live-common/account/helpers";
import { getCurrentDevice } from "~/renderer/reducers/devices";
import { accountsSelector } from "~/renderer/reducers/accounts";
import { closeModal } from "~/renderer/actions/modals";
import Stepper, { Step } from "~/renderer/components/Stepper";
import StepAccount, { StepAccountFooter } from "./steps/StepAccount";
import StepAssociateToken from "./steps/StepAssociateDevice";
import StepConnectDevice, {
  StepConnectDeviceFooter,
} from "~/renderer/modals/Receive/steps/StepConnectDevice";
import StepWarning, { StepWarningFooter } from "~/renderer/modals/Receive/steps/StepWarning";
import StepReceiveFunds from "~/renderer/modals/Receive/steps/StepReceiveFunds";
import { Data as DefaultData, StepId as DefaultStepId } from "~/renderer/modals/Receive/Body";
import StepReceiveStakingFlow, {
  StepReceiveStakingFooter,
} from "~/renderer/modals/Receive/steps/StepReceiveStakingFlow";
import invariant from "invariant";
import { updateAccountWithUpdater } from "~/renderer/actions/accounts";
import { addPendingOperation } from "@ledgerhq/coin-framework/lib-es/account/pending";
import StepAssociateConfirmation, {
  StepAssociateConfirmationFooter,
} from "~/renderer/families/hedera/ReceiveModal/steps/StepAssociateConfirmation";
import { UserRefusedOnDevice } from "@ledgerhq/live-common/lib-es/device/use-cases/screenSpecs";
import logger from "~/renderer/logger";

type CustomStepId = "associateDevice" | "associateConfirmation";

export type StepId = DefaultStepId | CustomStepId;

export type Data = DefaultData;

type OwnProps = {
  stepId: StepId;
  onClose?: () => void | undefined;
  onChangeStepId: (a: StepId) => void;
  isAddressVerified: boolean | undefined | null;
  verifyAddressError: Error | undefined | null;
  onChangeAddressVerified: (isAddressVerified?: boolean | null, err?: Error | null) => void;
  params: Data;
};

type StateProps = {
  t: TFunction;
  accounts: Account[];
  device: Device | undefined | null;
  closeModal: (a: string) => void;
};

export type Props = OwnProps & StateProps;

export type StepProps = {
  t: TFunction;
  transitionTo: (id: string) => void;
  device: Device | undefined | null;
  account: AccountLike | undefined | null;
  eventType?: string;
  parentAccount: Account | undefined | null;
  token: TokenCurrency | undefined | null;
  receiveTokenMode: boolean;
  receiveNFTMode: boolean;
  receiveOrdinalMode: boolean;
  isAssociateFlow: boolean;
  isAddressVerified: boolean | undefined | null;
  verifyAddressError: Error | undefined | null;
  transaction: Transaction | undefined | null;
  optimisticOperation: Operation | undefined;
  error: Error | undefined;
  status: TransactionStatus;
  signed: boolean;
  bridgePending: boolean;
  setSigned: (a: boolean) => void;
  onChangeTransaction: (a: Transaction) => void;
  onUpdateTransaction: (a: (a: Transaction) => Transaction) => void;
  onTransactionError: (a: Error) => void;
  onOperationBroadcasted: (a: Operation) => void;
  closeModal: () => void;
  onRetry: () => void;
  onSkipConfirm: () => void;
  onResetSkip: () => void;
  onChangeToken: (token?: TokenCurrency | null) => void;
  onChangeAccount: (account?: AccountLike | null, tokenAccount?: Account | null) => void;
  onChangeAddressVerified: (b?: boolean | null, a?: Error | null) => void;
  onClose: () => void;
  toggleAssociateFlow: (enable: true) => void;
  currencyName: string | undefined | null;
  isFromPostOnboardingEntryPoint?: boolean;
};

export type St = Step<StepId, StepProps>;

const createSteps = (isAssociateFlow: boolean): Array<St> => [
  {
    id: "warning",
    excludeFromBreadcrumb: true,
    component: StepWarning,
    footer: StepWarningFooter,
  },
  {
    id: "account",
    label: <Trans i18nKey="receive.steps.chooseAccount.title" />,
    component: StepAccount,
    noScroll: true,
    footer: StepAccountFooter,
  },
  {
    id: "device",
    label: <Trans i18nKey="receive.steps.connectDevice.title" />,
    excludeFromBreadcrumb: isAssociateFlow,
    component: StepConnectDevice,
    footer: StepConnectDeviceFooter,
    onBack: ({ transitionTo }: StepProps) => transitionTo("account"),
  },
  {
    id: "receive",
    label: <Trans i18nKey="receive.steps.receiveFunds.title" />,
    excludeFromBreadcrumb: isAssociateFlow,
    component: StepReceiveFunds,
  },
  {
    id: "associateDevice",
    label: <Trans i18nKey="receive.steps.connectDevice.title" />, // FIXME: i18n
    excludeFromBreadcrumb: !isAssociateFlow,
    component: StepAssociateToken,
    onBack: ({ transitionTo }: StepProps) => transitionTo("account"),
  },
  {
    id: "associateConfirmation",
    label: <>Associate</>, // FIXME: i18n
    excludeFromBreadcrumb: !isAssociateFlow,
    component: StepAssociateConfirmation,
    footer: StepAssociateConfirmationFooter,
  },
  {
    id: "stakingFlow",
    excludeFromBreadcrumb: true,
    component: StepReceiveStakingFlow,
    footer: StepReceiveStakingFooter,
  },
];

const mapStateToProps = createStructuredSelector({
  device: getCurrentDevice,
  accounts: accountsSelector,
});

const mapDispatchToProps = {
  closeModal,
};

const Body = ({
  t,
  stepId,
  device,
  accounts,
  closeModal,
  onChangeStepId,
  isAddressVerified,
  verifyAddressError,
  onChangeAddressVerified,
  params,
}: Props) => {
  const [optimisticOperation, setOptimisticOperation] = useState<Operation | null>(null);
  const [transactionError, setTransactionError] = useState<Error | null>(null);
  const [signed, setSigned] = useState(false);
  const [account, setAccount] = useState(() => (params && params.account) || accounts[0]);
  const [parentAccount, setParentAccount] = useState(() => params && params.parentAccount);
  const [disabledSteps, setDisabledSteps] = useState<number[]>([]);
  const [token, setToken] = useState<TokenCurrency | null>(null);
  const [hideBreadcrumb, setHideBreadcrumb] = useState<boolean | undefined>(false);
  const [title, setTitle] = useState("");
  const dispatch = useDispatch();

  const receiveTokenMode = !!params.receiveTokenMode;
  const subAccounts = !!account && "subAccounts" in account ? account.subAccounts ?? [] : [];
  const isTokenAssociated = subAccounts.some(item => item.token.id === token?.id);
  const isAssociateFlow = receiveTokenMode && !!token && !isTokenAssociated;
  const [steps, setSteps] = useState(() => createSteps(isAssociateFlow));

  const currency = getAccountCurrency(account);
  const currencyName = currency ? currency.name : undefined;

  const { transaction, status, updateTransaction, bridgeError, bridgePending } =
    useBridgeTransaction(() => {
      invariant(account, "hedera: account is required");

      const bridge = getAccountBridge(account, parentAccount);
      const transaction = bridge.createTransaction(account);

      return {
        account,
        parentAccount,
        transaction,
      };
    });

  const handleChangeAccount = useCallback(
    (account: Account | TokenAccount, parentAccount?: Account | null) => {
      setAccount(account);
      setParentAccount(parentAccount);
    },
    [setParentAccount, setAccount],
  );

  const handleChangeToken = useCallback((token?: TokenCurrency | null) => {
    setToken(token ?? null);
    updateTransaction(prev => {
      return {
        ...prev,
        properties: !!token
          ? ({
              name: "tokenAssociate",
              token,
            } satisfies Transaction["properties"])
          : undefined,
      };
    });
  }, []);

  const handleCloseModal = useCallback(() => {
    closeModal("MODAL_HEDERA_RECEIVE");
  }, [closeModal]);

  const handleStepChange = useCallback(
    (e: Step<StepId, StepProps>) => onChangeStepId(e.id),
    [onChangeStepId],
  );

  const handleResetSkip = useCallback(() => {
    setDisabledSteps([]);
  }, [setDisabledSteps]);

  const handleRetry = useCallback(() => {
    onChangeAddressVerified(null, null);
    setTransactionError(null);
    onChangeStepId("account");
  }, [onChangeAddressVerified]);

  const handleSkipConfirm = useCallback(() => {
    const connectStepIndex = steps.findIndex(
      step => step.id === "device" || step.id === "associateDevice",
    );
    if (connectStepIndex > -1) {
      onChangeAddressVerified(false, null);
      setDisabledSteps([connectStepIndex]);
    }
    onChangeStepId("receive");
  }, [onChangeAddressVerified, setDisabledSteps, steps, onChangeStepId]);

  const handleTransactionError = useCallback((error: Error) => {
    if (!(error instanceof UserRefusedOnDevice)) {
      logger.critical(error);
    }
    setTransactionError(error);
  }, []);

  const handleOperationBroadcasted = useCallback(
    (optimisticOperation: Operation) => {
      if (!account) return;
      dispatch(
        updateAccountWithUpdater(account.id, account =>
          addPendingOperation(account, optimisticOperation),
        ),
      );
      setOptimisticOperation(optimisticOperation);
      setTransactionError(null);
    },
    [account, dispatch],
  );

  useEffect(() => {
    const stepId =
      params && params.startWithWarning ? "warning" : params.receiveTokenMode ? "account" : null;
    if (stepId) onChangeStepId(stepId);
  }, [onChangeStepId, params]);

  useEffect(() => {
    if (!account) {
      if (params && params.account) {
        handleChangeAccount(params.account, params?.parentAccount);
      } else {
        handleChangeAccount(accounts[0]);
      }
    }
  }, [accounts, account, params, handleChangeAccount]);

  useEffect(() => {
    const currentStep = steps.find(step => step.id === stepId);

    if (stepId !== "associateDevice") {
      setHideBreadcrumb(currentStep?.excludeFromBreadcrumb);
    }

    switch (stepId) {
      case "warning":
        setTitle(t("common.information"));
        break;
      case "associateDevice":
        // FIXME: i18n
        setTitle("Associate token");
        break;
      case "stakingFlow":
        setTitle(
          t("receive.steps.staking.title", {
            currencyName: currency.name,
          }),
        );
        break;
      default:
        setTitle(t("receive.title"));
    }
  }, [steps, stepId, t, currency.name]);

  useEffect(() => {
    const updatedSteps = createSteps(isAssociateFlow);
    setSteps(updatedSteps);
  }, [isAssociateFlow]);

  const error = transactionError || bridgeError;
  const errorSteps = [];
  if (transactionError) {
    errorSteps.push(2);
  } else if (bridgeError) {
    errorSteps.push(0);
  }

  const stepperProps = {
    title,
    device,
    account,
    parentAccount,
    eventType: params.eventType,
    stepId,
    steps,
    error,
    errorSteps,
    disabledSteps,
    receiveTokenMode,
    receiveNFTMode: !!params.receiveNFTMode,
    receiveOrdinalMode: !!params.receiveOrdinalMode,
    hideBreadcrumb,
    token,
    isAddressVerified,
    verifyAddressError,
    isAssociateFlow,
    optimisticOperation,
    transaction,
    status,
    bridgePending,
    signed,
    setSigned,
    onOperationBroadcasted: handleOperationBroadcasted,
    onTransactionError: handleTransactionError,
    closeModal: handleCloseModal,
    onRetry: handleRetry,
    onSkipConfirm: handleSkipConfirm,
    onResetSkip: handleResetSkip,
    onChangeAccount: handleChangeAccount,
    onChangeToken: handleChangeToken,
    onChangeAddressVerified,
    onStepChange: handleStepChange,
    onClose: handleCloseModal,
    currencyName,
    isFromPostOnboardingEntryPoint: !!params.isFromPostOnboardingEntryPoint,
  };

  return (
    <Stepper {...stepperProps}>
      <SyncSkipUnderPriority priority={100} />
      <Track onUnmount event="CloseModalReceive" />
    </Stepper>
  );
};
const C = compose(
  connect(mapStateToProps, mapDispatchToProps),
  withTranslation(),
)(Body) as React.ComponentType<OwnProps>;
export default C;
