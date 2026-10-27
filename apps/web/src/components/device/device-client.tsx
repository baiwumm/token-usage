"use client";

// Device pairing page (/device?user_code=XXXX-XXXX) — part of the CLI
// contract (docs/cli-contract.md §1.1). Approving calls the frozen
// device-flow-grant endpoint (§2.3) with the browser session JWT. The code
// survives the login hop via ?next= (route guard).

import {
  Button,
  Card,
  InputOTP,
  Label,
  Spinner,
  Typography,
} from "@heroui/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useState, type FormEvent } from "react";

import { authBrowserClient } from "@/lib/auth/browser";
import { LOGIN_PATH } from "@/lib/auth/next-path";
import { DEVICE_COPY } from "@/lib/copy/device";
import { useLocale } from "@/lib/copy/locale";
import {
  DashboardApiError,
  grantDeviceFlow,
  isUnauthorized,
} from "@/lib/dashboard/api";

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
      await grantDeviceFlow(session.access_token, { userCode: code });
      setPhase("success");
    } catch (error) {
      if (isUnauthorized(error)) {
        redirectToLogin();

        return;
      }
      setErrorDetail(
        error instanceof DashboardApiError && error.status === 404
          ? copy.errorNotFound
          : error instanceof DashboardApiError && error.status === 400
            ? copy.errorInvalid
            : (error instanceof Error && error.message) || copy.errorGeneric,
      );
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
    <main className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-xl flex-col justify-center gap-6 px-4 py-10 md:px-8">
      <header className="flex flex-col gap-1">
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
              <Label htmlFor="device-user-code">{copy.codeLabel}</Label>
              <InputOTP
                autoCapitalize="characters"
                className="justify-center"
                id="device-user-code"
                inputMode="text"
                maxLength={8}
                value={draft}
                variant="secondary"
                onChange={(raw) => setDraft(normalizeCode(raw))}
              >
                <InputOTP.Group>
                  <InputOTP.Slot index={0} />
                  <InputOTP.Slot index={1} />
                  <InputOTP.Slot index={2} />
                  <InputOTP.Slot index={3} />
                </InputOTP.Group>
                <InputOTP.Separator />
                <InputOTP.Group>
                  <InputOTP.Slot index={4} />
                  <InputOTP.Slot index={5} />
                  <InputOTP.Slot index={6} />
                  <InputOTP.Slot index={7} />
                </InputOTP.Group>
              </InputOTP>
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
              className="text-accent tabular-nums"
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
