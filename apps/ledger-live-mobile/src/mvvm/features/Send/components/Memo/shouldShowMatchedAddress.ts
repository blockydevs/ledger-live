type ShouldShowMatchedAddressArgs = Readonly<{
  showMatchedAddress: boolean;
  hasMemo: boolean;
  hasFilledMemo: boolean;
  hasMemoError: boolean;
}>;

export function shouldShowMatchedAddress({
  showMatchedAddress,
  hasMemo,
  hasFilledMemo,
  hasMemoError,
}: ShouldShowMatchedAddressArgs): boolean {
  if (!showMatchedAddress) return false;
  if (!hasMemo) return true;
  return hasFilledMemo && !hasMemoError;
}
