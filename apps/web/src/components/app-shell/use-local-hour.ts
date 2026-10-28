"use client";

import { useEffect, useState } from "react";

/** Local hour of the signed-in user; null until mounted (SSR-safe). */
export function useLocalHour(): number | null {
  const [hour, setHour] = useState<number | null>(null);

  useEffect(() => {
    setHour(new Date().getHours());
  }, []);

  return hour;
}
