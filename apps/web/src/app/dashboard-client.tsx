"use client";

// Dashboard shell at / (docs/requirements.md 路由约定, 2026-10-24 二次修订).
// M3 fills this page with the real aggregation UI; until then it renders the
// account header and an explicit placeholder state.

import { Button, Card, Typography } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { authBrowserClient } from "@/lib/auth/browser";
import { LOGIN_PATH } from "@/lib/auth/next-path";
import { DASHBOARD_COPY } from "@/lib/copy/dashboard";
import { useLocale } from "@/lib/copy/locale";

export function DashboardClient() {
  const router = useRouter();
  const [locale] = useLocale();
  const copy = DASHBOARD_COPY[locale];
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = authBrowserClient();

    void (async () => {
      const {
        data: { session },
      } = (await supabase?.auth.getSession()) ?? { data: { session: null } };

      setEmail(session?.user.email ?? null);
    })();
  }, []);

  const signOut = useCallback(async () => {
    const supabase = authBrowserClient();

    await supabase?.auth.signOut();
    router.replace(LOGIN_PATH);
    router.refresh();
  }, [router]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Typography type="h3">{copy.pageTitle}</Typography>
        <div className="flex items-center gap-3">
          {email ? (
            <Typography color="muted" type="body-sm">
              {email}
            </Typography>
          ) : null}
          <Button size="sm" variant="outline" onPress={() => void signOut()}>
            {copy.signOut}
          </Button>
        </div>
      </header>

      <Card className="p-10">
        <Card.Header>
          <Card.Title>{copy.placeholderTitle}</Card.Title>
          <Card.Description>{copy.placeholderBody}</Card.Description>
        </Card.Header>
      </Card>
    </main>
  );
}
