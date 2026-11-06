"use client";

// Project logo tile (docs/ui-spec.md「项目（`/projects`）」节): the typed logo
// URL, then the uploaded logo, then the initials — an image that fails to load
// falls through to the next level. Images are requested only once the tile
// scrolls near the viewport, and never send the dashboard URL as a Referer.
// Decorative: the project name always sits next to it.

import type { LogoSources } from "@/lib/projects/profile";

import { Avatar, cn } from "@heroui/react";
import { useEffect, useRef, useState } from "react";

import { logoCandidates } from "@/lib/projects/profile";

export function initialsOf(name: string): string {
  return (name.trim().replace(/^[^a-z0-9]+/i, "") || "?")
    .charAt(0)
    .toUpperCase();
}

export function ProjectLogo({
  name,
  profile,
  size,
}: {
  /** Display name; null for the unattributed group. */
  name: string | null;
  profile?: LogoSources;
  size: "sm" | "lg";
}) {
  const candidates = logoCandidates(profile);
  const candidatesKey = candidates.join("\n");
  // Failures are counted per candidate list, so a saved profile starts over.
  const [failure, setFailure] = useState({ key: candidatesKey, count: 0 });
  const failed = failure.key === candidatesKey ? failure.count : 0;
  const src = candidates[failed] ?? null;
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (visible || !src) return;
    const node = ref.current;

    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [src, visible]);

  return (
    <Avatar
      ref={ref}
      aria-hidden="true"
      className={cn(
        // Same rounded square as the initials tile it replaces.
        "[--avatar-radius:var(--radius-xl)]",
        size === "lg" ? "size-10" : "size-8",
      )}
      size={size === "lg" ? "md" : "sm"}
    >
      {visible && src ? (
        <Avatar.Image
          key={src}
          alt=""
          referrerPolicy="no-referrer"
          src={src}
          onLoadingStatusChange={(status) => {
            if (status === "error") {
              setFailure({ key: candidatesKey, count: failed + 1 });
            }
          }}
        />
      ) : null}
      <Avatar.Fallback
        className={cn(
          "bg-accent/10 text-accent font-medium",
          size === "lg" ? "text-base" : "text-sm",
        )}
      >
        {name ? initialsOf(name) : "·"}
      </Avatar.Fallback>
    </Avatar>
  );
}
