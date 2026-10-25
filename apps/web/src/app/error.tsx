"use client";

// Root error boundary. Rendered inside the root layout, so the locale
// provider works — copy via ERROR_COPY, UI via HeroUI primitives.

import { TriangleExclamation } from "@gravity-ui/icons";
import { Button, Card, Chip, Typography } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { ERROR_COPY } from "@/lib/copy/error";
import { useLocale } from "@/lib/copy/locale";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const [locale] = useLocale();
  const copy = ERROR_COPY[locale];

  useEffect(() => {
    // Error boundaries are the one place a console statement is the contract.
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md p-8">
        <Card.Content className="flex flex-col items-center gap-4 py-4 text-center">
          <span className="bg-danger-soft flex size-14 items-center justify-center rounded-full">
            <TriangleExclamation
              aria-hidden="true"
              className="text-danger size-7"
            />
          </span>
          <div className="flex flex-col gap-2">
            <Typography type="h3" weight="semibold">
              {copy.title}
            </Typography>
            <Typography color="muted" type="body-sm">
              {copy.description}
            </Typography>
          </div>
          {error.digest ? (
            <Chip size="sm" variant="secondary">
              {copy.digestLabel} · {error.digest}
            </Chip>
          ) : null}
          <div className="flex gap-2 pt-1">
            <Button onPress={() => reset()}>{copy.retry}</Button>
            <Button variant="secondary" onPress={() => router.replace("/")}>
              {copy.goHome}
            </Button>
          </div>
        </Card.Content>
      </Card>
    </main>
  );
}
