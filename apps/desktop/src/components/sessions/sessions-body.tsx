import type { SessionRow } from "@/lib/sessions";

import { toast } from "@heroui/react";
import { useEffect, useState } from "react";

import { useSessions } from "@/hooks/use-sessions";
import { README_URL } from "@/lib/links";
import { SessionsBar } from "@/components/sessions/sessions-bar";
import { SessionsDetailDialog } from "@/components/sessions/sessions-detail-dialog";
import { SessionsSummaryCards } from "@/components/sessions/sessions-summary-cards";
import { SessionsTable } from "@/components/sessions/sessions-table";

/**
 * Sessions view (desktop-plan §12.13): the web /sessions anatomy over the
 * local sidecar — filter bar, four totals cards, the list and the detail
 * dialog. Mounts read the sidecar once; the bar's refresh re-reads, matching
 * the web page's explicit refresh model.
 */
export function SessionsBody({
  deviceName,
  onOpenUrl,
}: {
  /** Hostname for the CSV device_name column (tracker_paths). */
  deviceName: string;
  onOpenUrl: (url: string) => void;
}) {
  const sessions = useSessions();
  const [detail, setDetail] = useState<SessionRow | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    void sessions.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once on mount
  }, []);

  const handleExportCsv = () => {
    setExporting(true);
    void sessions.exportCsv(deviceName).then((result) => {
      setExporting(false);
      if (result.status === "saved") {
        // The path is the operator's one question after a save ("存哪了？") —
        // always name the landing spot, same rule as the share-card save.
        toast.success(`已导出 ${sessions.page.total} 条会话：${result.path}`);
      } else if (result.status === "failed") {
        toast("导出失败，请重试");
      }
      // cancelled: the operator closed the save dialog, nothing to report.
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <SessionsBar
        exporting={exporting}
        facets={sessions.facets}
        hasNarrowingFilters={sessions.hasNarrowingFilters}
        range={sessions.range}
        refreshing={sessions.refreshing}
        source={sessions.source}
        updatedAt={sessions.updatedAt}
        onClearFilters={sessions.clearFilters}
        onExportCsv={handleExportCsv}
        onRangeChange={sessions.setRange}
        onRefresh={() => void sessions.refresh()}
        onSourceChange={sessions.setSource}
      />
      {sessions.partial ? (
        <div className="bg-warning/10 text-warning border-warning/20 rounded-2xl border px-3 py-2 text-xs">
          会话记录超过整读上限，当前仅显示最新部分；缩小时间范围可看到更完整的窗口。
        </div>
      ) : null}
      <SessionsSummaryCards
        loading={sessions.loading}
        totals={sessions.totals}
      />
      <SessionsTable
        creditsInWindow={sessions.totals.credits > 0}
        hasNarrowingFilters={sessions.hasNarrowingFilters}
        loading={sessions.loading}
        offset={sessions.offset}
        pageSize={sessions.pageSize}
        refreshing={sessions.refreshing}
        rows={sessions.page.rows}
        total={sessions.page.total}
        onClearFilters={sessions.clearFilters}
        onOffsetChange={sessions.setOffset}
        onOpenDocs={() => onOpenUrl(README_URL)}
        onPageSizeChange={sessions.setPageSize}
        onViewDetail={(session) => setDetail(session)}
      />
      <SessionsDetailDialog
        session={detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      />
    </div>
  );
}
