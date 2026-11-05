"use client";

// §6.6: the public page's NumberFlow wrapper. FlowNumber starts at 0 and
// rolls up after mount (the project-wide convention); a public, noindex page
// still has to be readable without JS and by assistive tech, so the final
// value is also carried in <noscript> and in an aria-label.

import { FlowNumber } from "@/components/flow-number";

export function PublicNumber({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <span aria-label={text} aria-live="off" className={className}>
      <FlowNumber text={text} />
      <noscript>{text}</noscript>
    </span>
  );
}
