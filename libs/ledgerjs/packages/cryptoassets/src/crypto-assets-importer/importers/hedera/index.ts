import fs from "fs";
import path from "path";
import { fetchTokensFromCALService } from "../../fetch";

// FIXME: finish importer when CAL is ready

type HederaToken = [
  string, // tokenId
  string, // name
  string, // ticker
  number, // decimals
];

export const importHederaTokens = async (outputDir: string) => {
  try {
    console.log("importing hedera tokens...");
    const { tokens, hash } = await fetchTokensFromCALService({ blockchain_name: "hedera" }, [
      "contract_address",
      "name",
      "ticker",
      "decimals",
    ]);
    const hederaTokens: HederaToken[] = tokens.map(token => [
      token.contract_address.toLowerCase(),
      token.name,
      token.ticker.toLowerCase(),
      token.decimals,
    ]);

    const filePath = path.join(outputDir, "hedera");
    const hederaTypeStringified = `export type HederaToken = [
  string, // tokenId
  string, // name
  string, // ticker
  number, // decimals
];`;

    fs.writeFileSync(`${filePath}.json`, JSON.stringify(hederaTokens));
    if (hash) {
      fs.writeFileSync(`${filePath}-hash.json`, JSON.stringify(hash));
    }

    fs.writeFileSync(
      `${filePath}.ts`,
      `${hederaTypeStringified}

import tokens from "./hedera.json";

${hash ? `export { default as hash } from "./hedera-hash.json";` : ""}

export default tokens as HederaToken[];
`,
    );

    console.log("importing hedera tokens sucess");
  } catch (err) {
    console.error(err);
  }
};
