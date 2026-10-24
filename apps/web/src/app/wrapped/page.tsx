import type { Metadata } from "next";

import { WrappedClient } from "./wrapped-client";

export const metadata: Metadata = {
  title: "年度回顾",
};

export default function WrappedPage() {
  return <WrappedClient />;
}
