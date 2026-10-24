"use client";

// Device pairing page (/device?user_code=XXXX-XXXX) — part of the CLI
// contract (docs/cli-contract.md §1.1). Approving calls the frozen
// device-flow-grant endpoint (§2.3) with the browser session JWT. The code
// survives the login hop via ?next= (route guard).

import { Button, Card, Spinner, Typography } from "@heroui/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useState, type FormEvent } from "react";

import { authBrowserClient } from "@/lib/auth/browser";
import { LOGIN_PATH } from "@/lib/auth/next-path";
import { DEVICE_COPY } from "@/lib/copy/device";
import { useLocale } from "@/lib/copy/locale";

// Contract alphabet: no 0/1/I/L/O (docs/cli-contract.md §2.1).
const USER_CODE_PATTERN = /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/;

type Phase = "input" | "confirm" | "approving" | "success" | "error";

function normalizeCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-HJKMNP-Z2-9]/g, "")
    .slice(0, 8);
}

function formatCode(packed: string): string {
  return packed.length > 4
    ? `${packed.slice(0, 4)}-${packed.slice(4)}`
    : packed;
}

function DeviceClientInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [locale] = useLocale();
  const copy = DEVICE_COPY[locale];

  const urlCode = searchParams.get("user_code") ?? "";
  const [phase, setPhase] = useState<Phase>(
    USER_CODE_PATTERN.test(urlCode) ? "confirm" : "input",
  );
  const [draft, setDraft] = useState("");
  const [activeCode, setActiveCode] = useState(
    USER_CODE_PATTERN.test(urlCode) ? urlCode : "",
  );
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  const redirectToLogin = useCallback(() => {
    const target = activeCode
      ? `/device?user_code=${encodeURIComponent(activeCode)}`
      : "/device";

    router.replace(`${LOGIN_PATH}?next=${encodeURIComponent(target)}`);
  }, [activeCode, router]);

  async function approve(code: string) {
    const supabase = authBrowserClient();
    const {
      data: { session },
    } = (await supabase?.auth.getSession()) ?? { data: { session: null } };

    if (!session?.access_token) {
      redirectToLogin();

      return;
    }
    setPhase("approving");
    setErrorDetail(null);

    try {
      const response = await fetch(
        "/api/functions/token-usage-device-flow-grant",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ user_code: code }),
        },
      );

      if (response.status === 401) {
        redirectToLogin();

        return;
      }
      if (response.ok) {
        setPhase("success");

        return;
      }
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      setErrorDetail(
        response.status === 404
          ? copy.errorNotFound
          : response.status === 400
            ? copy.errorInvalid
            : (payload.error ?? copy.errorGeneric),
      );
      setPhase("error");
    } catch {
      setErrorDetail(copy.errorGeneric);
      setPhase("error");
    }
  }

  function submitManual(event: FormEvent) {
    event.preventDefault();
    const packed = normalizeCode(draft);
    const formatted = formatCode(packed);

    if (!USER_CODE_PATTERN.test(formatted)) {
      setErrorDetail(copy.errorInvalid);
      setPhase("error");
      setActiveCode("");

      return;
    }
    setActiveCode(formatted);
    setPhase("confirm");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <Typography type="h3">{copy.pageTitle}</Typography>
        <Typography color="muted" type="body-sm">
          {copy.pageSubtitle}
        </Typography>
      </header>

      {phase === "input" ? (
        <Card className="flex flex-col gap-4 p-6">
          <Card.Header>
            <Card.Title>{copy.manualTitle}</Card.Title>
            <Card.Description>{copy.manualHint}</Card.Description>
          </Card.Header>
          <Card.Content>
            <form className="flex flex-col gap-3" onSubmit={submitManual}>
              <input
                aria-label={copy.codeLabel}
                autoComplete="off"
                className="border-default-200 bg-content2 rounded-medium px-3 py-2 text-center font-mono text-lg tracking-[0.3em] uppercase outline-none focus:border-primary"
                inputMode="text"
                maxLength={9}
                placeholder={copy.codePlaceholder}
                spellCheck={false}
                value={draft ? formatCode(normalizeCode(draft)) : ""}
                onChange={(event) =>
                  setDraft(normalizeCode(event.target.value))
                }
              />
              <Button type="submit">{copy.approve}</Button>
            </form>
          </Card.Content>
        </Card>
      ) : null}

      {phase === "confirm" ? (
        <Card className="flex flex-col gap-4 p-6">
          <Card.Header>
            <Card.Title>{copy.confirmTitle}</Card.Title>
            <Card.Description>{copy.confirmBody}</Card.Description>
          </Card.Header>
          <Card.Content className="flex flex-col items-center gap-4">
            <Typography
              className="text-primary tabular-nums"
              type="h2"
              weight="bold"
            >
              {activeCode}
            </Typography>
            <Button onPress={() => void approve(activeCode)}>
              {copy.approve}
            </Button>
          </Card.Content>
        </Card>
      ) : null}

      {phase === "approving" ? (
        <Card className="items-center gap-2 p-10">
          <Spinner />
          <Typography color="muted" type="body-sm">
            {copy.approving}
          </Typography>
        </Card>
      ) : null}

      {phase === "success" ? (
        <Card className="p-6">
          <Card.Header>
            <Card.Title>{copy.successTitle}</Card.Title>
            <Card.Description>{copy.successBody}</Card.Description>
          </Card.Header>
        </Card>
      ) : null}

      {phase === "error" ? (
        <Card className="flex-col gap-3 p-6">
          <Card.Header>
            <Card.Title>{copy.errorTitle}</Card.Title>
            <Card.Description>
              {errorDetail ?? copy.errorGeneric}
            </Card.Description>
          </Card.Header>
          <Card.Content className="flex gap-2">
            {activeCode ? (
              <Button
                size="sm"
                variant="outline"
                onPress={() => void approve(activeCode)}
              >
                {copy.retry}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="secondary"
              onPress={() => {
                setDraft("");
                setActiveCode("");
                setErrorDetail(null);
                setPhase("input");
              }}
            >
              {copy.startOver}
            </Button>
          </Card.Content>
        </Card>
      ) : null}
    </main>
  );
}

// useSearchParams needs a Suspense boundary for the static prerender.
export function DeviceClient() {
  return (
    <Suspense fallback={null}>
      <DeviceClientInner />
    </Suspense>
  );
}
