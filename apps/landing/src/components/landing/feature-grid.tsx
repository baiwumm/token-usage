"use client";

// 功能网格（设计定稿 04 段）：9 个功能项 hairline 分格，不堆卡片；
// 成就项嵌 3 枚真实成就币（来源 logo 墙 2026-11-11 移到 Hero 右侧循环），
// 下方四风格分享卡展示位（真实导出 PNG，点击放大预览——2026-11-08 操作者指令）。

import { useEffect, useState } from "react";
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
import { Modal, Typography } from "@heroui/react";

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

// 三枚真实成就币（apps/web 同款 PNG 资产）。
const COINS = [
  { file: "/achievement-art/token_titan.png", label: "token_titan 成就币" },
  {
    file: "/achievement-art/marathon_session.png",
    label: "marathon_session 成就币",
  },
  { file: "/achievement-art/streak.png", label: "streak 成就币" },
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
  // 点击卡片放大预览（2026-11-08 操作者指令）：单实例受控 Modal，
  // active 为当前卡索引、null 即关闭。
  // 关闭走三条确定性路径（RAC 的 Esc/外部点击 dismiss 在本页不可靠——
  // backdrop 即 overlay 本体、Escape 监听挂在 overlay 元素上依赖焦点链）：
  // 1) 原生 CloseTrigger（HeroUI）；2) window 级 Escape 监听（开层期间
  //   挂载，焦点无关）；3) backdrop 自身点击（target === currentTarget，
  //   dialog 内部的冒泡点击被判定排除）。
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    if (active === null) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActive(null);
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active]);

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
        {SHARE_CARDS.map((card, index) => (
          <figure key={card.file} className="flex flex-col gap-2">
            <button
              aria-label={`${copy.features.zoomHint}：${card.label}`}
              className="group overflow-hidden rounded-xl border border-default/50"
              type="button"
              onClick={() => setActive(index)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={card.label}
                className="w-full cursor-zoom-in transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none"
                loading="lazy"
                src={card.file}
              />
            </button>
            <figcaption>
              <Typography color="muted" type="body-xs">
                {card.label}
              </Typography>
            </figcaption>
          </figure>
        ))}
      </div>

      <Modal.Backdrop
        isOpen={active !== null}
        onClick={(event) => {
          if (event.target === event.currentTarget) setActive(null);
        }}
        onOpenChange={(open) => {
          if (!open) setActive(null);
        }}
      >
        <Modal.Container>
          {/* 高卡竖版（特刊 1200×1630 等）：宽度收窄到 28rem，高度交给
              max-h-[85vh]，图片 object-contain 居中，四周留黑边呼吸。
              Dialog 无可视化 Heading，按 RAC 要求带 aria-label 供读屏。 */}
          <Modal.Dialog
            aria-label={`${copy.features.shareCardsTitle} · ${copy.features.zoomHint}`}
            className="w-[calc(100vw-2rem)] overflow-hidden p-0 sm:w-[min(28rem,calc(100vw-6rem))]"
          >
            <Modal.CloseTrigger aria-label={copy.features.closePreview} />
            <Modal.Body className="p-0">
              {active !== null ? (
                <figure className="flex flex-col">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={SHARE_CARDS[active].label}
                    className="mx-auto max-h-[80vh] w-auto max-w-full"
                    src={SHARE_CARDS[active].file}
                  />
                  <figcaption className="border-t border-default/50 px-5 py-3">
                    <Typography color="muted" type="body-xs">
                      {SHARE_CARDS[active].label} ·{" "}
                      {copy.features.shareCardsTitle}
                    </Typography>
                  </figcaption>
                </figure>
              ) : null}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  );
}
