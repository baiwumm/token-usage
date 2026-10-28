"use client";

// Bottom-of-tab footer (2026-10-27 operator call): the reset lives below both
// cards and needs an explicit confirmation before wiping the local prefs.

import { AlertDialog, Button, Typography, toast } from "@heroui/react";
import { useTheme } from "next-themes";

import { APPEARANCE_COPY } from "@/lib/copy/appearance";
import { useLocalePreference } from "@/lib/copy/locale";
import { useFormat } from "@/lib/format/format";
import { useRefreshPreferencesStore } from "@/stores/refresh-preferences-store";

export function PreferencesFooter() {
  const { locale, setPreference } = useLocalePreference();
  const copy = APPEARANCE_COPY[locale];
  const { setTheme } = useTheme();
  const { resetPreferences } = useFormat();
  const setRefreshOnVisible = useRefreshPreferencesStore(
    (state) => state.setRefreshOnVisible,
  );
  const setIntervalMinutes = useRefreshPreferencesStore(
    (state) => state.setIntervalMinutes,
  );

  const resetAll = () => {
    setTheme("system");
    setPreference("system");
    resetPreferences();
    setRefreshOnVisible(false);
    setIntervalMinutes(0);
    toast.success(copy.resetDone);
  };

  return (
    <div className="flex flex-col items-start justify-between gap-3 px-1 sm:flex-row sm:items-center">
      <Typography color="muted" type="body-xs">
        {copy.storageNote}
      </Typography>
      <AlertDialog>
        <Button size="sm" variant="danger">
          {copy.reset}
        </Button>
        <AlertDialog.Backdrop variant="blur">
          <AlertDialog.Container size="sm">
            <AlertDialog.Dialog>
              <AlertDialog.CloseTrigger />
              <AlertDialog.Header>
                <AlertDialog.Icon status="warning" />
                <AlertDialog.Heading>{copy.resetTitle}</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <Typography type="body-sm">{copy.resetBody}</Typography>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="tertiary">
                  {copy.resetCancel}
                </Button>
                <Button slot="close" variant="danger" onPress={resetAll}>
                  {copy.resetConfirm}
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </div>
  );
}
