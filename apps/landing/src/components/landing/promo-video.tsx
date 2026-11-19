"use client";

// 产品宣传片（2026-11-19 操作者指令）：Hero 与「三步接入」之间的一屏
// 16:9 视频卡。默认只渲染封面（实拍截图）与播放按钮，点击后才挂载
// <video>（preload="none"），静态页首屏不背 4.7MB 视频体积；播放交给
// 原生 controls，不自动播放、不循环。

import { useState } from "react";
import { PlayFill } from "@gravity-ui/icons";
import { Typography } from "@heroui/react";

import { LANDING_COPY } from "@/lib/copy";

const VIDEO_SRC = "/video/token-usage-promo.mp4";
const POSTER_SRC = "/video/token-usage-promo-cover.webp";

export function PromoVideo() {
  const copy = LANDING_COPY.zh;
  const [playing, setPlaying] = useState(false);

  return (
    <section
      aria-label={copy.promo.title}
      className="border-t border-default/50"
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-14 sm:py-16">
        <div className="relative aspect-video overflow-hidden rounded-2xl border border-default/50 bg-surface-secondary">
          {playing ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              autoPlay
              controls
              playsInline
              className="h-full w-full object-cover"
              poster={POSTER_SRC}
              preload="none"
              src={VIDEO_SRC}
            />
          ) : (
            <button
              aria-label={copy.promo.play}
              className="group absolute inset-0 block"
              type="button"
              onClick={() => setPlaying(true)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt=""
                className="h-full w-full object-cover object-top"
                height={900}
                loading="lazy"
                src={POSTER_SRC}
                width={1440}
              />
              <span
                aria-hidden="true"
                className="absolute inset-0 bg-linear-to-t from-black/60 via-black/10 to-transparent"
              />
              <span
                aria-hidden="true"
                className="absolute inset-0 flex flex-col items-center justify-center gap-3"
              >
                <span className="flex size-16 items-center justify-center rounded-full bg-accent text-white shadow-lg transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none">
                  <PlayFill className="size-6" />
                </span>
                <span className="rounded-full bg-background/60 px-3 py-1 text-xs text-foreground backdrop-blur">
                  {copy.promo.play}
                </span>
              </span>
            </button>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-3">
          <Typography type="body-sm" weight="semibold">
            {copy.promo.title}
          </Typography>
          <Typography color="muted" type="body-xs">
            {copy.promo.note}
          </Typography>
        </div>
      </div>
    </section>
  );
}
