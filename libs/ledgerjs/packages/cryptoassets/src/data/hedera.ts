export type HederaToken = [
  string, // tokenId
  string, // name
  string, // ticker
  number, // decimals
];

import tokens from "./hedera.json";

export { default as hash } from "./hedera-hash.json";

export default tokens as HederaToken[];
