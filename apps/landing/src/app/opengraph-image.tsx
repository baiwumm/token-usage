// 社交分享卡（静态导出时在构建期生成一次，产物即 out/ 里的 PNG）。
//
// 视觉沿用落地页的暗黑终端语言：近黑底 + 朱红强调色 + 终端窗口 + 一年热力
// 条，数字取自同一次部署的 `src/data/snapshot.json`，与 Hero 完全一致。
//
// 字体：Satori（next/og）只吃 ttf/otf/woff，仓库内只预置了 woff2 子集
// （`public/fonts/maple-mono-cn-regular.woff2`），所以本卡片只用内置
// Noto Sans 渲染、文案保持 ASCII/英文；要上中文标题需先补一份 ttf/otf
// 子集并通过 `fonts` 传入（见 apps/landing/README.md「SEO 与社交分享」）。

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { SITE_OG_IMAGE_ALT, SITE_OG_IMAGE_SIZE } from "@/lib/seo";
import { SNAPSHOT, formatCompactTokens } from "@/lib/snapshot";

export const alt = SITE_OG_IMAGE_ALT;

export const size = SITE_OG_IMAGE_SIZE;

export const contentType = "image/png";

// 静态导出下图片路由必须显式声明 force-static（构建期渲染一次）。
export const dynamic = "force-static";

const COLOR = {
  bg: "#0a0a0b",
  panel: "#131315",
  line: "#27272c",
  text: "#f4f1ee",
  muted: "#8e8e98",
  accent: "#c2402a",
};

// 品牌标与顶栏同一份素材（public/logo-dark.svg，白底 + 深色字形），构建期读成
// data URI 交给 Satori；换 logo 只改 SVG，不必动这张卡片。
//
// Satori 按 SVG 自带的 width/height 算 <img> 的固有尺寸（CSS width/height 不参与
// 布局，否则 360 的固有宽度会把品牌行推向右半边），所以读入后把根元素的
// width/height 改写成卡片尺寸、保留 viewBox，几何等比缩放。
const LOGO_SIZE = 42;

function logoDataUri(size: number): string {
  const svg = readFileSync(
    join(process.cwd(), "public", "logo-dark.svg"),
    "utf8",
  )
    .replace(/\swidth="[^"]*"/, ` width="${size}"`)
    .replace(/\sheight="[^"]*"/, ` height="${size}"`);

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

const LOGO_SRC = logoDataUri(LOGO_SIZE);

// 热力阶：--accent 派生色的静态近似（Satori 不支持 oklch(from …)）。
// 改主题色时同步这里与 globals.css 的 --heatmap-1..4。
const HEAT = ["#1f1f24", "#57291f", "#8a3527", "#b23d2b", "#d95b34"];

const { totals, meta, heatmap } = SNAPSHOT;

const TERMINAL_LINES: Array<{ kind: "cmd" | "out"; text: string }> = [
  { kind: "cmd", text: "npm i -g tokenusage-cli" },
  { kind: "cmd", text: "tokenusage init" },
  {
    kind: "out",
    text: `> ${meta.sourceCount} sources / ${meta.modelCount} models`,
  },
  { kind: "cmd", text: "tokenusage sync" },
  {
    kind: "out",
    text: `> ${formatCompactTokens(totals.tokens)} tokens tracked`,
  },
];

const STATS = [
  `${formatCompactTokens(totals.tokens)} tokens`,
  `${totals.activeDays} active days`,
  `${meta.sourceCount} sources`,
];

// 364 格按「周优先」存储，转成 7 行 × 52 列（与 Hero 热力图同一排布）。
const HEAT_ROWS = Array.from({ length: 7 }, (_, row) =>
  heatmap.cells.filter((_, index) => index % 7 === row),
);

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "stretch",
        background: COLOR.bg,
        color: COLOR.text,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        justifyContent: "space-between",
        padding: "56px 60px",
        width: "100%",
      }}
    >
      {" "}
      {/* 品牌行。
            不能用 justifyContent: "space-between"：Satori 分配剩余空间时会把
            SVG 的固有宽度算进去，品牌标会被整块推向中间；改用弹位占位推开右侧域
            名，两侧位置就都由 padding 决定。 */}
      <div style={{ alignItems: "center", display: "flex" }}>
        {" "}
        <div style={{ alignItems: "center", display: "flex", gap: 14 }}>
          {}{" "}
          {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders a
              data URI here; next/image cannot optimize it and has no route to. */}
          <img
            alt=""
            height={LOGO_SIZE}
            src={LOGO_SRC}
            style={{ display: "flex" }}
            width={LOGO_SIZE}
          />
          <div style={{ display: "flex", fontSize: 25, fontWeight: 600 }}>
            Token Usage
          </div>
        </div>{" "}
        <div style={{ display: "flex", flexGrow: 1 }} />
        <div style={{ display: "flex", fontSize: 19, color: COLOR.muted }}>
          token-usage.cc
        </div>
      </div>
      {/* 主区：定位文案 + 终端窗口 */}
      <div
        style={{
          alignItems: "center",
          display: "flex",
          flex: 1,
          gap: 52,
          marginBottom: 20,
          marginTop: 28,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flexGrow: 1,
            width: 0,
          }}
        >
          <div
            style={{
              color: COLOR.accent,
              display: "flex",
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: 2.4,
              marginBottom: 18,
            }}
          >
            OPEN SOURCE / SELF-HOSTED / MIT
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 52,
              fontWeight: 600,
              letterSpacing: -1.4,
              lineHeight: 1.14,
              width: 560,
            }}
          >
            All your AI token usage, one dashboard.
          </div>
          <div
            style={{
              color: COLOR.muted,
              display: "flex",
              fontSize: 21,
              lineHeight: 1.5,
              marginTop: 18,
              width: 520,
            }}
          >
            One account, many machines - usage and cost stay in your own
            Supabase. Collectors report only to the instance they paired with.
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 26 }}>
            {STATS.map((stat) => (
              <div
                key={stat}
                style={{
                  border: `1px solid ${COLOR.line}`,
                  borderRadius: 999,
                  color: COLOR.muted,
                  display: "flex",
                  fontSize: 15,
                  padding: "7px 14px",
                }}
              >
                {stat}
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            background: COLOR.panel,
            border: `1px solid ${COLOR.line}`,
            borderRadius: 16,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            width: 470,
          }}
        >
          <div
            style={{
              alignItems: "center",
              borderBottom: `1px solid ${COLOR.line}`,
              display: "flex",
              gap: 7,
              padding: "13px 18px",
            }}
          >
            <div
              style={{
                background: COLOR.accent,
                borderRadius: 999,
                display: "flex",
                height: 9,
                width: 9,
              }}
            />
            <div
              style={{
                background: "#4a4a53",
                borderRadius: 999,
                display: "flex",
                height: 9,
                width: 9,
              }}
            />
            <div
              style={{
                background: "#33333a",
                borderRadius: 999,
                display: "flex",
                height: 9,
                width: 9,
              }}
            />
            <div
              style={{
                color: COLOR.muted,
                display: "flex",
                fontSize: 13,
                marginLeft: 8,
              }}
            >
              terminal - tokenusage
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 11,
              padding: "22px 20px 26px",
            }}
          >
            {TERMINAL_LINES.map((line) => (
              <div
                key={line.text}
                style={{
                  color: line.kind === "out" ? COLOR.muted : COLOR.text,
                  display: "flex",
                  fontSize: 16,
                  lineHeight: 1.35,
                }}
              >
                {line.kind === "cmd" ? `$ ${line.text}` : line.text}
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* 一年热力条（真实快照等级）+ 站点署名 */}
      <div
        style={{
          alignItems: "flex-end",
          borderTop: `1px solid ${COLOR.line}`,
          display: "flex",
          justifyContent: "space-between",
          paddingTop: 22,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", fontSize: 17 }}>
            Self-hosted AI token usage tracking
          </div>
          <div style={{ color: COLOR.muted, display: "flex", fontSize: 15 }}>
            Built with Next.js 16 / HeroUI 3 / Supabase
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {HEAT_ROWS.map((row, rowIndex) => (
            <div key={rowIndex} style={{ display: "flex", gap: 4 }}>
              {row.map(([day, , level]) => (
                <div
                  key={day}
                  style={{
                    background: HEAT[Math.min(level, 4)],
                    borderRadius: 2,
                    display: "flex",
                    height: 9,
                    width: 9,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>,
    { ...size },
  );
}
