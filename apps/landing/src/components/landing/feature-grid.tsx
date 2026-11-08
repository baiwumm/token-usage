// 功能网格（设计定稿 04 段）：9 个功能项 hairline 分格，不堆卡片；
// 来源项嵌 16 枚采集端 logo 墙，成就项嵌 3 枚真实成就币，下方四风格
// 分享卡展示位（P2 导出的真实 PNG）。

import {
  Calendar,
  FileCode,
  Layers,
  Medal,
  Picture,
  Tag,
  SquareListUl,
  Server,
  Wallet,
} from "@gravity-ui/icons";
import { Typography } from "@heroui/react";

import { SectionHeader } from "./section-header";

import { LANDING_COPY } from "@/lib/copy";

/** 功能图标对齐 items 顺序（copy.ts features.items）。 */
const FEATURE_ICONS = [
  Server,
  SquareListUl,
  Picture,
  Medal,
  Tag,
  Calendar,
  Layers,
  Wallet,
  FileCode,
];

export function FeatureGrid() {
  const copy = LANDING_COPY.zh;

  return (
    <section className="border-t border-default/50" id="features">
      <div className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-24">
        <SectionHeader
          eyebrow={copy.features.eyebrow}
          sub={copy.features.sub}
          title={copy.features.title}
        />

        <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-default/50 bg-default/40 sm:grid-cols-2 lg:grid-cols-3">
          {copy.features.items.map((item, index) => {
            const Icon = FEATURE_ICONS[index];

            return (
              <div
                key={item.title}
                className="flex flex-col gap-2.5 bg-background px-6 py-7"
              >
                {Icon ? (
                  <Icon
                    aria-hidden="true"
                    className="size-5"
                    style={{ color: "var(--accent)" }}
                  />
                ) : null}
                <Typography type="body-sm" weight="semibold">
                  {item.title}
                </Typography>
                <Typography color="muted" type="body-xs">
                  {item.body}
                </Typography>
                {index === 6 ? <SourceLogoWall /> : null}
                {index === 3 ? <AchievementCoins /> : null}
              </div>
            );
          })}
        </div>

        <ShareCardShowcase />
      </div>
    </section>
  );
}

// 16 枚采集端 logo（dark 变体优先），4×4 网格排布；文件已按暗色可用性挑选。
const LOGOS: Array<{ file: string; label: string }> = [
  { file: "/brand-logos/zcode-dark.svg", label: "ZCode" },
  { file: "/brand-logos/claude-code.svg", label: "Claude Code" },
  { file: "/brand-logos/codex-dark.svg", label: "Codex" },
  { file: "/brand-logos/cursor-dark.svg", label: "Cursor" },
  { file: "/brand-logos/opencode.svg", label: "OpenCode" },
  { file: "/brand-logos/copilot-dark.svg", label: "Copilot" },
  { file: "/brand-logos/gemini.svg", label: "Gemini" },
  { file: "/brand-logos/grok-dark.svg", label: "Grok" },
  { file: "/brand-logos/kimi.svg", label: "Kimi" },
  { file: "/brand-logos/deepseek.svg", label: "DeepSeek" },
  { file: "/brand-logos/minimax.svg", label: "MiniMax" },
  { file: "/brand-logos/trae.svg", label: "Trae" },
  { file: "/brand-logos/qoder-dark.svg", label: "Qoder" },
  { file: "/brand-logos/kiro-dark.svg", label: "Kiro" },
  { file: "/brand-logos/workbuddy.svg", label: "WorkBuddy" },
  { file: "/brand-logos/zed-dark.svg", label: "Zed" },
];

function SourceLogoWall() {
  return (
    <div aria-label="采集端 logo 墙" className="mt-3 grid grid-cols-8 gap-2.5">
      {LOGOS.map((logo) => (
        <span
          key={logo.file}
          aria-hidden="true"
          className="flex items-center justify-center"
          title={logo.label}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={logo.label}
            className="size-6 opacity-80"
            height={24}
            loading="lazy"
            src={logo.file}
            width={24}
          />
        </span>
      ))}
    </div>
  );
}

// 三枚真实成就币（apps/web 同款 PNG 资产）。
const COINS = [
  { file: "/achievements/token_titan.png", label: "token_titan 成就币" },
  {
    file: "/achievements/marathon_session.png",
    label: "marathon_session 成就币",
  },
  { file: "/achievements/streak.png", label: "streak 成就币" },
];

function AchievementCoins() {
  return (
    <div className="mt-3 flex gap-3">
      {COINS.map((coin) => (
        <span
          key={coin.file}
          aria-hidden="true"
          className="block"
          title={coin.label}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={coin.label}
            className="size-12"
            height={48}
            loading="lazy"
            src={coin.file}
            width={48}
          />
        </span>
      ))}
    </div>
  );
}

// 四风格分享卡展示：由真实 Canvas 引擎（apps/web share-card）导出的 PNG，
// mock 数据（伪造值）；导出失败时整块隐藏（含标题），不出现破图。
const SHARE_CARDS: Array<{ file: string; label: string }> = [
  { file: "/share-cards/broadsheet.png", label: "特刊 Broadsheet" },
  { file: "/share-cards/receipt.png", label: "小票 Receipt" },
  { file: "/share-cards/neon.png", label: "霓虹 Neon" },
  { file: "/share-cards/vinyl.png", label: "唱片 Vinyl" },
];

function ShareCardShowcase() {
  const copy = LANDING_COPY.zh;

  if (SHARE_CARDS.length === 0) return null;

  return (
    <div className="mt-16 flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Typography type="body-sm" weight="semibold">
          {copy.features.shareCardsTitle}
        </Typography>
        <Typography color="muted" type="body-xs">
          {copy.features.shareCardsSub}
        </Typography>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {SHARE_CARDS.map((card) => (
          <figure key={card.file} className="flex flex-col gap-2">
            <span className="overflow-hidden rounded-xl border border-default/50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={card.label}
                className="w-full"
                loading="lazy"
                src={card.file}
              />
            </span>
            <figcaption>
              <Typography color="muted" type="body-xs">
                {card.label}
              </Typography>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
