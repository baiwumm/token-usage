"use client";

// Hero（设计拍板 2026-11-08）：暗底 + 真实数据。右侧一年热力图纹样用快照
// 里 364 个真实日桶等级（数据即装饰），四个计数器滚入真实数字（no-JS 由
// noscript 兜底）；双 CTA = 立即部署（滚动到自部署段）+ README 同款
// Deploy to Vercel 一键链接。

import { ArrowUpRight } from "@gravity-ui/icons";
import { Button, Typography } from "@heroui/react";

import { FlowNumber } from "./flow-number";

import { LANDING_COPY } from "@/lib/copy";
import { VERCEL_DEPLOY_URL } from "@/lib/repo-links";
import { formatCompactTokens, formatCost, SNAPSHOT } from "@/lib/snapshot";

export function Hero() {
  const copy = LANDING_COPY.zh;
  const { totals, meta } = SNAPSHOT;

  const counters = [
    {
      label: copy.hero.counters.tokens,
      text: formatCompactTokens(totals.tokens),
      noscript: `${formatCompactTokens(totals.tokens)} tokens`,
    },
    {
      label: copy.hero.counters.activeDays,
      text: String(totals.activeDays),
      noscript: `${totals.activeDays} 天`,
    },
    {
      label: copy.hero.counters.sources,
      text: String(meta.sourceCount),
      noscript: `${meta.sourceCount} 个`,
    },
    {
      label: copy.hero.counters.models,
      text: String(meta.modelCount),
      noscript: `${meta.modelCount} 个`,
    },
  ];

  const facts = [
    { label: copy.hero.facts.cost, value: formatCost(totals.costUsd) },
    {
      label: copy.hero.facts.streak,
      value: `${meta.longestStreakDays} 天`,
    },
    {
      label: copy.hero.facts.peak,
      value: formatCompactTokens(meta.peakDay.tokens),
    },
  ];

  return (
    <section className="relative overflow-hidden" id="top">
      {/* 暗底氛围光：accent 朱红的低占比 radial glow（login 品牌区同款手法）。 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(720px circle at 82% 30%, color-mix(in oklab, var(--accent) 13%, transparent), transparent 72%)",
        }}
      />

      <div className="relative mx-auto w-full max-w-6xl px-6 pb-16 pt-16 sm:pt-24">
        <div className="flex flex-col gap-12 lg:flex-row lg:items-center lg:gap-16">
          <div className="flex min-w-0 flex-1 flex-col gap-6">
            <Typography
              className="text-[11px] tracking-[0.2em] uppercase text-accent"
              type="body-xs"
              weight="semibold"
            >
              {copy.hero.eyebrow}
            </Typography>
            <Typography
              className="max-w-xl text-balance text-4xl leading-tight sm:text-5xl"
              type="h1"
              weight="semibold"
            >
              {copy.hero.sloganMain}
            </Typography>
            <Typography
              className="max-w-xl text-balance"
              color="muted"
              type="body-sm"
            >
              {copy.hero.sloganSub}
            </Typography>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button
                size="lg"
                variant="primary"
                onPress={() => scrollToDeploy()}
              >
                {copy.hero.deployCta}
              </Button>
              <Button
                size="lg"
                variant="outline"
                onPress={() =>
                  window.open(
                    VERCEL_DEPLOY_URL,
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
              >
                {copy.hero.vercelCta}
                <ArrowUpRight className="size-4" />
              </Button>
            </div>
          </div>

          <div className="relative min-w-0 flex-1">
            <HeroMotif />
          </div>
        </div>

        <div className="mt-14 border-t border-default/50 pt-8">
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {counters.map((counter) => (
              <div key={counter.label} className="flex min-w-0 flex-col gap-1">
                <Typography color="muted" type="body-xs">
                  {counter.label}
                </Typography>
                <FlowNumber
                  className="text-3xl tabular-nums sm:text-4xl"
                  text={counter.text}
                />
                <noscript>
                  <span className="text-sm text-foreground">
                    {counter.noscript}
                  </span>
                </noscript>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-2.5">
            {facts.map((fact) => (
              <span
                key={fact.label}
                className="flex items-center gap-2 rounded-full border border-default/50 px-3 py-1.5"
              >
                <Typography color="muted" type="body-xs">
                  {fact.label}
                </Typography>
                <Typography
                  className="tabular-nums"
                  type="body-xs"
                  weight="medium"
                >
                  {fact.value}
                </Typography>
              </span>
            ))}
            <span className="ms-auto flex items-center gap-2 text-[11px] text-muted">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full"
                style={{ background: "var(--accent)" }}
              />
              {copy.hero.snapshotNote}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function scrollToDeploy(): void {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  document
    .getElementById("deploy")
    ?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
}

// 真实的一年：364 个日桶等级来自快照（近 52 周），横排 52 列 × 7 行，
// 两端 mask 渐隐。等级 0 用 default 弱化，其余走 accent 派生热力阶。
function HeroMotif() {
  const cells = SNAPSHOT.heatmap.cells;

  return (
    <div
      aria-hidden="true"
      className="grid grid-cols-52 gap-0.75 mask-[linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]"
    >
      {cells.map(([day, , level], index) => (
        <span
          key={day}
          className="landing-heat-cell aspect-square rounded-[2px]"
          style={{
            animationDelay: `${Math.min(index * 2.5, 900)}ms`,
            background:
              level === 0 ? "var(--heatmap-0)" : `var(--heatmap-${level})`,
            // 等级 0 的格子再压一层透明度，纹理才有呼吸感。
            opacity: level === 0 ? 0.55 : undefined,
          }}
        />
      ))}
    </div>
  );
}
