// Project identity tile: the first loadable logo candidate, else the letter
// square. Candidates follow the web's order (typed logo URL, then the uploaded
// logo) and a failed image falls through to the next one, so a stale link never
// masks a fresh upload — or the other way round (docs/ui-spec.md「项目与仓库」).

import { useState } from "react";

import { tileColorFor } from "@/lib/source-logos";

export function ProjectLogo({
  urls,
  name,
  className,
  dimension,
}: {
  /** Logo candidates in display order; empty → letter tile. */
  urls: string[];
  /** Display name, for the letter fallback and its tile colour. */
  name: string;
  /** Size + radius + type classes, shared by the <img> and the tile. */
  className: string;
  /** width/height attributes for the <img> (px). */
  dimension: number;
}) {
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const url = urls.find((candidate) => !failed.has(candidate));

  if (url) {
    return (
      <img
        alt=""
        className={`${className} shrink-0 object-cover`}
        height={dimension}
        src={url}
        width={dimension}
        onError={() => setFailed((previous) => new Set(previous).add(url))}
      />
    );
  }

  const initial = (name.trim() || "?").charAt(0).toUpperCase();

  return (
    <span
      aria-hidden="true"
      className={`${className} inline-flex shrink-0 items-center justify-center font-semibold text-white select-none`}
      style={{ background: tileColorFor(name) }}
    >
      {initial}
    </span>
  );
}
