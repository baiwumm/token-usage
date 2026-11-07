"use client";

// /login brand column (docs/ui-spec.md 登录页): static lockup (never links —
// /login → / → /login loop), slogans, and a year-heatmap brand motif built
// from the dashboard's own --heatmap tokens. <lg collapses to a compact top
// bar; the motif, glow and footer stay desktop-only.

import { Typography } from "@heroui/react";

import { LOGIN_COPY } from "@/lib/copy/login";
import { useLocale } from "@/lib/copy/locale";

// Abstract "one year of activity" matrix: WEEKS columns × 7 rows from a
// seeded PRNG — deterministic so SSR and hydration render the same cells —
// with mild streak correlation so quiet and busy clusters read like a real
// year of usage.
const WEEKS = 36;
const MOTIF_SEED = 0x746f6b65;

function motifLevels(): number[] {
  let state = MOTIF_SEED;
  const levels: number[] = [];

  for (let index = 0; index < WEEKS * 7; index += 1) {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = state;

    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    const raw = ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    const smoothed = raw * 0.72 + ((levels[index - 1] ?? 0) / 4) * 0.28;
    const level =
      smoothed < 0.36
        ? 0
        : smoothed < 0.58
          ? 1
          : smoothed < 0.8
            ? 2
            : smoothed < 0.93
              ? 3
              : 4;

    levels.push(level);
  }

  return levels;
}

const MOTIF_LEVELS = motifLevels();

function MotifGrid() {
  return (
    <div
      aria-hidden
      className="login-breathe grid grid-cols-[repeat(36,minmax(0,1fr))] gap-0.75 opacity-35 [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]"
    >
      {MOTIF_LEVELS.map((level, index) =>
        level === 0 ? (
          <span
            key={index}
            className="aspect-square rounded-[2px] bg-default/70"
          />
        ) : (
          <span
            key={index}
            className="aspect-square rounded-[2px]"
            style={{ background: `var(--heatmap-${level})` }}
          />
        ),
      )}
    </div>
  );
}

export function LoginBrandPanel() {
  const [locale] = useLocale();
  const copy = LOGIN_COPY[locale];

  return (
    <>
      {/* <lg: compact brand bar above the form (pt-8 + 32px row = the quick
          actions' top-8 h-8 band; centers share one line). */}
      <div className="flex items-center gap-2.5 px-6 pt-8 lg:hidden">
        <span aria-hidden="true" className="grid size-8 shrink-0 select-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            className="col-start-1 row-start-1 size-8 rounded-lg dark:hidden"
            height={32}
            src="/logo.svg"
            width={32}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            className="col-start-1 row-start-1 hidden size-8 rounded-lg dark:block"
            height={32}
            src="/logo-dark.svg"
            width={32}
          />
        </span>
        <Typography type="h6" weight="semibold">
          Token Usage
        </Typography>
      </div>

      {/* ≥lg: full brand column. */}
      <div className="relative hidden lg:flex lg:min-h-svh lg:flex-col lg:border-r lg:border-default/50 lg:px-12 lg:py-10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(560px circle at 12% 88%, color-mix(in oklab, var(--accent) 10%, transparent), transparent 70%)",
          }}
        />

        {/* h-9 band = quick actions (lg): centers share one line. */}
        <div className="relative flex h-9 items-center gap-3">
          <span aria-hidden="true" className="grid size-9 shrink-0 select-none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt=""
              className="col-start-1 row-start-1 size-9 rounded-lg dark:hidden"
              height={36}
              src="/logo.svg"
              width={36}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt=""
              className="col-start-1 row-start-1 hidden size-9 rounded-lg dark:block"
              height={36}
              src="/logo-dark.svg"
              width={36}
            />
          </span>
          <div className="flex min-w-0 flex-col">
            <Typography className="leading-tight" type="h5" weight="semibold">
              Token Usage
            </Typography>
            <Typography
              className="text-[10px] tracking-[0.16em] uppercase"
              color="muted"
              type="body-xs"
              weight="medium"
            >
              {copy.brandTagline}
            </Typography>
          </div>
        </div>

        <div className="relative my-auto flex min-w-0 flex-col gap-8">
          <div className="flex flex-col gap-3">
            <Typography
              className="max-w-md text-balance"
              type="h4"
              weight="semibold"
            >
              {copy.sloganMain}
            </Typography>
            <Typography color="muted" type="body-sm">
              {copy.sloganSub}
            </Typography>
          </div>
          <MotifGrid />
        </div>

        <Typography
          className="relative text-[10px]"
          color="muted"
          type="body-xs"
        >
          {copy.footerNote}
        </Typography>
      </div>
    </>
  );
}
