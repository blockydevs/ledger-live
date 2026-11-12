import React from "react";
import { Trans } from "react-i18next";
import styled from "styled-components";
import type { Unit } from "@domain/entity-currency-unit";
import { MAX_TRUST_LIMIT_VALUE } from "@ledgerhq/live-common/families/xrp/logicPublic";
import { useSelector } from "LLD/hooks/redux";
import { localeSelector } from "~/renderer/reducers/settings";
import { toScientificParts } from "./utils";

// Raised by position: vertical-align super changes the height of the line
const Exponent = styled.sup`
  position: relative;
  top: -0.45em;
  font-size: 0.75em;
  line-height: 0;
  vertical-align: baseline;
`;

export default function MaxTrustLimitInfo({ unit }: { unit: Unit }) {
  const locale = useSelector(localeSelector);

  const { mantissa, exponent } = toScientificParts(
    MAX_TRUST_LIMIT_VALUE.shiftedBy(-unit.magnitude),
    locale,
  );

  return (
    <Trans
      i18nKey="xrp.addToken.steps.settings.maxLimitInfo"
      values={{ mantissa, exponent }}
      components={{ exponent: <Exponent /> }}
    />
  );
}
