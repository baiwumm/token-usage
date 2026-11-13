"use client";

// /login form body (docs/ui-spec.md 登录页): email+password / magic link,
// forgot-password reset, and OAuth sign-in (GitHub / Google via
// signInWithOAuth through the shared /auth/callback PKCE route). Auth logic
// is frozen from the pre-redesign login-form.tsx (same handlers, same ?next=
// and callback-error plumbing) — the shell is a Card beside the brand
// column, fields use InputGroup icon prefixes, OAuth rows are full-width.

import type { SVGProps } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { Envelope, Lock } from "@gravity-ui/icons";
import {
  Button,
  Card,
  Description,
  ErrorMessage,
  Form,
  InputGroup,
  Label,
  Separator,
  Spinner,
  Tabs,
  TextField,
  Typography,
} from "@heroui/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { authBrowserClient } from "@/lib/auth/browser";
import { urlWithNext } from "@/lib/auth/next-path";
import { LOGIN_COPY, type LoginCopy } from "@/lib/copy/login";
import { useLocale, type Locale } from "@/lib/copy/locale";

type Mode = "password" | "magic";
type SentKind = null | "magic" | "reset";

// Filing numbers for the page footer (2026-11-13): deployment-specific, so
// each line renders only when its env var is set. Static `process.env.X`
// member access keeps Next's build-time inlining working — dynamic indexing
// would read undefined inside the client bundle. Values are public and
// inlined at build time, so changing one needs a redeploy.
const BEIAN_ICP = process.env.NEXT_PUBLIC_BEIAN_ICP?.trim() ?? "";
const BEIAN_POLICE = process.env.NEXT_PUBLIC_BEIAN_POLICE?.trim() ?? "";
// The police link takes just the digits of the number as its query param.
const BEIAN_POLICE_CODE = BEIAN_POLICE.match(/\d+/)?.[0] ?? "";

// Paint delay between the OAuth state landing and the browser leaving for
// the provider: short enough to feel instant, long enough that the spinner
// and the locked siblings are actually seen on fast connections.
const OAUTH_REDIRECT_DELAY_MS = 150;

// The browser client is built lazily on the first auth call and initializes
// itself in the background. A session cookie left behind by an expired or
// revoked login is torn down during that init (auth-js `_removeSession` also
// clears every pending PKCE verifier). Every PKCE flow — magic link, password
// reset, OAuth — writes its verifier right before redirecting, so a teardown
// landing after that write deletes the verifier and /auth/callback answers
// `auth_exchange_failed`: the first attempt dies with 「登录链接无效或已过期」
// and only a second one works. Draining the init chain first makes the
// teardown happen before the verifier exists.
async function settleAuthClient(client: SupabaseClient): Promise<void> {
  try {
    await client.auth.initialize();
  } catch {
    // Initialization is best-effort; the sign-in call reports its own errors.
  }
}

function mapAuthError(status: number, locale: Locale): string {
  const copy = LOGIN_COPY[locale];

  if (status === 400 || status === 401 || status === 403) {
    return copy.errorInvalidCredentials;
  }
  if (status === 422 || status === 429) {
    return copy.errorRateLimited;
  }

  return copy.errorGeneric;
}

// /auth/callback forwards GoTrue provider errors as `oauth_<code>`; known
// ones get specific copy, everything else (including the local
// auth_code_missing / auth_exchange_failed) falls back to the generic line.
function mapCallbackError(code: string, copy: LoginCopy): string {
  if (code === "oauth_signup_disabled") {
    return copy.errorSignupClosed;
  }
  if (code === "oauth_access_denied") {
    return copy.errorAccessDenied;
  }

  return copy.errorCallback;
}

export interface LoginBodyProps {
  /** Sanitized post-login target, resolved in login-client from ?next=. */
  next: string;
  /** Non-null when the last /auth/callback exchange failed (?error=). */
  callbackError: string | null;
}

export function LoginBody({ next, callbackError }: LoginBodyProps) {
  const router = useRouter();
  const [locale] = useLocale();
  const copy = LOGIN_COPY[locale];

  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  // OAuth in-flight provider: feeds its button's spinner and locks every
  // other sign-in control until the browser navigates away or it resolves.
  const [oauthPending, setOauthPending] = useState<null | "github" | "google">(
    null,
  );
  const [error, setError] = useState<string | null>(
    callbackError ? mapCallbackError(callbackError, copy) : null,
  );
  const [sentKind, setSentKind] = useState<SentKind>(null);

  // Settle the client as soon as the page is up: the visitor typically lands
  // here because a session just died, and the client's initialization is what
  // clears that dead session (and its PKCE verifiers). Doing it on mount means
  // the first sign-in click carries no extra round trip, and the stale cookie
  // is gone before any flow starts.
  useEffect(() => {
    const client = authBrowserClient();

    if (client) void settleAuthClient(client);
  }, []);

  function switchMode(target: Mode) {
    if (target === mode) return;
    setMode(target);
    setError(null);
  }

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    const supabase = authBrowserClient();

    if (!supabase || busy || oauthPending) return;
    setBusy(true);
    setError(null);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(mapAuthError(authError.status ?? 0, locale));
      setBusy(false);

      return;
    }
    router.replace(next);
    router.refresh();
  }

  async function submitMagic() {
    const supabase = authBrowserClient();

    if (!supabase || busy || oauthPending) return;
    setBusy(true);
    setError(null);
    await settleAuthClient(supabase);

    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}${urlWithNext("/auth/callback", next)}`,
      },
    });

    setBusy(false);
    if (authError) {
      setError(mapAuthError(authError.status ?? 0, locale));

      return;
    }
    setSentKind("magic");
  }

  // Recovery email: opening the link signs the user in (recovery session) and
  // lands on 账户设置, where the password card sets a new password. Works for
  // magic-link-only accounts that never had a password.
  async function submitPasswordReset() {
    const supabase = authBrowserClient();

    if (!supabase || busy || oauthPending) return;
    setBusy(true);
    setError(null);
    await settleAuthClient(supabase);

    const { error: authError } = await supabase.auth.resetPasswordForEmail(
      email,
      {
        redirectTo: `${window.location.origin}${urlWithNext("/auth/callback", "/settings")}`,
      },
    );

    setBusy(false);
    if (authError) {
      setError(mapAuthError(authError.status ?? 0, locale));

      return;
    }
    setSentKind("reset");
  }

  // OAuth sign-in (GitHub / Google): PKCE flow through the shared
  // /auth/callback route — signInWithOAuth builds the authorize URL and we
  // navigate manually after a short paint delay, because the auto-redirect
  // (window.location.href inside the same microtask chain as the state
  // update) wins the paint race on fast connections and the pending state
  // never becomes visible. oauthPending (not busy) drives the state here so
  // only the clicked button spins; the guard makes a double click a no-op,
  // and even a second real launch would just replace the session, never
  // create a duplicate one. ?next= survives the hop; provider-side failures
  // come back through the callback as ?error=.
  async function submitOAuth(provider: "github" | "google") {
    const supabase = authBrowserClient();

    if (!supabase || busy || oauthPending) return;
    setOauthPending(provider);
    setError(null);
    await settleAuthClient(supabase);

    const { data, error: authError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}${urlWithNext("/auth/callback", next)}`,
        skipBrowserRedirect: true,
      },
    });

    if (authError || !data.url) {
      setOauthPending(null);
      if (authError) {
        setError(mapAuthError(authError.status ?? 0, locale));
      } else {
        setError(copy.errorGeneric);
      }

      return;
    }

    // One paint of the pending state before leaving; on slow networks the
    // spinner simply stays until the provider page takes over.
    await new Promise((resolve) =>
      setTimeout(resolve, OAUTH_REDIRECT_DELAY_MS),
    );
    window.location.href = data.url;
  }

  const emailField = (
    <TextField
      isRequired
      className="flex flex-col gap-1.5"
      name="email"
      type="email"
      value={email}
      onChange={setEmail}
    >
      <Label>{copy.emailLabel}</Label>
      <InputGroup variant="secondary">
        <InputGroup.Prefix>
          <Envelope aria-hidden="true" className="size-4 text-muted" />
        </InputGroup.Prefix>
        <InputGroup.Input
          autoComplete="email"
          placeholder={copy.emailPlaceholder}
        />
      </InputGroup>
    </TextField>
  );

  const sentCopy =
    sentKind === "reset"
      ? { title: copy.resetSentTitle, body: copy.resetSentBody }
      : { title: copy.sentTitle, body: copy.sentBody };

  return (
    <div className="relative flex min-w-0 flex-1 flex-col justify-center px-6 py-12 sm:px-10 lg:px-16">
      <div className="login-enter mx-auto w-full max-w-md">
        <Card className="p-6 sm:p-8">
          <Card.Header>
            <Card.Title>{copy.formTitle}</Card.Title>
            <Card.Description>{copy.pageSubtitle}</Card.Description>
          </Card.Header>

          <Card.Content>
            {sentKind ? (
              <div className="flex flex-col gap-4">
                <Typography type="h4" weight="medium">
                  {sentCopy.title}
                </Typography>
                <Typography color="muted" type="body-sm">
                  {sentCopy.body}
                </Typography>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onPress={() => {
                      setSentKind(null);
                    }}
                  >
                    {copy.sentBack}
                  </Button>
                  <Button
                    isPending={busy}
                    onPress={() => {
                      if (sentKind === "magic") void submitMagic();
                      else void submitPasswordReset();
                    }}
                  >
                    {({ isPending }) => (
                      <>
                        {isPending ? (
                          <Spinner color="current" size="sm" />
                        ) : null}
                        {copy.sentResend}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-5">
                  <Tabs
                    selectedKey={mode}
                    onSelectionChange={(key) => switchMode(String(key) as Mode)}
                  >
                    <Tabs.ListContainer className="bg-default rounded-2xl p-1">
                      <Tabs.List
                        aria-label={copy.pageTitle}
                        className="w-auto p-0"
                      >
                        <Tabs.Tab id="password">
                          <span className="flex items-center gap-1.5">
                            <Lock aria-hidden="true" className="size-4" />
                            {copy.passwordMode}
                          </span>
                          <Tabs.Indicator />
                        </Tabs.Tab>
                        <Tabs.Tab id="magic">
                          <span className="flex items-center gap-1.5">
                            <Envelope aria-hidden="true" className="size-4" />
                            {copy.magicMode}
                          </span>
                          <Tabs.Indicator />
                        </Tabs.Tab>
                      </Tabs.List>
                    </Tabs.ListContainer>
                  </Tabs>

                  {error ? (
                    <ErrorMessage role="alert">{error}</ErrorMessage>
                  ) : null}

                  {mode === "password" ? (
                    <Form
                      className="flex flex-col gap-4"
                      onSubmit={submitPassword}
                    >
                      {emailField}
                      <TextField
                        isRequired
                        className="flex flex-col gap-1.5"
                        name="password"
                        type="password"
                        value={password}
                        onChange={setPassword}
                      >
                        <Label>{copy.passwordLabel}</Label>
                        <InputGroup variant="secondary">
                          <InputGroup.Prefix>
                            <Lock
                              aria-hidden="true"
                              className="size-4 text-muted"
                            />
                          </InputGroup.Prefix>
                          <InputGroup.Input
                            autoComplete="current-password"
                            placeholder={copy.passwordPlaceholder}
                          />
                        </InputGroup>
                      </TextField>
                      <Button
                        fullWidth
                        isDisabled={busy || oauthPending !== null}
                        isPending={busy}
                        type="submit"
                      >
                        {({ isPending }) => (
                          <>
                            {isPending ? (
                              <Spinner color="current" size="sm" />
                            ) : null}
                            {copy.passwordSubmit}
                          </>
                        )}
                      </Button>
                      <Button
                        className="h-auto min-w-0 self-start p-0 text-xs"
                        isDisabled={
                          busy || oauthPending !== null || email.length === 0
                        }
                        size="sm"
                        variant="ghost"
                        onPress={() => void submitPasswordReset()}
                      >
                        {copy.forgotPassword}
                      </Button>
                    </Form>
                  ) : (
                    <Form
                      className="flex flex-col gap-4"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void submitMagic();
                      }}
                    >
                      {emailField}
                      <Description>{copy.magicHint}</Description>
                      <Button
                        fullWidth
                        isDisabled={busy || oauthPending !== null}
                        isPending={busy}
                        type="submit"
                      >
                        {({ isPending }) => (
                          <>
                            {isPending ? (
                              <Spinner color="current" size="sm" />
                            ) : null}
                            {copy.magicSubmit}
                          </>
                        )}
                      </Button>
                    </Form>
                  )}
                </div>

                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center gap-3 pb-0.5">
                    <Separator className="min-w-0 flex-1" variant="secondary" />
                    <Typography
                      className="shrink-0"
                      color="muted"
                      type="body-xs"
                    >
                      {copy.oauthDivider}
                    </Typography>
                    <Separator className="min-w-0 flex-1" variant="secondary" />
                  </div>
                  <Button
                    fullWidth
                    isDisabled={busy || oauthPending !== null}
                    isPending={oauthPending === "github"}
                    variant="secondary"
                    onPress={() => void submitOAuth("github")}
                  >
                    {({ isPending }) => (
                      <>
                        {isPending ? (
                          <Spinner color="current" size="sm" />
                        ) : (
                          <GithubMark aria-hidden="true" className="size-4" />
                        )}
                        GitHub
                      </>
                    )}
                  </Button>
                  <Button
                    fullWidth
                    isDisabled={busy || oauthPending !== null}
                    isPending={oauthPending === "google"}
                    variant="secondary"
                    onPress={() => void submitOAuth("google")}
                  >
                    {({ isPending }) => (
                      <>
                        {isPending ? (
                          <Spinner color="current" size="sm" />
                        ) : (
                          <GoogleG aria-hidden="true" className="size-4" />
                        )}
                        Google
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </Card.Content>
        </Card>
      </div>

      {/* Bottom line: <lg stacks the site lockup above the filing numbers;
          from lg the left brand column already carries the lockup, so only
          the filing numbers show — anchored to the same baseline as that
          footer note (brand column `lg:py-8` ↔ `lg:bottom-8`). Each number
          disappears when its env var is unset. */}
      <div className="absolute inset-x-0 bottom-6 flex flex-col items-center gap-1 lg:bottom-8">
        <Typography
          className="text-center text-[10px] lg:hidden"
          color="muted"
          type="body-xs"
        >
          {copy.footerNote}
        </Typography>
        {BEIAN_ICP || (BEIAN_POLICE && BEIAN_POLICE_CODE) ? (
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            {BEIAN_ICP ? (
              <BeianLink
                href="https://beian.miit.gov.cn/"
                icon="/beian/icp.png"
                label={BEIAN_ICP}
              />
            ) : null}
            {BEIAN_POLICE && BEIAN_POLICE_CODE ? (
              <BeianLink
                href={`https://beian.mps.gov.cn/#/query/webSearch?code=${BEIAN_POLICE_CODE}`}
                icon="/beian/police.png"
                label={BEIAN_POLICE}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// One filing number: official badge icon + muted 10px label. Plain `<a>` (not
// HeroUI Link) so no component underline styles fight the hover treatment —
// the label only fades into the accent color over 300ms (2026-11-13).
function BeianLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: string;
  label: string;
}) {
  return (
    <a
      className="group inline-flex items-center gap-1 no-underline"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt=""
        aria-hidden="true"
        className="size-3.5 shrink-0"
        height={14}
        loading="lazy"
        src={icon}
        width={14}
      />
      <Typography
        className="text-[10px] transition-colors duration-300 group-hover:text-accent"
        color="muted"
        type="body-xs"
      >
        {label}
      </Typography>
    </a>
  );
}

// Brand marks as inline SVG (not <img>): the GitHub mark uses currentColor
// so it follows the theme, which an external SVG document cannot do. Google
// keeps its official four-color mark.
function GithubMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="currentColor" viewBox="0 0 16 16" {...props}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function GoogleG(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" {...props}>
      <path
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
        fill="#EA4335"
      />
      <path
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
        fill="#4285F4"
      />
      <path
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
        fill="#FBBC05"
      />
      <path
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
        fill="#34A853"
      />
    </svg>
  );
}
