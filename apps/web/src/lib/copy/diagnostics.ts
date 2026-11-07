// Instance-diagnostics card copy (Settings · 设备分区「实例诊断」卡). Relocated
// from the former /service-status page (2026-11-07 信息架构调整).

/** The probes this card runs, in display order. */
export type DiagnosticsCheckName =
  "public-config" | "session" | "dashboard" | "account-devices";

export interface DiagnosticsCopy {
  cardTitle: string;
  cardHint: string;
  columnCheck: string;
  columnTarget: string;
  columnStatus: string;
  columnLatency: string;
  ok: string;
  fail: string;
  checking: string;
  retry: string;
  project: string;
  dashboardUrl: string;
  notConfigured: string;
  sessionLabel: string;
  sessionOk: string;
  sessionMissing: string;
  checks: Record<DiagnosticsCheckName, string>;
  detail: {
    tokens: string;
    devices: string;
  };
  latencyHint: string;
}

export const DIAGNOSTICS_COPY: Record<"zh" | "en", DiagnosticsCopy> = {
  zh: {
    cardTitle: "实例诊断",
    cardHint: "自查本实例的契约端点与会话链路健康度。",
    columnCheck: "检查项",
    columnTarget: "目标",
    columnStatus: "状态",
    columnLatency: "延迟",
    ok: "正常",
    fail: "异常",
    checking: "检查中",
    retry: "重新检查",
    project: "Supabase 项目",
    dashboardUrl: "配对回调地址",
    notConfigured: "未配置",
    sessionLabel: "会话",
    sessionOk: "会话有效",
    sessionMissing: "无会话",
    checks: {
      "public-config": "公开配置",
      session: "会话",
      dashboard: "仪表盘数据",
      "account-devices": "设备列表",
    },
    detail: {
      tokens: "总计 {count} tokens",
      devices: "{count} 台设备",
    },
    latencyHint: "延迟超过 {ms} ms 通常是 Serverless 冷启动，可以再检查一次。",
  },
  en: {
    cardTitle: "Instance diagnostics",
    cardHint:
      "Health self-check for this instance's contract endpoints and session.",
    columnCheck: "Check",
    columnTarget: "Target",
    columnStatus: "Status",
    columnLatency: "Latency",
    ok: "OK",
    fail: "FAIL",
    checking: "checking",
    retry: "Re-run checks",
    project: "Supabase project",
    dashboardUrl: "Pairing callback URL",
    notConfigured: "not configured",
    sessionLabel: "Session",
    sessionOk: "session valid",
    sessionMissing: "no session",
    checks: {
      "public-config": "Public config",
      session: "Session",
      dashboard: "Dashboard data",
      "account-devices": "Account devices",
    },
    detail: {
      tokens: "{count} tokens total",
      devices: "{count} devices",
    },
    latencyHint:
      "Latency above {ms} ms usually means a cold serverless start — run the checks again.",
  },
};
