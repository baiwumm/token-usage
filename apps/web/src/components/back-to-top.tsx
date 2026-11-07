"use client";

// Floating back-to-top affordance for the app shell. The shell scrolls on the
// document, so a rAF-throttled window scroll listener toggles the button once
// the page is past a threshold; the click smooth-scrolls home (an instant jump
// under prefers-reduced-motion) and the show/hide plus hover motion are pure
// CSS transitions. The button is a solid elevated disc (surface + border +
// shadow) so it stays readable over any section of the page — no tooltip, the
// arrow glyph carries the meaning and the label lives on aria-label.

import { ArrowUp } from "@gravity-ui/icons";
import { Button, cn } from "@heroui/react";
import { useCallback, useEffect, useState } from "react";

/** The button appears once the page is scrolled this far from the top. */
const SHOW_AFTER_PX = 320;

export function BackToTop({ label }: { label: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      frame = 0;
      setVisible(window.scrollY > SHOW_AFTER_PX);
    };
    // One state read per frame however fast the scroll events fire.
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });

    return () => {
      window.removeEventListener("scroll", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const scrollToTop = useCallback(() => {
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }, []);

  return (
    <Button
      isIconOnly
      aria-label={label}
      className={cn(
        "border-border bg-surface text-foreground fixed right-6 bottom-6 z-20 rounded-full border shadow-md",
        "transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg active:scale-95",
        "motion-reduce:transition-none",
        visible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none invisible translate-y-2 opacity-0",
      )}
      onPress={scrollToTop}
    >
      <ArrowUp aria-hidden="true" className="size-4" />
    </Button>
  );
}
