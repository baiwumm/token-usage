// 落地页文案字典。v1 中文单语（2026-11-08 拍板）；en 保留结构位，不接
// locale 机制——上双语时在此补全 en 对象并加选择逻辑即可。

export interface LandingCopy {
  nav: {
    tagline: string;
    cta: string;
  };
  hero: {
    eyebrow: string;
    sloganMain: string;
    sloganSub: string;
    primaryCta: string;
    githubCta: string;
    demoCta: string;
    demoNote: string;
    counters: {
      tokens: string;
      activeDays: string;
      sources: string;
      models: string;
    };
    facts: {
      cost: string;
      streak: string;
      peak: string;
    };
    snapshotNote: string;
  };
  terminal: {
    eyebrow: string;
    title: string;
    sub: string;
    note: string;
  };
  preview: {
    eyebrow: string;
    title: string;
    sub: string;
    totalLabel: string;
    periodLabel: string;
    kpiLabels: {
      cost: string;
      activeDays: string;
      sources: string;
      models: string;
    };
    trendTitle: string;
    heatmapTitle: string;
    shotsTitle: string;
    shotsNote: string;
    /** 与组件内 SHOTS 文件顺序一一对应。 */
    shots: string[];
  };
  features: {
    eyebrow: string;
    title: string;
    sub: string;
    items: Array<{ title: string; body: string }>;
    shareCardsTitle: string;
    shareCardsSub: string;
    zoomHint: string;
    closePreview: string;
  };
  ownership: {
    eyebrow: string;
    title: string;
    statement: string;
    points: Array<{ title: string; body: string }>;
  };
  deploy: {
    eyebrow: string;
    title: string;
    sub: string;
    steps: Array<{ title: string; body: string }>;
    primaryCta: string;
    guideCta: string;
    githubCta: string;
  };
  footer: {
    badgeTitle: string;
    badgeSub: string;
    columns: Array<{
      title: string;
      links: Array<{ label: string; href: string }>;
    }>;
    attribution: string;
    /** 备案信息：展示在页脚右下角；空串隐藏对应条目。 */
    beian: {
      /** 工信部 ICP 备案号，链接固定指向 beian.miit.gov.cn。 */
      icp: string;
      /** 公安网安备号，链接由其中数字自动生成。 */
      police: string;
    };
    rights: string;
  };
}

export const LANDING_COPY: Record<"zh" | "en", LandingCopy> = {
  zh: {
    nav: {
      tagline: "自托管 AI 用量追踪",
      cta: "立即部署",
    },
    hero: {
      eyebrow: "开源 · 自托管 · MIT",
      sloganMain: "所有采集端的 AI 用量，一块仪表盘看完。",
      sloganSub:
        "一个邮箱、多台设备，用量与成本数据完全落在你自己的 Supabase 里。采集端只向配对实例上报，跨实例零共享。",
      primaryCta: "Deploy to Vercel",
      githubCta: "GitHub",
      demoCta: "查看公开页演示",
      demoNote: "真实实例的公开用量页",
      counters: {
        tokens: "累计 Tokens",
        activeDays: "活跃天数",
        sources: "采集来源",
        models: "模型数",
      },
      facts: {
        cost: "总成本",
        streak: "最长连续",
        peak: "单日峰值",
      },
      snapshotNote: "数据快照 · 截至 2026-11-08 · 来自真实自部署实例的公开数据",
    },
    terminal: {
      eyebrow: "01 / 接入",
      title: "三步接入",
      sub: "npm 安装采集端，配对一次，每小时自动采集。",
      note: "init 注册的计划任务每小时自动采集一次；对本地 AI 工具日志只读，不改动任何文件。",
    },
    preview: {
      eyebrow: "02 / 仪表盘",
      title: "从总量到单日，逐层下钻",
      sub: "KPI、来源构成、趋势与热力图——以下为真实实例数据的静态重绘。",
      totalLabel: "总 Tokens",
      periodLabel: "全部时间",
      kpiLabels: {
        cost: "总成本",
        activeDays: "活跃天数",
        sources: "采集来源",
        models: "模型数",
      },
      trendTitle: "近 30 天趋势",
      heatmapTitle: "近一年活跃热力图",
      shotsTitle: "后台实拍",
      shotsNote: "真实实例截图 · 深色主题，与本页同一抹朱红",
      shots: [
        "仪表盘总览 —— 总量、来源构成与模型占比",
        "用量趋势 —— 按日/按月切换、构成拆分与成本分析",
        "成就墙 —— 20 条成就 × 5 档段位，读时计算",
        "年度回顾 —— 全年聚合、月度趋势与年度成就",
      ],
    },
    features: {
      eyebrow: "03 / 功能",
      title: "功能一览",
      sub: "仪表盘、明细、成就、徽章——自托管实例的完整功能面。",
      items: [
        {
          title: "多设备配对",
          body: "桌面 / 笔记本各自独立配对、独立吊销，用量按账户聚合、按设备下钻。",
        },
        {
          title: "Sessions 会话明细",
          body: "会话级明细可排序筛选，按当前条件导出 CSV。",
        },
        {
          title: "四风格分享卡",
          body: "特刊 / 小票 / 霓虹 / 唱片四种版式，Canvas 直出 PNG，复制即分享。",
        },
        {
          title: "成就墙",
          body: "20 条成就 × 5 档段位（铜银金钻王者），账号级、只升不降。",
        },
        {
          title: "公开徽章与公开页",
          body: "SVG 徽章可嵌 README，/u/ 公开用量页令牌即凭证，无需登录。",
        },
        {
          title: "年度回顾",
          body: "wrapped 页回看一年的用量、模型与成就。",
        },
        {
          title: "来源与模型双维度",
          body: "39 个采集来源（Claude Code / Codex / Cursor / ZCode…），模型级成本归因。",
        },
        {
          title: "credits 独立维度",
          body: "订阅积分作为独立维度展示，不混入 token 与成本口径。",
        },
        {
          title: "契约先行",
          body: "CLI 采集契约两档制：采集面硬冻结，仪表盘面随 UI 演进。",
        },
      ],
      shareCardsTitle: "分享卡 · 四种版式",
      shareCardsSub:
        "同一份数据，四种气质——由 Canvas 手绘引擎直出，点击卡片放大预览。",
      zoomHint: "放大预览",
      closePreview: "关闭预览",
    },
    ownership: {
      eyebrow: "04 / 数据自主",
      title: "数据在你手里",
      statement: "采集端只向配对实例上报，跨实例零共享。",
      points: [
        {
          title: "本地采集",
          body: "采集端解析本地 AI 工具日志，只读不改动，离线时先入队、联网后补传。",
        },
        {
          title: "独立上报",
          body: "每个部署实例绑定自己的 Supabase 项目，采集端只向配对实例上报。",
        },
        {
          title: "完全自主",
          body: "token_* 表对匿名角色零 policy，浏览器端零数据库直连，数据面全部走服务端。",
        },
      ],
    },
    deploy: {
      eyebrow: "05 / 自部署",
      title: "五分钟自部署",
      sub: "Supabase 建库 + Vercel 部署 + CLI 配对，从零跑通完整闭环。",
      steps: [
        {
          title: "创建 Supabase 项目",
          body: "跑迁移建 token_* 表（RLS 全拒），配置 Auth 与站点 URL。",
        },
        {
          title: "部署到 Vercel",
          body: "一键 Deploy 按钮 + 4 个环境变量，框架自动识别。",
        },
        {
          title: "配对采集端",
          body: "tokenusage init / device-login / sync，浏览器批准配对码即完成。",
        },
      ],
      primaryCta: "Deploy to Vercel",
      guideCta: "阅读部署指南",
      githubCta: "GitHub 仓库",
    },
    footer: {
      badgeTitle: "实时公开徽章",
      badgeSub: "作者实例的真实用量，由本项目的公开徽章端点渲染",
      columns: [
        {
          title: "产品",
          links: [
            { label: "功能一览", href: "#features" },
            { label: "自部署", href: "#deploy" },
            // Sentinel: replaced with the README-derived public page URL
            // at render time (the demo lives on the operator's instance).
            { label: "公开页演示", href: "#public-page" },
          ],
        },
        {
          title: "资源",
          links: [
            { label: "GitHub", href: "https://github.com/baiwumm/token-usage" },
            {
              label: "部署指南",
              href: "https://github.com/baiwumm/token-usage/blob/main/docs/deploy-guide.md",
            },
            {
              label: "CLI 契约",
              href: "https://github.com/baiwumm/token-usage/blob/main/docs/cli-contract.md",
            },
            {
              label: "npm · tokenusage-cli",
              href: "https://www.npmjs.com/package/tokenusage-cli",
            },
          ],
        },
        {
          title: "许可",
          links: [
            // Sentinel hrefs resolved to the repo LICENSE files at render
            // time (AGENTS 规则 10：署名只指向这两份文件).
            { label: "LICENSE", href: "#license" },
            { label: "THIRD_PARTY_NOTICES", href: "#third-party" },
          ],
        },
      ],
      attribution: "代码来源与第三方许可见 LICENSE 与 THIRD_PARTY_NOTICES。",
      beian: {
        icp: "粤ICP备2023007649号-5",
        // 公安网备尚未提交，拿到备案号后填在这里（数字部分会自动进查询链接）。
        police: "",
      },
      rights: "© 2026 Token Usage · token-usage.cc",
    },
  },
  en: {
    nav: {
      tagline: "Self-hosted AI token tracking",
      cta: "Deploy now",
    },
    hero: {
      eyebrow: "Open source · Self-hosted · MIT",
      sloganMain: "All your AI usage, one dashboard.",
      sloganSub:
        "One account, many devices — usage and cost data live entirely in your own Supabase. Captured locally, reported only to your instance, zero cross-instance sharing.",
      primaryCta: "Deploy to Vercel",
      githubCta: "GitHub",
      demoCta: "View live demo",
      demoNote: "Public usage page of a real instance",
      counters: {
        tokens: "Total tokens",
        activeDays: "Active days",
        sources: "Capture sources",
        models: "Models",
      },
      facts: {
        cost: "Total cost",
        streak: "Longest streak",
        peak: "Peak day",
      },
      snapshotNote:
        "Data snapshot · as of 2026-11-08 · from a real self-hosted instance",
    },
    terminal: {
      eyebrow: "01 / Setup",
      title: "Three steps in",
      sub: "Install the collector, pair once, harvest hourly.",
      note: "init registers an hourly scheduled task; local AI tool logs are read-only.",
    },
    preview: {
      eyebrow: "02 / Dashboard",
      title: "From totals down to a single day",
      sub: "KPIs, source mix, trends and heatmap — static redraw of real instance data.",
      totalLabel: "Total tokens",
      periodLabel: "All time",
      kpiLabels: {
        cost: "Total cost",
        activeDays: "Active days",
        sources: "Sources",
        models: "Models",
      },
      trendTitle: "Last 30 days",
      heatmapTitle: "Year activity heatmap",
      shotsTitle: "Inside the app",
      shotsNote:
        "Real instance screenshots · dark theme, the same vermillion as this page",
      shots: [
        "Dashboard overview — totals, source mix and model shares",
        "Usage trends — daily/monthly, composition breakdown, cost analysis",
        "Achievement wall — 20 achievements × 5 tiers, computed at read time",
        "Yearly wrapped — annual aggregates, monthly trend and year achievements",
      ],
    },
    features: {
      eyebrow: "03 / Features",
      title: "Everything in the box",
      sub: "Dashboard, sessions, achievements, badges — the full self-hosted surface.",
      items: [
        {
          title: "Multi-device pairing",
          body: "Each collector pairs and revokes independently; usage aggregates per account, drills down per device.",
        },
        {
          title: "Session details",
          body: "Sortable session-level records with CSV export of the current filter.",
        },
        {
          title: "Four share-card styles",
          body: "Broadsheet / receipt / neon / vinyl — Canvas-drawn PNGs, copy and share.",
        },
        {
          title: "Achievement wall",
          body: "20 achievements × 5 tiers, account-level, never regress.",
        },
        {
          title: "Public badge & page",
          body: "SVG badge for your README; the /u/ public page unlocks with the token alone.",
        },
        {
          title: "Yearly wrapped",
          body: "Revisit a year of usage, models and achievements.",
        },
        {
          title: "Sources & models",
          body: "39 capture sources (Claude Code / Codex / Cursor / ZCode…) with model-level cost attribution.",
        },
        {
          title: "Credits as a dimension",
          body: "Subscription credits shown as their own dimension, never mixed into tokens or cost.",
        },
        {
          title: "Contract first",
          body: "Two-tier CLI capture contract: frozen capture surface, evolving dashboard surface.",
        },
      ],
      shareCardsTitle: "Share cards · four styles",
      shareCardsSub:
        "One dataset, four temperaments — drawn by the Canvas engine. Click a card to zoom in.",
      zoomHint: "Zoom in",
      closePreview: "Close preview",
    },
    ownership: {
      eyebrow: "04 / Data ownership",
      title: "Your data stays yours",
      statement:
        "Collectors report only to their paired instance; zero cross-instance sharing.",
      points: [
        {
          title: "Captured locally",
          body: "Parses local AI tool logs read-only; queues offline, uploads when back online.",
        },
        {
          title: "Paired reporting",
          body: "Each deployment binds its own Supabase project; collectors talk only to their pair.",
        },
        {
          title: "Fully yours",
          body: "token_* tables grant nothing to anon roles; the browser never touches the database.",
        },
      ],
    },
    deploy: {
      eyebrow: "05 / Self-host",
      title: "Self-host in five minutes",
      sub: "Supabase schema + Vercel deploy + CLI pairing — a full loop from zero.",
      steps: [
        {
          title: "Create the Supabase project",
          body: "Run migrations for the token_* tables (RLS fully denied), configure Auth and the site URL.",
        },
        {
          title: "Deploy to Vercel",
          body: "One-click Deploy button + 4 environment variables; the framework is auto-detected.",
        },
        {
          title: "Pair the collector",
          body: "tokenusage init / device-login / sync; approve the pairing code in the browser.",
        },
      ],
      primaryCta: "Deploy to Vercel",
      guideCta: "Read the deploy guide",
      githubCta: "GitHub repository",
    },
    footer: {
      badgeTitle: "Live public badge",
      badgeSub:
        "Real usage of the author's instance, rendered by the badge endpoint",
      columns: [
        {
          title: "Product",
          links: [
            { label: "Features", href: "#features" },
            { label: "Self-host", href: "#deploy" },
            // Sentinel for the README-derived public page URL.
            { label: "Public page demo", href: "#public-page" },
          ],
        },
        {
          title: "Resources",
          links: [
            { label: "GitHub", href: "https://github.com/baiwumm/token-usage" },
            {
              label: "Deploy guide",
              href: "https://github.com/baiwumm/token-usage/blob/main/docs/deploy-guide.md",
            },
            {
              label: "CLI contract",
              href: "https://github.com/baiwumm/token-usage/blob/main/docs/cli-contract.md",
            },
            {
              label: "npm · tokenusage-cli",
              href: "https://www.npmjs.com/package/tokenusage-cli",
            },
          ],
        },
        {
          title: "License",
          links: [
            // Sentinel hrefs resolved to the repo LICENSE files at render time.
            { label: "LICENSE", href: "#license" },
            { label: "THIRD_PARTY_NOTICES", href: "#third-party" },
          ],
        },
      ],
      attribution:
        "Code provenance and third-party notices live in LICENSE and THIRD_PARTY_NOTICES.",
      beian: {
        icp: "",
        police: "",
      },
      rights: "© 2026 Token Usage · token-usage.cc",
    },
  },
};
