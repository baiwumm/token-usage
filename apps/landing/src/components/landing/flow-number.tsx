"use client";

// 滚动数字（对齐 apps/web/src/components/flow-number.tsx 的行为）：包装
// @number-flow/react，解析"前缀 + 数字 + 后缀"文本后按 Intl 约定滚动；
// 挂载后从 0 进入（静态导出首帧为 0，no-JS 由调用方 noscript 兜底）。

import NumberFlow from "@number-flow/react";
import { useEffect, useMemo, useState } from "react";

/** Leading non-numeric prefix, numeric core (separators included), suffix. */
const NUMERIC_TEXT_RE = /^([^\d]*?)(-?[\d,]+(?:\.\d+)?)([\s\S]*)$/;

export function FlowNumber({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const parsed = useMemo(() => {
    const match = NUMERIC_TEXT_RE.exec(text);

    if (!match) return null;
    const [, prefix, core, suffix] = match;

    const numeric = Number(core.replace(/,/g, ""));

    if (!Number.isFinite(numeric)) return null;
    const decimals = core.includes(".") ? core.split(".")[1].length : 0;

    return {
      prefix,
      suffix,
      numeric,
      format: {
        useGrouping: core.includes(","),
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      },
    };
  }, [text]);

  // Enter from zero on mount: NumberFlow only transitions when the value
  // CHANGES, so the first render shows 0 and an effect commits the real
  // value — first paint gets the same roll-up filter changes get.
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    setEntered(true);
  }, []);

  if (!parsed) {
    return <span className={className}>{text}</span>;
  }

  return (
    <NumberFlow
      className={className}
      format={parsed.format}
      prefix={parsed.prefix}
      suffix={parsed.suffix}
      value={entered ? parsed.numeric : 0}
    />
  );
}
