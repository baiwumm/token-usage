"use client";

// Login form: email+password or magic link (docs/rewrite-plan.md 决策 5).
// Auth traffic goes through the exempted browser Supabase client; the ?next=
// target is sanitized before it is honored anywhere.

import {
  Button,
  Card,
  Description,
  ErrorMessage,
  Form,
  Input,
  Label,
  Spinner,
  TextField,
  Typography,
} from "@heroui/react";
import Link from "next/link";
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
  const [magicSent, setMagicSent] = useState(false);

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
    setMagicSent(true);
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

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm gap-5 p-8">
        <header className="flex flex-col gap-1">
          <Typography type="h4">{copy.pageTitle}</Typography>
          <Typography color="muted" type="body-sm">
            {copy.pageSubtitle}
          </Typography>
        </header>

        {magicSent ? (
          <div className="flex flex-col gap-4">
            <Typography type="h4" weight="medium">
              {copy.sentTitle}
            </Typography>
            <Typography color="muted" type="body-sm">
              {copy.sentBody}
            </Typography>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onPress={() => {
                  setMagicSent(false);
                }}
              >
                {copy.sentBack}
              </Button>
              <Button
                isPending={busy}
                onPress={() => {
                  void submitMagic();
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
            <div
              className="flex gap-1 rounded-large bg-content2 p-1"
              role="tablist"
            >
              {(["password", "magic"] as const).map((target) => (
                <Button
                  key={target}
                  size="sm"
                  variant={mode === target ? "secondary" : "ghost"}
                  onPress={() => switchMode(target)}
                >
                  {target === "password" ? copy.passwordMode : copy.magicMode}
                </Button>
              ))}
            </div>

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
                <Button isPending={busy} type="submit">
                  {({ isPending }) => (
                    <>
                      {isPending ? <Spinner color="current" size="sm" /> : null}
                      {copy.passwordSubmit}
                    </>
                  )}
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
                <Button isPending={busy} type="submit">
                  {({ isPending }) => (
                    <>
                      {isPending ? <Spinner color="current" size="sm" /> : null}
                      {copy.magicSubmit}
                    </>
                  )}
                </Button>
              </Form>
            )}
          </div>
        )}

        <footer className="text-foreground/40 text-xs">
          <Link
            className="hover:text-foreground underline underline-offset-4"
            href="/"
          >
            {copy.backToLanding}
          </Link>
        </footer>
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
