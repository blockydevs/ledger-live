import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Memo } from "@ledgerhq/live-common/flows/send/types";
import { useDoNotAskAgainSkipMemo } from "./useDoNotAskAgainSkipMemo";

export type SkipMemoState = "propose" | "toConfirm" | "confirmed";

type UseRecipientMemoProps = Readonly<{
  hasMemo: boolean;
  memoDefaultOption?: string;
  memoType?: string;
  memoTypeOptions?: readonly string[];
  onMemoChange: (memo: Memo) => void;
  onMemoSkip: () => void;
  resetKey: string;
}>;

type UseRecipientMemoResult = Readonly<{
  memo: Memo;
  hasMemoTypeOptions: boolean;
  showMemoValueInput: boolean;
  showSkipMemo: boolean;
  skipMemoState: SkipMemoState;
  hasFilledMemo: boolean;
  onMemoValueChange: (value: string) => void;
  onMemoTypeChange: (type: string) => void;
  onSkipMemoRequestConfirm: () => void;
  onSkipMemoCancelConfirm: () => void;
  onSkipMemoConfirm: (doNotAskAgain: boolean) => void;
  resetViewState: () => void;
}>;

function buildDefaultMemo(memoDefaultOption?: string): Memo {
  return { value: "", type: memoDefaultOption };
}

export function useRecipientMemo({
  hasMemo,
  memoDefaultOption,
  memoType,
  memoTypeOptions,
  onMemoChange,
  onMemoSkip,
  resetKey,
}: UseRecipientMemoProps): UseRecipientMemoResult {
  const [memo, setMemo] = useState<Memo>(() => buildDefaultMemo(memoDefaultOption));
  const [skipMemoState, setSkipMemoState] = useState<SkipMemoState>("propose");

  const lastResetKeyRef = useRef<string>(resetKey);
  useEffect(() => {
    if (lastResetKeyRef.current === resetKey) return;
    lastResetKeyRef.current = resetKey;
    const nextDefaultMemo = buildDefaultMemo(memoDefaultOption);
    setMemo(nextDefaultMemo);
    setSkipMemoState("propose");
    onMemoChange(nextDefaultMemo);
  }, [resetKey, memoDefaultOption, onMemoChange]);

  const hasMemoTypeOptions = Boolean(memoType === "typed" && memoTypeOptions?.length);

  const showMemoValueInput = memo.type !== "NO_MEMO";

  const showSkipMemo = hasMemo && memo.value.length === 0 && memo.type !== "NO_MEMO";

  const hasFilledMemo = useMemo(() => {
    if (!hasMemo) return true;
    return memo.value.length > 0 || memo.type === "NO_MEMO";
  }, [hasMemo, memo.type, memo.value.length]);

  const onMemoValueChange = useCallback(
    (value: string) => {
      if (skipMemoState !== "propose") {
        setSkipMemoState("propose");
      }

      const next: Memo = { ...memo, value };
      setMemo(next);
      onMemoChange(next);
    },
    [memo, onMemoChange, skipMemoState],
  );

  const onMemoTypeChange = useCallback(
    (type: string) => {
      if (skipMemoState !== "propose") {
        setSkipMemoState("propose");
      }

      const next: Memo = { value: "", type };
      setMemo(next);
      onMemoChange(next);
    },
    [onMemoChange, skipMemoState],
  );

  const [doNotAskAgainSkipMemo, setDoNotAskAgainSkipMemo] = useDoNotAskAgainSkipMemo();

  const onSkipMemoCancelConfirm = useCallback(() => {
    setSkipMemoState("propose");
  }, []);

  const onSkipMemoConfirm = useCallback(
    (doNotAskAgain: boolean) => {
      if (doNotAskAgainSkipMemo !== doNotAskAgain) {
        setDoNotAskAgainSkipMemo(doNotAskAgain);
      }

      setSkipMemoState("confirmed");
      const next: Memo = { value: "", type: "NO_MEMO" };
      setMemo(next);
      onMemoChange(next);
      onMemoSkip();
    },
    [onMemoChange, onMemoSkip, setDoNotAskAgainSkipMemo, doNotAskAgainSkipMemo],
  );

  const onSkipMemoRequestConfirm = useCallback(() => {
    if (doNotAskAgainSkipMemo) {
      onSkipMemoConfirm(doNotAskAgainSkipMemo);
    } else {
      setSkipMemoState("toConfirm");
    }
  }, [doNotAskAgainSkipMemo, onSkipMemoConfirm]);

  const resetViewState = useCallback(() => {
    if (skipMemoState === "confirmed") {
      const defaultMemo = buildDefaultMemo(memoDefaultOption);
      setMemo(defaultMemo);
      onMemoChange(defaultMemo);
      setSkipMemoState("propose");
    }
  }, [memoDefaultOption, onMemoChange, skipMemoState]);

  return {
    memo,
    hasMemoTypeOptions,
    showMemoValueInput,
    showSkipMemo,
    skipMemoState,
    hasFilledMemo,
    onMemoValueChange,
    onMemoTypeChange,
    onSkipMemoRequestConfirm,
    onSkipMemoCancelConfirm,
    onSkipMemoConfirm,
    resetViewState,
  };
}
