import { useCallback } from "react";
import { useUiSettings, useUpdateUiSettings } from "@/shared/preferences/uiPreferences";

export function useHiddenFolders() {
  const hideHidden = useUiSettings().hideHiddenFolders;
  const updateUiSettings = useUpdateUiSettings();

  const toggleHidden = useCallback(
    () => updateUiSettings({ hideHiddenFolders: !hideHidden }),
    [hideHidden, updateUiSettings],
  );

  return { hideHidden, toggleHidden };
}
