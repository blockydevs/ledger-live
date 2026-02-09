const TIME_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
};

const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  month: "2-digit",
  day: "2-digit",
  year: "2-digit",
};

export const formatSyncTime = (date: Date | null | undefined): string | null => {
  if (!date) return null;
  return date.toLocaleTimeString("en-US", TIME_FORMAT_OPTIONS);
};

export const formatSyncDate = (date: Date | null | undefined): string | null => {
  if (!date) return null;
  return date.toLocaleDateString("en-US", DATE_FORMAT_OPTIONS);
};

export interface FormattedSyncInfo {
  time: string | null;
  date: string | null;
}

export const formatSyncInfo = (date: Date | null | undefined): FormattedSyncInfo => ({
  time: formatSyncTime(date),
  date: formatSyncDate(date),
});
