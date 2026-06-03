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
  const betterJson = JSON.stringify(resolved, null, JSON_INDENT);
  const [currentJsonFlag, setCurrentJsonFlag] = useState(betterJson);
  const [diffTarget, setDiffTarget] = useState<DiffTarget>("resolved");

  const overrideWithJson = () => {
    try {
      const parsed = JSON.parse(currentJsonFlag);
      setOverride(id, parsed);
    } catch (error) {
      console.error("Invalid JSON", error);
    }
  };
  // Clears the editor draft back to the resolved value. Does not touch the
  // Redux override — that's clearOverride's job.
  const resetJson = () => setCurrentJsonFlag(betterJson);
  const isJsonValid = (() => {
    try {
      JSON.parse(currentJsonFlag);
      return true;
    } catch {
      return false;
    }
  })();

  // The diff baseline (left side). "resolved" is the current resolved value
  // (override included); "default" is the registered schema default — the
  // bottom of the resolution chain. The exact "resolved without override"
  // baseline is deferred until the slice persists it (env/remote live in the
  // middleware and aren't reachable here).
  const base = diffTarget === "default" ? FEATURE_FLAGS_DEFAULTS[id] : resolved;
  const baseJson = JSON.stringify(base, null, JSON_INDENT);
  const diffJson = diffJsonLines(baseJson, currentJsonFlag);

  // Single entry point for the enabled switch: applies the override live (same
  // behaviour as the flag-list switch) and keeps the editor draft in sync —
  // both driven from the same `enabled` value, so they can't drift. Falls back
  // to the resolved value when the draft isn't currently valid JSON.
  const toggleFeatureFlag = (enabled: boolean) => {
    setOverride(id, { ...resolved, enabled });
    try {
      const parsed = JSON.parse(currentJsonFlag);
      setCurrentJsonFlag(JSON.stringify({ ...parsed, enabled }, null, JSON_INDENT));
    } catch {
      setCurrentJsonFlag(JSON.stringify({ ...resolved, enabled }, null, JSON_INDENT));
    }
  };

  return {
    currentJsonFlag,
    diffJson,
    diffTarget,
    setDiffTarget,
    setCurrentJsonFlag,
    overrideWithJson,
    resetJson,
    isJsonValid,
    toggleFeatureFlag,
  };
}
