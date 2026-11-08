"use client";

// 三步 terminal（设计定稿 02 段）：终端窗口壳 + CLI README 快速开始
// 原文（注释精简为单行）。静态展示，无复制按钮等交互依赖。

import { Typography } from "@heroui/react";

import { SectionHeader } from "./section-header";

import { LANDING_COPY } from "@/lib/copy";

interface TerminalLine {
  kind: "comment" | "command" | "output";
  text: string;
}

// packages/cli/README.md「快速开始（三步）」的精简版；命令面与 README 保持一致。
const LINES: TerminalLine[] = [
  { kind: "command", text: "npm install -g tokenusage-cli" },
  {
    kind: "comment",
    text: "# 1) 初始化：扫描工具、装用量 hook、注册每小时自动采集的计划任务",
  },
  { kind: "command", text: "tokenusage init" },
  {
    kind: "comment",
    text: "# 2) 配对：输出 user_code，浏览器打开链接批准（15 分钟内有效）",
  },
  { kind: "command", text: "tokenusage device-login" },
  { kind: "output", text: "→ https://<你的站点>/device?user_code=XXXX-XXXX" },
  { kind: "comment", text: "# 3) 上报" },
  { kind: "command", text: "tokenusage sync" },
  {
    kind: "output",
    text: "→ 完成。计划任务每小时自动采集，也可 tokenusage sync --watch 常驻",
  },
];

export function TerminalSteps() {
  const copy = LANDING_COPY.zh;

  return (
    <section className="border-t border-default/50">
      <div className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-24">
        <SectionHeader
          eyebrow={copy.terminal.eyebrow}
          sub={copy.terminal.sub}
          title={copy.terminal.title}
        />

        <div className="mt-10 overflow-hidden rounded-2xl border border-default/50 bg-surface-secondary">
          <div className="flex items-center gap-2 border-b border-default/50 px-4 py-3">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-full"
              style={{ background: "var(--color-chart-5)" }}
            />
            <span
              aria-hidden="true"
              className="size-2.5 rounded-full"
              style={{ background: "var(--color-chart-3)" }}
            />
            <span
              aria-hidden="true"
              className="size-2.5 rounded-full"
              style={{ background: "var(--color-chart-2)" }}
            />
            <Typography className="ms-3 font-mono text-xs" color="muted">
              terminal — tokenusage
            </Typography>
          </div>
          <div className="flex flex-col gap-1.5 overflow-x-auto px-5 py-5 font-mono text-[13px] leading-relaxed">
            {LINES.map((line, index) => (
              <span
                key={index}
                className={
                  line.kind === "comment" ? "text-muted" : "text-foreground"
                }
              >
                {line.kind === "command" ? (
                  <>
                    <span aria-hidden="true" className="me-2 text-muted">
                      $
                    </span>
                    <span className="whitespace-pre">{line.text}</span>
                  </>
                ) : (
                  <span className="whitespace-pre">{line.text}</span>
                )}
              </span>
            ))}
          </div>
        </div>

        <Typography
          className="mt-5 max-w-2xl text-balance"
          color="muted"
          type="body-xs"
        >
          {copy.terminal.note}
        </Typography>
      </div>
    </section>
  );
}
