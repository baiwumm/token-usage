import type { Metadata } from "next";

import { Suspense } from "react";

import { SessionsClient } from "./sessions-client";

export const metadata: Metadata = {
  title: "Sessions",
};

export default function SessionsPage() {
  // useSearchParams (filters + pagination live in the URL) needs a Suspense
  // boundary when the page is statically rendered.
  return (
    <Suspense fallback={null}>
      <SessionsClient />
    </Suspense>
  );
}
