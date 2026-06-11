import { SwapProvider } from "@ledgerhq/live-common/e2e/enum/Provider";
import { runSwapTokenApprovalFlow } from "./swapTokenApprovalFlow";

const fromAccount = TokenAccount.ETH_USDC_1;
const toAccount = Account.ETH_1;
const eligibleProviders = [
  SwapProvider.THORCHAIN,
  SwapProvider.UNISWAP,
  SwapProvider.LIFI,
  SwapProvider.OKX,
  SwapProvider.ONE_INCH,
  SwapProvider.VELORA,
];

const swapTokenApprovalFlowTestConfig = {
  fromAccount,
  toAccount,
  providers: eligibleProviders,
  tmsLinks: ["B2CQA-5632"],
  tags: ["@NanoSP", "@LNS", "@NanoX", "@Stax", "@Flex", "@NanoGen5", "@ethereum", "@family-evm"],
};

runSwapTokenApprovalFlow(
  swapTokenApprovalFlowTestConfig.fromAccount,
  swapTokenApprovalFlowTestConfig.toAccount,
  swapTokenApprovalFlowTestConfig.providers,
  swapTokenApprovalFlowTestConfig.tmsLinks,
  swapTokenApprovalFlowTestConfig.tags,
);
