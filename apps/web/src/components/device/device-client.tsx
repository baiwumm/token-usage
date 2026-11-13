"use client";

// Device pairing page (/device?user_code=XXXX-XXXX) — part of the CLI
// contract (docs/cli-contract.md §1.1). Approving calls the frozen
// device-flow-grant endpoint (§2.3) with the browser session JWT. The code
// survives the login hop via ?next= (route guard).

import {
  Button,
  Card,
  ErrorMessage,
  Form,
  InputOTP,
  Label,
  Typography,
} from "@heroui/react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";

import { PendingButton } from "@/components/pending-button";
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
const CODE_LENGTH = 8;
const USER_CODE_PATTERN = /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/;
// Dispatched by the app shell's primary action while already on /device
// (docs/ui-spec.md 配对 · 顶栏主操作复位语义).
const DEVICE_RESET_EVENT = "token-usage:device-reset";

type Phase = "input" | "confirm" | "success";

function normalizeCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-HJKMNP-Z2-9]/g, "")
    .slice(0, CODE_LENGTH);
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
  const [pending, setPending] = useState(false);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  const redirectToLogin = useCallback(() => {
    const target = activeCode
      ? `/device?user_code=${encodeURIComponent(activeCode)}`
      : "/device";

    router.replace(`${LOGIN_PATH}?next=${encodeURIComponent(target)}`);
  }, [activeCode, router]);

  // Reset to a fresh manual-input pairing: drop the current code, draft and
  // error, and clear a deep-linked ?user_code= so a reload cannot restore it.
  // React Compiler infers the state setters too, so the dependency list has
  // to be explicit rather than just [router] (stable setters are harmless).
  const resetToInput = useCallback(() => {
    setDraft("");
    setActiveCode("");
    setErrorDetail(null);
    setPhase("input");
    router.replace("/device");
  }, [router, setActiveCode, setDraft, setErrorDetail, setPhase]);

  useEffect(() => {
    const onReset = () => resetToInput();

    window.addEventListener(DEVICE_RESET_EVENT, onReset);

    return () => window.removeEventListener(DEVICE_RESET_EVENT, onReset);
  }, [resetToInput]);

  // Approves in place: the button carries the pending state and a failed
  // grant surfaces as inline copy, so the page never leaves the current card
  // until the pairing succeeds.
  async function approve(code: string) {
    if (pending) return;

    setPending(true);
    setErrorDetail(null);

    try {
      const supabase = authBrowserClient();
      const {
        data: { session },
      } = (await supabase?.auth.getSession()) ?? { data: { session: null } };

      if (!session?.access_token) {
        redirectToLogin();

        return;
      }
      // A hung request must not pin the button on the pending spinner forever:
      // 15 s is well past any healthy round-trip to the grant endpoint, and
      // the timeout surfaces the retryable inline error instead.
      await grantDeviceFlow(session.access_token, {
        userCode: code,
        timeoutMs: 15_000,
      });
      setActiveCode(code);
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
    } finally {
      setPending(false);
    }
  }

  function submitManual(event: FormEvent) {
    event.preventDefault();
    const formatted = formatCode(normalizeCode(draft));

    if (!USER_CODE_PATTERN.test(formatted)) {
      setErrorDetail(copy.errorInvalid);

      return;
    }
    setActiveCode(formatted);
    void approve(formatted);
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
            <Form className="flex flex-col gap-3" onSubmit={submitManual}>
              <Label htmlFor="device-user-code">{copy.codeLabel}</Label>
              <InputOTP
                aria-describedby={errorDetail ? "device-code-error" : undefined}
                autoCapitalize="characters"
                className="justify-center"
                id="device-user-code"
                inputMode="text"
                isInvalid={!!errorDetail}
                maxLength={CODE_LENGTH}
                value={draft}
                variant="secondary"
                onChange={(raw) => {
                  setDraft(normalizeCode(raw));
                  setErrorDetail(null);
                }}
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
              {errorDetail ? (
                <ErrorMessage id="device-code-error" role="alert">
                  {errorDetail}
                </ErrorMessage>
              ) : null}
              <PendingButton
                className="self-center"
                isDisabled={draft.length !== CODE_LENGTH}
                pending={pending}
                type="submit"
              >
                {copy.approve}
              </PendingButton>
            </Form>
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
            {errorDetail ? (
              <ErrorMessage role="alert">{errorDetail}</ErrorMessage>
            ) : null}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <PendingButton
                pending={pending}
                onPress={() => void approve(activeCode)}
              >
                {copy.approve}
              </PendingButton>
              {errorDetail ? (
                <Button variant="secondary" onPress={resetToInput}>
                  {copy.startOver}
                </Button>
              ) : null}
            </div>
          </Card.Content>
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
