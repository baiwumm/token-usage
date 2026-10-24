// Landing page copy (docs/requirements.md 范围表：/ 公开落地页).
// 执行者起草版 —— 验收时操作者定稿（2026-10-24 拍板事项 1）。

export interface LandingCopy {
  brandTagline: string;
  login: string;
  github: string;
  deployGuide: string;
  heroTitle: string;
  heroSubtitle: string;
  heroCta: string;
  featuresHeading: string;
  features: Array<{ title: string; description: string }>;
  footerLicense: string;
  footerNote: string;
}

export const LANDING_COPY: Record<"zh" | "en", LandingCopy> = {
  zh: {
    brandTagline: "自托管 AI token 用量追踪",
    login: "登录",
    github: "GitHub",
    deployGuide: "部署指南",
    heroTitle: "一块仪表盘，看清全部 AI Token 用量",
    heroSubtitle:
      "Token Usage 是开源自托管的 token 用量追踪：一个邮箱、多台设备，CLI 采集上报，聚合展示 token 与成本。数据全部落在你自己的 Supabase 里。",
    heroCta: "立即登录",
    featuresHeading: "为个人与小型团队而生",
    features: [
      {
        title: "多设备聚合",
        description:
          "一个账户接入多台采集设备，按设备下钻，跨设备上报自动去重合并。",
      },
      {
        title: "数据主权",
        description:
          "自部署 + 你自己的 Supabase 项目：数据表对客户端角色全拒，数据只属于部署者。",
      },
      {
        title: "成本透明",
        description:
          "读取时按 LiteLLM 快照定价逐桶核算，token 数与美元成本同屏可见。",
      },
    ],
    footerLicense: "MIT License",
    footerNote: "Token Usage · 开源自托管",
  },
  en: {
    brandTagline: "Self-hosted AI token usage tracking",
    login: "Sign in",
    github: "GitHub",
    deployGuide: "Deploy guide",
    heroTitle: "One dashboard for all your AI token usage",
    heroSubtitle:
      "Token Usage is open-source and self-hosted: one account, many devices, CLI-based collection, aggregated tokens and costs. All data lives in your own Supabase project.",
    heroCta: "Sign in now",
    featuresHeading: "Built for individuals and small teams",
    features: [
      {
        title: "Multi-device aggregation",
        description:
          "Pair every collector to one account, drill down per device, and let cross-device reports dedupe automatically.",
      },
      {
        title: "Data sovereignty",
        description:
          "Self-deployed against your own Supabase project: tables deny client roles entirely, so data belongs to the deployer alone.",
      },
      {
        title: "Transparent costs",
        description:
          "Per-bucket read-time pricing off a LiteLLM snapshot — token counts and USD costs side by side.",
      },
    ],
    footerLicense: "MIT License",
    footerNote: "Token Usage · Open source, self-hosted",
  },
};

export const GITHUB_URL = "https://github.com/baiwumm/token-usage";
// The standalone deploy guide lands with M5; until then the repo README is
// the canonical self-hosting entry point.
export const DEPLOY_GUIDE_URL = GITHUB_URL;
