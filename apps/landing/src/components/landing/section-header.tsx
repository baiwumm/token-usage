// 共享节头：mono 小节号（accent）+ 标题 + 副题。hairline 由各节的
// border-t 提供，组件只管文字层级。

import { Typography } from "@heroui/react";

export function SectionHeader({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Typography
        className="text-[11px] tracking-[0.2em] uppercase text-accent"
        type="body-xs"
        weight="semibold"
      >
        {eyebrow}
      </Typography>
      <Typography className="text-2xl sm:text-3xl" type="h2" weight="semibold">
        {title}
      </Typography>
      {sub ? (
        <Typography
          className="max-w-2xl text-balance"
          color="muted"
          type="body-sm"
        >
          {sub}
        </Typography>
      ) : null}
    </div>
  );
}
