import { getEnv } from "@ledgerhq/live-env";
import calService from "@ledgerhq/ledger-cal-service";
import { loadPKI } from "@ledgerhq/hw-bolos";
import { Account } from "@ledgerhq/types-live"; // adjust import if needed
import { DeviceModelId } from "@ledgerhq/types-devices";
import Exchange from "@ledgerhq/hw-app-exchange";

export async function handleHederaTrustedFlow({
  exchange,
  hederaAccount,
  deviceModelId,
}: {
  exchange: Exchange;
  hederaAccount: Account;
  deviceModelId: DeviceModelId;
}) {
  const serviceEnv = getEnv("MOCK_EXCHANGE_TEST_CONFIG") ? "test" : "prod";

  const cert = await calService.getCertificate(deviceModelId, "trusted_name", "latest", {
    env: serviceEnv,
    signatureKind: serviceEnv,
  });

  await loadPKI(exchange.transport, "TRUSTED_NAME", cert.descriptor, cert.signature);

  const challenge = await exchange.getChallenge();
  const hexChallenge = `${challenge.toString(16)}`;

  const trustServiceResult = await fetch(
    `https://nft.api.live.ledger-stg.com/v2/hedera/pubkey/${hederaAccount.freshAddress}?challenge=${hexChallenge}`,
  ).then(
    res =>
      res.json() as Promise<{
        descriptorType: "TrustedDomainName";
        descriptorVersion: number;
        account: string;
        key: string;
        signedDescriptor: string;
      }>,
  );

  const signedDescriptorBuffer = Buffer.from(trustServiceResult.signedDescriptor, "hex");
  await exchange.sendTrustedDescriptor(signedDescriptorBuffer);
}
