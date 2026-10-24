"use client";

// Wrapped (annual review) at /wrapped — year totals, monthly trend,
// highlights, and a Canvas-2D share card export. Data comes from the
// frozen Dashboard-face endpoints (dashboard payload + account-monthly).

import { ArrowDownToLine } from "@gravity-ui/icons";
import {
  Button,
  Card,
  ListBox,
  Select,
  Spinner,
  Typography,
  toast,
} from "@heroui/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { DailyChart } from "../../dashboard/charts";

import { authBrowserClient } from "@/lib/auth/browser";
import { LOGIN_PATH } from "@/lib/auth/next-path";
import { WRAPPED_COPY } from "@/lib/copy/wrapped";
import { useLocale } from "@/lib/copy/locale";
import {
  DashboardApiError,
  fetchDashboard,
  fetchMonthly,
  type DashboardPayload,
  type MonthlyPoint,
} from "@/lib/dashboard/api";
import { formatCost, formatTokens } from "@/app/dashboard/panels";
import { yearMonthlyWindow, yearRange } from "@/lib/dashboard/ranges";

type LoadStatus = "loading" | "ready" | "error";

const CURRENT_YEAR = new Date().getUTCFullYear();

export function WrappedClient() {
  const router = useRouter();
  const [locale] = useLocale();
  const copy = WRAPPED_COPY[locale];

  const [status, setStatus] = useState<LoadStatus>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [monthly, setMonthly] = useState<MonthlyPoint[]>([]);
  const [year, setYear] = useState(CURRENT_YEAR);
  const [exporting, setExporting] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const redirectToLogin = useCallback(() => {
    router.replace(`${LOGIN_PATH}?next=${encodeURIComponent("/wrapped")}`);
  }, [router]);

  const loadAll = useCallback(
    async (token: string) => {
      setStatus("loading");
      setLoadError(null);

      try {
        const tzRange = yearRange(year, "UTC");
        const [nextPayload, nextMonthly] = await Promise.all([
          fetchDashboard(token, {
            fromIso: tzRange.fromIso,
            toIso: tzRange.toIso,
            rangeKey: "custom",
          }),
          fetchMonthly(token, yearMonthlyWindow(year)),
        ]);

        setPayload(nextPayload);
        setMonthly(nextMonthly.data);
        setStatus("ready");
      } catch (error) {
        if (error instanceof DashboardApiError && error.status === 401) {
          redirectToLogin();

          return;
        }
        setLoadError(error instanceof Error ? error.message : "error");
        setStatus("error");
      }
    },
    [year, redirectToLogin],
  );

  useEffect(() => {
    const supabase = authBrowserClient();

    void (async () => {
      const {
        data: { session },
      } = (await supabase?.auth.getSession()) ?? { data: { session: null } };

      if (!session?.access_token) {
        redirectToLogin();

        return;
      }
      setAccessToken(session.access_token);
      await loadAll(session.access_token);
    })();
  }, [loadAll, redirectToLogin]);

  // Canvas-drawn share card: html-to-image hangs cloning this page's
  // Tailwind-4/oklch computed styles (tried font on/off, pixelRatio 1/2 --
  // the img.load step never settles), so the export draws the same design
  // with Canvas 2D directly. Deterministic and resolution-independent.
  function drawShareCard(): string {
    const width = 1200;
    const height = 630;
    const scale = 2;
    const canvas = document.createElement("canvas");

    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");

    if (!ctx) throw new Error("canvas unavailable");
    ctx.scale(scale, scale);

    const yearTotals = totals;
    const font = '"Maple Mono CN", ui-monospace, monospace';

    // Backdrop: dark brand surface with a soft primary glow.
    ctx.fillStyle = "#101014";
    ctx.fillRect(0, 0, width, height);
    const glow = ctx.createRadialGradient(
      width - 160,
      120,
      40,
      width - 160,
      120,
      520,
    );

    glow.addColorStop(0, "rgba(99,102,241,0.35)");
    glow.addColorStop(1, "rgba(99,102,241,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    ctx.textBaseline = "top";

    // Header.
    ctx.fillStyle = "#f1f1f3";
    ctx.font = `600 30px ${font}`;
    ctx.fillText("Token Usage", 64, 56);
    ctx.fillStyle = "rgba(241,241,243,0.55)";
    ctx.font = `400 16px ${font}`;
    ctx.fillText(copy.share.cardCaption, 64, 96);

    // Year headline.
    ctx.fillStyle = "rgba(241,241,243,0.7)";
    ctx.font = `400 22px ${font}`;
    ctx.fillText(String(year), 64, 150);
    ctx.fillStyle = "#f1f1f3";
    ctx.font = `700 54px ${font}`;
    ctx.fillText(copy.pageTitle, 64, 184);

    // Big token number.
    ctx.fillStyle = "#818cf8";
    ctx.font = `700 64px ${font}`;
    ctx.fillText(formatTokens(yearTotals?.total_tokens ?? 0), 64, 268);
    ctx.fillStyle = "rgba(241,241,243,0.55)";
    ctx.font = `400 18px ${font}`;
    ctx.fillText(copy.cards.totalTokens, 64, 344);

    // Stat tiles.
    const tiles: Array<[string, string]> = [
      [copy.cards.cost, formatCost(yearTotals?.total_cost_usd ?? 0)],
      [copy.cards.conversations, formatTokens(yearTotals?.conversations ?? 0)],
      [copy.cards.activeDays, String(yearTotals?.active_days ?? 0)],
    ];
    let tileX = 64;

    for (const [label, value] of tiles) {
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.beginPath();
      ctx.roundRect(tileX, 404, 330, 108, 14);
      ctx.fill();
      ctx.fillStyle = "rgba(241,241,243,0.55)";
      ctx.font = `400 15px ${font}`;
      ctx.fillText(label, tileX + 22, 428);
      ctx.fillStyle = "#f1f1f3";
      ctx.font = `600 28px ${font}`;
      ctx.fillText(value, tileX + 22, 458);
      tileX += 354;
    }

    // Highlights line.
    if (highlights.length > 0) {
      ctx.fillStyle = "rgba(241,241,243,0.7)";
      ctx.font = `400 17px ${font}`;
      const line = highlights
        .map(([label, value]) => `${label}: ${value}`)
        .join("   ·   ");

      ctx.fillText(line.slice(0, 110), 64, 560);
    }

    return canvas.toDataURL("image/png");
  }

  async function exportCard() {
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("export timeout")), 15_000);
    });

    try {
      const dataUrl = await Promise.race([drawShareCard(), timeout]);
      const link = document.createElement("a");

      link.download = `token-usage-wrapped-${year}.png`;
      link.href = dataUrl;
      link.click();
      toast.success(copy.share.exported);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "";

      toast(
        detail
          ? `${copy.share.exportFailed} (${detail})`
          : copy.share.exportFailed,
      );
    } finally {
      setExporting(false);
    }
  }

  const totals = payload?.totals;
  const hasData = (totals?.total_tokens ?? 0) > 0;
  const models = payload?.models ?? [];
  const sources = payload?.sources ?? [];
  const daily = payload?.daily ?? [];
  const peakDay =
    daily.length > 0
      ? daily.reduce((best, day) =>
          day.total_tokens > best.total_tokens ? day : best,
        )
      : null;

  const highlights: Array<[string, string]> = [];

  if (models[0]) {
    highlights.push([
      copy.topModel,
      `${models[0].model} · ${formatTokens(models[0].total_tokens)}`,
    ]);
  }
  if (sources[0]) {
    highlights.push([
      copy.topSource,
      `${sources[0].source} · ${formatTokens(sources[0].total_tokens)}`,
    ]);
  }
  if (peakDay && peakDay.total_tokens > 0) {
    highlights.push([
      copy.peakDay,
      `${peakDay.date} · ${formatTokens(peakDay.total_tokens)}`,
    ]);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Typography type="h3">{copy.pageTitle}</Typography>
          <Select
            aria-label={copy.yearSuffix}
            className="w-36"
            selectedKey={String(year)}
            onSelectionChange={(key) => {
              if (key != null) setYear(Number(key));
            }}
          >
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {[CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map(
                  (candidate) => (
                    <ListBox.Item
                      key={candidate}
                      id={String(candidate)}
                      textValue={String(candidate)}
                    >
                      {`${candidate} ${copy.yearSuffix}`}
                    </ListBox.Item>
                  ),
                )}
              </ListBox>
            </Select.Popover>
          </Select>
        </div>
        <Button
          isPending={exporting}
          size="sm"
          variant="secondary"
          onPress={() => void exportCard()}
        >
          {({ isPending }) => (
            <>
              {isPending ? (
                <Spinner color="current" size="sm" />
              ) : (
                <ArrowDownToLine className="size-4" />
              )}
              {copy.share.button}
            </>
          )}
        </Button>
      </header>

      {status === "loading" ? (
        <Card className="items-center gap-2 p-10">
          <Spinner />
          <Typography color="muted" type="body-sm">
            {copy.loading}
          </Typography>
        </Card>
      ) : null}

      {status === "error" ? (
        <Card className="flex-col gap-3 p-6">
          <Typography className="text-danger" type="body-sm">
            {copy.loadError}
            {loadError ? ` (${loadError})` : ""}
          </Typography>
          <Button
            size="sm"
            variant="outline"
            onPress={() => {
              if (accessToken) void loadAll(accessToken);
            }}
          >
            {copy.retry}
          </Button>
        </Card>
      ) : null}

      {status === "ready" && !hasData ? (
        <Card className="p-10">
          <Card.Header>
            <Card.Title>{`${year} · ${copy.emptyTitle}`}</Card.Title>
            <Card.Description>{copy.emptyBody}</Card.Description>
          </Card.Header>
        </Card>
      ) : null}

      {status === "ready" && hasData && totals ? (
        <>
          {/* Share card preview — the export draws this design to canvas. */}
          <div
            ref={cardRef}
            className="bg-surface border-default-200 rounded-large flex flex-col gap-4 border p-8"
          >
            <div className="flex items-center justify-between">
              <div>
                <Typography type="h4">
                  {copy.share.cardTitle.replace("{year}", String(year))}
                </Typography>
                <Typography color="muted" type="body-xs">
                  {copy.share.cardCaption}
                </Typography>
              </div>
              <Typography className="text-primary" type="h3" weight="bold">
                {formatTokens(totals.total_tokens)}
              </Typography>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                [copy.cards.totalTokens, formatTokens(totals.total_tokens)],
                [copy.cards.cost, formatCost(totals.total_cost_usd)],
                [copy.cards.conversations, formatTokens(totals.conversations)],
              ].map(([label, value]) => (
                <div key={label} className="bg-content2 rounded-medium p-3">
                  <Typography color="muted" type="body-xs">
                    {label}
                  </Typography>
                  <Typography
                    className="tabular-nums"
                    type="body"
                    weight="semibold"
                  >
                    {value}
                  </Typography>
                </div>
              ))}
            </div>
            {highlights.length > 0 ? (
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                {highlights.map(([label, value]) => (
                  <Typography key={label} color="muted" type="body-sm">
                    {`${label}: `}
                    <span className="text-foreground">{value}</span>
                  </Typography>
                ))}
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              [copy.cards.totalTokens, formatTokens(totals.total_tokens)],
              [copy.cards.cost, formatCost(totals.total_cost_usd)],
              [copy.cards.conversations, formatTokens(totals.conversations)],
              [copy.cards.activeDays, String(totals.active_days)],
            ].map(([label, value]) => (
              <Card key={label} className="gap-1 p-4">
                <Typography color="muted" type="body-xs">
                  {label}
                </Typography>
                <Typography
                  className="tabular-nums"
                  type="h4"
                  weight="semibold"
                >
                  {value}
                </Typography>
              </Card>
            ))}
          </div>

          <Card className="p-6">
            <Card.Header>
              <Card.Title>{copy.monthlyTitle}</Card.Title>
            </Card.Header>
            <Card.Content>
              <DailyChart
                days={monthly.map((point) => ({
                  date: point.month.slice(0, 7),
                  total_tokens: point.total_tokens,
                  billable_total_tokens: point.billable_total_tokens,
                  total_cost_usd: point.total_cost_usd,
                  conversations: point.conversations,
                }))}
              />
            </Card.Content>
          </Card>

          <Card className="p-6">
            <Card.Header>
              <Card.Title>{copy.modelsTitle}</Card.Title>
            </Card.Header>
            <Card.Content className="flex flex-col gap-2">
              {models.map((entry) => (
                <div
                  key={entry.model}
                  className="flex items-baseline justify-between gap-2 text-sm"
                >
                  <span className="truncate font-medium">{entry.model}</span>
                  <span className="text-foreground/60 tabular-nums text-xs">
                    {formatTokens(entry.total_tokens)} ·{" "}
                    {formatCost(entry.total_cost_usd)}
                  </span>
                </div>
              ))}
            </Card.Content>
          </Card>
        </>
      ) : null}
    </main>
  );
}
