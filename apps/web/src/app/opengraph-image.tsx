// 社交分享卡：请求时用 next/og 渲染一张 1200×630 的暗色品牌卡。
//
// 仪表盘是自托管私有应用，绝大多数页面要登录；这张卡片服务的是「把部署链接
// 发给别人」这类场景（IM 预览、代码仓库里的链接），所以只放品牌与定位，不放
// 任何采集数据，也不需要鉴权（proxy 的 matcher 不覆盖本路由）。
//
// 字体：Satori 只吃 ttf/otf/woff，仓库里预置的是 woff2 子集，所以卡片文案走
// 内置 Noto Sans、保持 ASCII。`TOKEN_USAGE_SITE_NAME` 若被部署方改成中文，
// 这里回退到默认词标，避免豆腐块（要中文卡片需先补一份 ttf/otf 子集并在此
// 通过 `fonts` 传入）。
//
// Satori 的两个坑（同 apps/landing 的卡片）：
// - 布局不用 `justifyContent: "space-between"`，改弹性占位，否则图片固有宽度
//   会参与剩余空间分配，整块被推向中间；
// - 图片按固有尺寸布局，CSS 尺寸需同时给 width/height 属性才稳。

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { siteName, siteUrl } from "@/lib/seo";

export const alt = "Self-hosted AI token usage tracking dashboard";

export const size = { width: 1200, height: 630 };

export const contentType = "image/png";

const COLOR = {
  bg: "#0a0a0b",
  panel: "#141417",
  line: "#27272d",
  text: "#f4f1ee",
  muted: "#8e8e98",
  accent: "#4b8ef7",
};

const LOGO_SIZE = 56;

/** ASCII-only wordmark: a CJK `TOKEN_USAGE_SITE_NAME` would render as tofu. */
const WORDMARK = /^[\x20-\x7E]+$/.test(siteName) ? siteName : "TokenUsage";

const HOST = siteUrl.host;

const CHIPS = [
  "40+ capture sources",
  "Per-device drill-down",
  "Model-level cost",
  "Public badge",
];

// 用 logo-dark.png（白底 + 深色字形）：这张卡是暗色底，黑底版会与背景糊成一片、
// 只剩字节没底板。素材本身是直角白块，下面套一层带圆角的容器裁一下。
const logoDataUri = `data:image/png;base64,${readFileSync(
  join(process.cwd(), "public", "logo-dark.png"),
).toString("base64")}`;

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
      {/* 品牌行 + 部署域名（弹性占位推开，不用 space-between） */}
      <div style={{ alignItems: "center", display: "flex" }}>          <div
            style={{
              borderRadius: 14,
              display: "flex",
              height: LOGO_SIZE,
              overflow: "hidden",
              width: LOGO_SIZE,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt=""
              height={LOGO_SIZE}
              src={logoDataUri}
              style={{ borderRadius: 14, display: "flex" }}
              width={LOGO_SIZE}
            />
          </div>
        <div
          style={{
            display: "flex",
            fontSize: 26,
            fontWeight: 600,
            marginLeft: 16,
          }}
        >
          {WORDMARK}
        </div>
        <div style={{ display: "flex", flexGrow: 1 }} />
        <div style={{ color: COLOR.muted, display: "flex", fontSize: 18 }}>
          {HOST}
        </div>
      </div>

      {/* 主区：定位文案 + 功能胶囊 */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          justifyContent: "center",
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
          SELF-HOSTED / OPEN SOURCE / MIT
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 54,
            fontWeight: 600,
            letterSpacing: -1.4,
            lineHeight: 1.14,
            width: 800,
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
            width: 720,
          }}
        >
          One account, many machines - usage and cost stay in your own Supabase.
          Collectors report only to the instance they paired with.
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 30 }}>
          {CHIPS.map((chip) => (
            <div
              key={chip}
              style={{
                border: `1px solid ${COLOR.line}`,
                borderRadius: 999,
                color: COLOR.muted,
                display: "flex",
                fontSize: 15,
                padding: "7px 14px",
              }}
            >
              {chip}
            </div>
          ))}
        </div>
      </div>

      {/* 页脚署名 */}
      <div
        style={{
          borderTop: `1px solid ${COLOR.line}`,
          color: COLOR.muted,
          display: "flex",
          fontSize: 16,
          paddingTop: 20,
        }}
      >
        Collect with tokenusage-cli - every instance keeps its own data
      </div>
    </div>,
    { ...size },
  );
}
