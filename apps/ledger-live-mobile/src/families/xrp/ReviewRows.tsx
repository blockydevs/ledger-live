import React from "react";
import { Banner, Box, Text } from "@ledgerhq/lumen-ui-rnative";
import { useTranslation } from "~/context/Locale";

export function Row({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <Box lx={{ flexDirection: "row", justifyContent: "space-between", gap: "s16" }}>
      <Text typography="body2" lx={{ color: "muted" }}>
        {label}
      </Text>
      <Box lx={{ flexShrink: 1, alignItems: "flex-end" }}>{children}</Box>
    </Box>
  );
}

export function Value({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <Text typography="body2SemiBold" lx={{ color: "base", textAlign: "right" }}>
      {children}
    </Text>
  );
}

export function ErrorBanner({ error, warning }: Readonly<{ error: Error; warning?: boolean }>) {
  const { t, i18n } = useTranslation();
  const values = { ...error, message: error.message };
  const titleKey = `errors.${error.name}.title`;
  const descriptionKey = `errors.${error.name}.description`;

  return (
    <Banner
      appearance={warning ? "warning" : "error"}
      title={t(i18n.exists(titleKey) ? titleKey : "errors.generic.title", values)}
      description={i18n.exists(descriptionKey) ? t(descriptionKey, values) : undefined}
    />
  );
}
