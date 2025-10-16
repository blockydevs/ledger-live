export type HederaERC20Token = [
  string, // id
  string, // address
  string, // name
  string, // ticker
  string, // network
  number, // decimals
  boolean, // delisted
];

import tokens from "./hedera-erc20.json";

export { default as hash } from "./hedera-erc20-hash.json";

export default tokens as HederaERC20Token[];
