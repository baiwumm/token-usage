// Hero 来源 logo 循环（2026-11-11 操作者要求）：16 枚采集端 mark 分两行，
// 上行向左、下行向右的纯 CSS marquee。每行内容复制一份，靠 translateX(-50%)
// 无缝衔接；悬停暂停，reduced-motion 由全局规则停用。
// 装饰性元素：容器 aria-hidden，单枚 logo 用 title 提示名称（同旧 logo 墙）。

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

export function SourceLogoLoop() {
  const half = Math.ceil(LOGOS.length / 2);
  const rows = [LOGOS.slice(0, half), LOGOS.slice(half)];

  return (
    <div
      aria-hidden="true"
      className="mt-10 flex flex-col gap-4 mask-[linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]"
    >
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className="overflow-hidden">
          <div
            className={`flex w-max ${
              rowIndex === 0 ? "landing-logo-left" : "landing-logo-right"
            }`}
          >
            {[0, 1].map((copy) => (
              <div
                key={copy}
                className="flex shrink-0 items-center gap-12 pr-12"
              >
                {row.map((logo) => (
                  <span
                    key={logo.file}
                    className="flex shrink-0 items-center"
                    title={logo.label}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt=""
                      className="h-5 w-auto opacity-70"
                      height={20}
                      loading="lazy"
                      src={logo.file}
                      width={20}
                    />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
