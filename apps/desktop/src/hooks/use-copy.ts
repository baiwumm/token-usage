// Clipboard write with a short-lived "copied" flag for button feedback. The
// copied text always stays selectable, so a refused write (no user gesture,
// webview policy) degrades to manual copy instead of an error.

import { useCallback, useEffect, useRef, useState } from "react";

const RESET_MS = 1_500;

export function useCopy() {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    },
    [],
  );

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return false;
    }
    setCopied(true);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => setCopied(false), RESET_MS);

    return true;
  }, []);

  return { copied, copy };
}
