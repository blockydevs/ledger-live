import { Features, FeatureId, FEATURE_FLAGS_DEFAULTS } from "@shared/feature-flags";
import { useState } from "react";
import { diffJsonLines } from "../utils";
import type { DiffLine } from "../utils/diff";

const JSON_INDENT = 2;

/** Selectable baselines the editor can diff the in-memory flag against. */
export type DiffTarget = "resolved" | "default";

export interface JsonEditorPropsState {
  currentJsonFlag: string;
  diffJson: DiffLine[];
  diffTarget: DiffTarget;
  setDiffTarget: (target: DiffTarget) => void;
  setCurrentJsonFlag: (json: string) => void;
  overrideWithJson: () => void;
  resetJson: () => void;
  isJsonValid: boolean;
  applyDisabled: boolean;
  toggleFeatureFlag: (enabled: boolean) => void;
}

export interface JsonEditorProps {
  id: FeatureId;
  resolved: Features[FeatureId];
  setOverride: <T extends FeatureId>(key: T, value: Features[T] | undefined) => void;
}

export function useJsonEditor({
  id,
  resolved,
  setOverride,
}: JsonEditorProps): JsonEditorPropsState {
  const [draft, setDraft] = useState<string | null>(null);
  const [diffTarget, setDiffTarget] = useState<DiffTarget>("default");

  const currentJsonFlag = draft ?? JSON.stringify(resolved, null, JSON_INDENT);

  const parsed = (() => {
    try {
      return JSON.parse(currentJsonFlag);
    } catch {
      return undefined;
    }
  })();

  const isJsonValid = parsed !== undefined;

  const overrideWithJson = () => {
    if (parsed === undefined) {
      console.error("Invalid JSON", currentJsonFlag);
      return;
    }
    setOverride(id, parsed);
    setDraft(null);
  };

  const resetJson = () => setDraft(null);

  // The diff baseline (left side). "resolved" is the current resolved value
  // (override included); "default" is the registered schema default — the
  // bottom of the resolution chain. The exact "resolved without override"
  // baseline is deferred until the slice persists it (env/remote live in the
  // middleware and aren't reachable here).
  const base = diffTarget === "default" ? FEATURE_FLAGS_DEFAULTS[id] : resolved;
  const baseJson = JSON.stringify(base, null, JSON_INDENT);
  const diffJson = diffJsonLines(baseJson, currentJsonFlag);

  const applyDisabled = parsed === undefined || JSON.stringify(parsed) === JSON.stringify(resolved);

  const toggleFeatureFlag = (enabled: boolean) => {
    setOverride(id, { ...resolved, enabled });
    const next = parsed === undefined ? { ...resolved, enabled } : { ...parsed, enabled };
    setDraft(JSON.stringify(next, null, JSON_INDENT));
  };

  return {
    currentJsonFlag,
    diffJson,
    diffTarget,
    setDiffTarget,
    setCurrentJsonFlag: setDraft,
    overrideWithJson,
    resetJson,
    isJsonValid,
    applyDisabled,
    toggleFeatureFlag,
  };
}
