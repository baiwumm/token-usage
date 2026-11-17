"use client";

// Demo-mode replacement for the login form (docs/demo-instance-plan.md §5).
//
// The proxy forwards bare /login to /api/app/demo-login, so this note only
// renders when that flow cannot complete: the ?error= fallback
// (demo_unavailable), a misconfigured deploy, or a hand-typed error param.
// Showing a read-only notice instead of the form — like the account cards do
// — keeps the demo Supabase mailer (magic link / recovery email) out of
// reach at the UI layer, closing the ?error= bypass the proxy redirect
// cannot cover without looping.

import { Button, Card, ErrorMessage, Typography } from "@heroui/react";
import { useRouter } from "next/navigation";

import { DEMO_COPY } from "@/lib/copy/demo";
import { useLocale } from "@/lib/copy/locale";

export function LoginDemoNote({
  callbackError,
}: {
  callbackError: string | null;
}) {
  const router = useRouter();
  const [locale] = useLocale();
  const copy = DEMO_COPY[locale].login;

  return (
    <div className="relative flex min-w-0 flex-1 flex-col justify-center px-6 py-12 sm:px-10 lg:px-16">
      {/* Same shell as login-body: centered max-w-md card inside the right
          column, entrance animation included. */}
      <div className="login-enter mx-auto w-full max-w-md">
        <Card className="p-6 sm:p-8">
          <Card.Header>
            <Card.Title>{copy.title}</Card.Title>
            <Card.Description>{copy.body}</Card.Description>
          </Card.Header>
          <Card.Content>
            <div className="flex flex-col gap-4">
              {callbackError === "demo_unavailable" ? (
                <ErrorMessage role="alert">{copy.unavailable}</ErrorMessage>
              ) : null}
              <Typography color="muted" type="body-xs">
                {DEMO_COPY[locale].banner.body}
              </Typography>
              <Button fullWidth onPress={() => router.push("/")}>
                {copy.action}
              </Button>
            </div>
          </Card.Content>
        </Card>
      </div>
    </div>
  );
}
