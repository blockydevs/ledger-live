import React from "react";
import { AleoFamily } from "./types";
import { Box, Text } from "@ledgerhq/react-ui/index";
import { Trans } from "react-i18next";

const mapFunctionIdToName: Record<string, string> = {
  public: "aleo.operations.type.public",
  private: "aleo.operations.type.private",
};

const MyCustomMetadataCell: AleoFamily["CustomMetadataCell"] = props => {
  return (
    <Box width={90}>
      <Text color="neutral.c80" textAlign="center" display="block" variant="body" fontSize={3}>
        <Trans i18nKey={mapFunctionIdToName[props.operation.extra.networkType ?? "public"]} />
      </Text>
    </Box>
  );
};

export default MyCustomMetadataCell;
