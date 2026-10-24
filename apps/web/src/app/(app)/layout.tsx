import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";

// Shared shell for the authenticated pages (sidebar lg+, drawer below lg —
// docs/ui-spec.md 响应式). /login and /auth/callback stay outside.
export const metadata: Metadata = {
  title: {
    default: "Token Usage",
    template: "%s - Token Usage",
  },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
