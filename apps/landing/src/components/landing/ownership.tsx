// 数据自主段（设计定稿 06 段）：一句大号宣言 + 三条编号要点，
// hairline 分隔，隐私立场是自托管项目对云端产品的核心差异。

import { Typography } from "@heroui/react";

import { SectionHeader } from "./section-header";

import { LANDING_COPY } from "@/lib/copy";

export function Ownership() {
  const copy = LANDING_COPY.zh;

  return (
    <section className="border-t border-default/50">
      <div className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-24">
        <SectionHeader
          eyebrow={copy.ownership.eyebrow}
          title={copy.ownership.title}
        />

        <Typography
          className="mt-8 max-w-3xl text-balance text-xl leading-relaxed sm:text-2xl"
          type="body-sm"
          weight="medium"
        >
          {copy.ownership.statement}
        </Typography>

        <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
          {copy.ownership.points.map((point, index) => (
            <div
              key={point.title}
              className="flex flex-col gap-2.5 border-t border-default/50 pt-6"
            >
              <Typography
                className="font-mono text-xs text-accent"
                weight="semibold"
              >
                {String(index + 1).padStart(2, "0")}
              </Typography>
              <Typography type="body-sm" weight="semibold">
                {point.title}
              </Typography>
              <Typography color="muted" type="body-xs">
                {point.body}
              </Typography>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
