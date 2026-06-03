import { Features, FeatureId } from "@shared/feature-flags";
import { useState } from "react";

export interface JsonEditorPropsState {
  currentJsonFlag: string;
  diffJson: string;
  setCurrentJsonFlag: (json: string) => void;
  overrideWithJson: () => void;
  isJsonValid: boolean;
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
  const betterJson = JSON.stringify(resolved, null, 5);
  const [currentJsonFlag, setCurrentJsonFlag] = useState(betterJson);
  const overrideWithJson = () => {
    try {
      console.log("Applying override with JSON", currentJsonFlag);
      const parsed = JSON.parse(currentJsonFlag);
      setOverride(id, parsed);
      console.log("Override applied with JSON", parsed);
    } catch (error) {
      console.error("Invalid JSON", error);
    }
  };
  const isJsonValid = (() => {
    try {
      JSON.parse(currentJsonFlag);
      return true;
    } catch {
      return false;
    }
  })();

  const diffJson = JSON.stringify(
    {
      enabled: resolved.enabled,
    },
    null,
    2,
  );
  return { currentJsonFlag, diffJson, setCurrentJsonFlag, overrideWithJson, isJsonValid };
}
