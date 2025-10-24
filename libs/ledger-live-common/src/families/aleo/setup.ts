// Goal of this file is to inject all necessary device/signer dependency to coin-modules
import makeCliTools from "@ledgerhq/coin-aleo/test/cli";
import aleoResolver from "@ledgerhq/coin-aleo/signer/index";
import Aleo from "@ledgerhq/hw-app-aleo";
import Transport from "@ledgerhq/hw-transport";
import { CreateSigner, createResolver } from "../../bridge/setup";
import { Resolver } from "../../hw/getAddress/types";

const createSigner: CreateSigner<Aleo> = (transport: Transport) => {
  return new Aleo(transport);
};

const resolver: Resolver = createResolver(createSigner, aleoResolver);

const cliTools = makeCliTools();

export { cliTools, resolver };
