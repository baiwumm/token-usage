"use client";

// Login form: email+password or magic link (docs/rewrite-plan.md 决策 5),
// switched via HeroUI Tabs. Auth traffic goes through the exempted browser
// Supabase client; the ?next= target is sanitized before it is honored
// anywhere.

import { Envelope, Lock } from "@gravity-ui/icons";
import {
  Button,
  Card,
  Description,
  ErrorMessage,
  Form,
  Input,
  Label,
  Spinner,
  Tabs,
  TextField,
  Typography,
} from "@heroui/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";

import { authBrowserClient } from "@/lib/auth/browser";
import { resolvePostLoginPath } from "@/lib/auth/next-path";
import { LOGIN_COPY } from "@/lib/copy/login";
import { useLocale, type Locale } from "@/lib/copy/locale";

type Mode = "password" | "magic";

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

function LoginFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [locale] = useLocale();
  const copy = LOGIN_COPY[locale];

  // ?next= survives the login → callback → bounce cycle; a stale ?error=
  // means the last callback exchange failed.
  const next = resolvePostLoginPath(searchParams.get("next"));
  const callbackError = searchParams.get("error");

  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    callbackError ? copy.errorCallback : null,
  );
  const [sentKind, setSentKind] = useState<null | "magic" | "reset">(null);

  function switchMode(target: Mode) {
    if (target === mode) return;
    setMode(target);
    setError(null);
  }

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    const supabase = authBrowserClient();

    if (!supabase || busy) return;
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

    if (!supabase || busy) return;
    setBusy(true);
    setError(null);

    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
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

    if (!supabase || busy) return;
    setBusy(true);
    setError(null);

    const { error: authError } = await supabase.auth.resetPasswordForEmail(
      email,
      {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/settings")}`,
      },
    );

    setBusy(false);
    if (authError) {
      setError(mapAuthError(authError.status ?? 0, locale));

      return;
    }
    setSentKind("reset");
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
      <Input
        autoComplete="email"
        placeholder={copy.emailPlaceholder}
        variant="secondary"
      />
    </TextField>
  );

  const sentCopy =
    sentKind === "reset"
      ? { title: copy.resetSentTitle, body: copy.resetSentBody }
      : { title: copy.sentTitle, body: copy.sentBody };

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md p-8">
        <Card.Header>
          <Card.Title>{copy.pageTitle}</Card.Title>
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
                      {isPending ? <Spinner color="current" size="sm" /> : null}
                      {copy.sentResend}
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <Tabs
                selectedKey={mode}
                onSelectionChange={(key) => switchMode(String(key) as Mode)}
              >
                <Tabs.ListContainer className="bg-default rounded-2xl p-1">
                  <Tabs.List aria-label={copy.pageTitle} className="w-auto p-0">
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

              {error ? <ErrorMessage role="alert">{error}</ErrorMessage> : null}

              {mode === "password" ? (
                <Form className="flex flex-col gap-4" onSubmit={submitPassword}>
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
                    <Input
                      autoComplete="current-password"
                      placeholder={copy.passwordPlaceholder}
                      variant="secondary"
                    />
                  </TextField>
                  <Button fullWidth isPending={busy} type="submit">
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
                    isDisabled={busy || email.length === 0}
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
                  <Button fullWidth isPending={busy} type="submit">
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
          )}
        </Card.Content>
      </Card>
    </main>
  );
}

// useSearchParams needs a Suspense boundary for the static prerender.
export function LoginForm() {
  return (
    <Suspense fallback={null}>
      <LoginFormInner />
    </Suspense>
  );
}
