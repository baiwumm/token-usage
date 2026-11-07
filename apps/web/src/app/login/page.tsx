import type { Metadata } from "next";

import { LoginClient } from "@/components/login/login-client";
import { createPageMetadata, resolveRequestLocale } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveRequestLocale();

  return createPageMetadata({
    key: "login",
    path: "/login",
    locale,
  });
}

export default function LoginPage() {
  return <LoginClient />;
}
