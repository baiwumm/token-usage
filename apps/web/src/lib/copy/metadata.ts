// SEO copy shared by server-side generateMetadata. Titles stay aligned with
// the UI dictionaries; descriptions are metadata-only.

import type { Locale } from "./locale-config";

import { LOGIN_COPY } from "./login";
import { NAV_COPY } from "./nav";

export type PageSeoKey =
  | "dashboard"
  | "login"
  | "settings"
  | "sessions"
  | "service-status"
  | "device"
  | "wrapped";

export interface PageSeoCopy {
  title: string;
  description: string;
}

export interface SiteSeoCopy {
  description: string;
  keywords: string[];
}

export const SITE_SEO_COPY: Record<Locale, SiteSeoCopy> = {
  zh: {
    description:
      "自托管 AI token 用量追踪：统一查看 Claude Code、Codex、OpenCode、Cursor 等 AI 编码工具的 token 消耗与成本。",
    keywords: [
      "TokenUsage",
      "Token Usage",
      "AI token 用量",
      "Token 用量追踪",
      "AI 编码工具",
      "Claude Code",
      "Codex",
      "OpenCode",
      "Cursor",
      "自托管",
      "self-hosted",
      "LLM cost tracking",
    ],
  },
  en: {
    description:
      "Self-hosted AI token usage tracking for Claude Code, Codex, OpenCode, Cursor, and other AI coding tools.",
    keywords: [
      "TokenUsage",
      "Token Usage",
      "AI token usage",
      "token usage tracker",
      "LLM cost tracking",
      "AI coding tools",
      "Claude Code",
      "Codex",
      "OpenCode",
      "Cursor",
      "self-hosted",
    ],
  },
};

export const PAGE_SEO_COPY: Record<Locale, Record<PageSeoKey, PageSeoCopy>> = {
  zh: {
    dashboard: {
      title: NAV_COPY.zh.dashboard,
      description: "查看 AI 编码工具的 token 用量、成本、模型分布与会话趋势。",
    },
    login: {
      title: LOGIN_COPY.zh.pageTitle,
      description: "登录 TokenUsage，查看自托管 AI token 用量追踪仪表盘。",
    },
    settings: {
      title: NAV_COPY.zh.settings,
      description:
        "管理 TokenUsage 的账户资料、外观偏好、货币、设备与数据采集设置。",
    },
    sessions: {
      title: NAV_COPY.zh.sessions,
      description: "浏览 AI 编码会话的 token 用量、模型与项目明细。",
    },
    "service-status": {
      title: NAV_COPY.zh.status,
      description: "检查 TokenUsage 仪表盘与 CLI 采集链路的服务状态。",
    },
    device: {
      title: NAV_COPY.zh.device,
      description: "批准 CLI 设备配对请求，将本机采集器连接到 TokenUsage。",
    },
    wrapped: {
      title: NAV_COPY.zh.wrapped,
      description: "回顾年度 AI token 用量、成本与模型使用趋势。",
    },
  },
  en: {
    dashboard: {
      title: NAV_COPY.en.dashboard,
      description:
        "Track token usage, cost, model mix and session trends across your AI coding tools.",
    },
    login: {
      title: LOGIN_COPY.en.pageTitle,
      description:
        "Sign in to TokenUsage to view your self-hosted AI token usage dashboard.",
    },
    settings: {
      title: NAV_COPY.en.settings,
      description:
        "Manage your TokenUsage account, appearance, currency, devices and collection settings.",
    },
    sessions: {
      title: NAV_COPY.en.sessions,
      description:
        "Browse token usage, models and projects for your AI coding sessions.",
    },
    "service-status": {
      title: NAV_COPY.en.status,
      description:
        "Check the health of the TokenUsage dashboard and CLI ingestion endpoints.",
    },
    device: {
      title: NAV_COPY.en.device,
      description:
        "Approve a CLI device pairing request and connect a collector to TokenUsage.",
    },
    wrapped: {
      title: NAV_COPY.en.wrapped,
      description: "Review your year in AI token usage, cost and model trends.",
    },
  },
};
