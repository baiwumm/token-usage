"use client";

import { Button } from "@heroui/react";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Error boundaries are the one place a console statement is the contract.
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h2 className="text-lg font-semibold">出错了</h2>
      <Button onPress={() => reset()}>重试</Button>
    </main>
  );
}
