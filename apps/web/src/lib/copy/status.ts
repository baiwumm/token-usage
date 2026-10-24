// Service-status page copy (端点健康自查页).

export interface StatusCopy {
  pageTitle: string;
  pageSubtitle: string;
  columnCheck: string;
  columnTarget: string;
  columnStatus: string;
  columnLatency: string;
  ok: string;
  fail: string;
  checking: string;
  loading: string;
  retry: string;
  project: string;
  dashboardUrl: string;
  notConfigured: string;
  sessionOk: string;
  sessionMissing: string;
}

export const STATUS_COPY: Record<"zh" | "en", StatusCopy> = {
  zh: {
    pageTitle: "服务状态",
    pageSubtitle: "自查本实例的契约端点与会话链路健康度。",
    columnCheck: "检查项",
    columnTarget: "目标",
    columnStatus: "状态",
    columnLatency: "延迟",
    ok: "正常",
    fail: "异常",
    checking: "检查中",
    loading: "正在检查…",
    retry: "重新检查",
    project: "Supabase 项目",
    dashboardUrl: "配对回调地址",
    notConfigured: "未配置",
    sessionOk: "会话有效",
    sessionMissing: "无会话",
  },
  en: {
    pageTitle: "Service status",
    pageSubtitle:
      "Health self-check for this instance's contract endpoints and session.",
    columnCheck: "Check",
    columnTarget: "Target",
    columnStatus: "Status",
    columnLatency: "Latency",
    ok: "OK",
    fail: "FAIL",
    checking: "checking",
    loading: "Checking…",
    retry: "Re-run checks",
    project: "Supabase project",
    dashboardUrl: "Pairing callback URL",
    notConfigured: "not configured",
    sessionOk: "session valid",
    sessionMissing: "no session",
  },
};
