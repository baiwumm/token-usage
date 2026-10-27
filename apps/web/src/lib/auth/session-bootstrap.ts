"use client";

// Shared auth bootstrap for the protected client pages: resolve the browser
// session once, bounce to /login (carrying ?next=) when it is missing, and
// hand the access token to the page. Data loading chains off the returned
// token via an effect — the same pattern the dashboard uses.

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { authBrowserClient } from "./browser";
import { LOGIN_PATH } from "./next-path";

/**
 * @param target the page path restored after the login hop (e.g. "/sessions")
 * @param onNoClient invoked when the browser auth env is missing (prerender
 *   edge case); pass a stable setter — pages that must render an error state
 *   instead of redirecting use this, the default redirects to /login.
 */
export function useSessionBootstrap(
  target: string,
  onNoClient?: () => void,
): {
  accessToken: string | null;
  redirectToLogin: () => void;
} {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const redirectToLogin = useCallback(() => {
    router.replace(`${LOGIN_PATH}?next=${encodeURIComponent(target)}`);
  }, [router, target]);

  useEffect(() => {
    const supabase = authBrowserClient();

    if (!supabase) {
      if (onNoClient) onNoClient();
      else redirectToLogin();

      return;
    }

    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        redirectToLogin();

        return;
      }
      setAccessToken(session.access_token);
    })();
  }, [onNoClient, redirectToLogin]);

  return { accessToken, redirectToLogin };
}
