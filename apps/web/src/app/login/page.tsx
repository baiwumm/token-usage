import type { Metadata } from "next";

import { LoginForm } from "@/components/login/login-form";
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
  return <LoginForm />;
}
