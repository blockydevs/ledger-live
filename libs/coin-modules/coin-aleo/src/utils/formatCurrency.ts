import BigNumber from "bignumber.js";

export const formatCurrency = (value: string) => {
  const microcredits = parseInt(value.replace("u64", ""));
  return new BigNumber(microcredits);
};
