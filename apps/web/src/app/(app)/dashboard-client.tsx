"use client";

// Dashboard at / (docs/requirements.md 路由约定, 2026-10-24 二次修订).
// Data comes from the frozen Dashboard-face contract endpoints with the
// browser session JWT (dual principal, §1.4) — never a browser→Supabase
// table connection. Range/timezone math lives in lib/dashboard/ranges.ts.

import {
  Button,
  Card,
  ListBox,
  Select,
  Spinner,
  Typography,
} from "@heroui/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { DailyChart, HourlyChart } from "../dashboard/charts";
import {
  DevicePanel,
  Heatmap,
  ModelPanel,
  SourcePanel,
  TotalsCards,
} from "../dashboard/panels";

import { authBrowserClient } from "@/lib/auth/browser";
import { LOGIN_PATH } from "@/lib/auth/next-path";
import { DASHBOARD_COPY } from "@/lib/copy/dashboard";
import { useLocale } from "@/lib/copy/locale";
import {
  DashboardApiError,
  fetchDashboard,
  fetchHeatmap,
  fetchHourly,
  type DashboardPayload,
  type HeatmapPayload,
  type HourlyPoint,
} from "@/lib/dashboard/api";
import {
  browserTimezone,
  rangeForPreset,
  RANGE_PRESETS,
  TIMEZONE_OPTIONS,
  type RangePreset,
} from "@/lib/dashboard/ranges";

type LoadStatus = "loading" | "ready" | "error";

export function DashboardClient() {
  const router = useRouter();
  const [locale] = useLocale();
  const copy = DASHBOARD_COPY[locale];

  const [status, setStatus] = useState<LoadStatus>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapPayload | null>(null);
  const [hourly, setHourly] = useState<{
    day: string;
    points: HourlyPoint[];
  } | null>(null);
  const [preset, setPreset] = useState<RangePreset>("30d");
  const [tz, setTz] = useState<string>("");
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const timezone = tz || browserTimezone();
  const range = useMemo(
    () => rangeForPreset(preset, timezone),
    [preset, timezone],
  );

  const redirectToLogin = useCallback(() => {
    router.replace(`${LOGIN_PATH}?next=${encodeURIComponent("/")}`);
  }, [router]);

  const loadAll = useCallback(
    async (token: string) => {
      setStatus("loading");
      setLoadError(null);

      try {
        const [nextPayload, nextHeatmap] = await Promise.all([
          fetchDashboard(token, {
            fromIso: range.fromIso,
            toIso: range.toIso,
            tz: timezone,
            rangeKey: preset,
          }),
          fetchHeatmap(token, { weeks: 26, toDay: range.toDay, tz: timezone }),
        ]);

        setPayload(nextPayload);
        setHeatmap(nextHeatmap);
        setHourly(null);
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
    [
      range.fromIso,
      range.toIso,
      range.toDay,
      timezone,
      preset,
      redirectToLogin,
    ],
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

  const selectHourlyDay = useCallback(
    async (day: string) => {
      if (!accessToken) return;

      try {
        const result = await fetchHourly(accessToken, { day, tz: timezone });

        setHourly({ day: result.day, points: result.data });
      } catch {
        // Hourly is a drill-down nicety; the main view stays intact.
        setHourly(null);
      }
    },
    [accessToken, timezone],
  );

  const daily = payload?.daily ?? [];
  const hasData = (payload?.totals.total_tokens ?? 0) > 0;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Typography type="h3">{copy.pageTitle}</Typography>
        <div className="flex items-center gap-3">
          {payload?.user.email ? (
            <Typography color="muted" type="body-sm">
              {payload.user.email}
            </Typography>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            onPress={() => {
              void (async () => {
                await authBrowserClient()?.auth.signOut();
                router.replace(LOGIN_PATH);
                router.refresh();
              })();
            }}
          >
            {copy.signOut}
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <Typography color="muted" type="body-xs">
            {copy.rangeLabel}
          </Typography>
          <Select
            aria-label={copy.rangeLabel}
            className="w-40"
            selectedKey={preset}
            onSelectionChange={(key) => {
              if (key != null) setPreset(String(key) as RangePreset);
            }}
          >
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {[...RANGE_PRESETS, "custom" as const].map((key) => (
                  <ListBox.Item key={key} id={key} textValue={copy.ranges[key]}>
                    {copy.ranges[key]}
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        </label>
        <label className="flex flex-col gap-1">
          <Typography color="muted" type="body-xs">
            {copy.tzLabel}
          </Typography>
          <Select
            aria-label={copy.tzLabel}
            className="w-56"
            selectedKey={tz || "__browser"}
            onSelectionChange={(key) => {
              if (key == null) return;
              const value = String(key);

              setTz(value === "__browser" ? "" : value);
            }}
          >
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item
                  key="__browser"
                  id="__browser"
                  textValue={copy.tzBrowser}
                >
                  {`${copy.tzBrowser} (${browserTimezone()})`}
                </ListBox.Item>
                {TIMEZONE_OPTIONS.map((zone) => (
                  <ListBox.Item key={zone} id={zone} textValue={zone}>
                    {zone}
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        </label>
        {status === "error" ? (
          <Button
            size="sm"
            variant="outline"
            onPress={() => {
              if (accessToken) void loadAll(accessToken);
            }}
          >
            {copy.states.retry}
          </Button>
        ) : null}
      </div>

      {status === "loading" ? (
        <Card className="items-center gap-2 p-10">
          <Spinner />
          <Typography color="muted" type="body-sm">
            {copy.states.loading}
          </Typography>
        </Card>
      ) : null}

      {status === "error" ? (
        <Card className="p-6">
          <Card.Content>
            <Typography className="text-danger" type="body-sm">
              {copy.states.loadError}
              {loadError ? ` (${loadError})` : ""}
            </Typography>
          </Card.Content>
        </Card>
      ) : null}

      {status === "ready" && payload ? (
        hasData ? (
          <>
            <TotalsCards
              allTime={payload.all_time}
              copy={copy}
              totals={payload.totals}
            />

            <Card className="p-6">
              <Card.Header>
                <Card.Title>{copy.charts.dailyTitle}</Card.Title>
                <Card.Description>
                  {range.fromDay} → {range.toDay}
                  {hourly ? "" : ` · ${copy.charts.hourlyEmpty}`}
                </Card.Description>
              </Card.Header>
              <Card.Content className="flex flex-col gap-2">
                <DailyChart
                  days={daily}
                  onSelectDay={(day) => void selectHourlyDay(day)}
                />
              </Card.Content>
            </Card>

            {hourly ? (
              <Card className="p-6">
                <Card.Header>
                  <Card.Title>
                    {copy.charts.hourlyTitle} · {hourly.day}
                  </Card.Title>
                </Card.Header>
                <Card.Content>
                  <HourlyChart points={hourly.points} />
                </Card.Content>
              </Card>
            ) : null}

            {heatmap ? (
              <Heatmap
                months={copy.charts.heatmapMonths}
                payload={heatmap}
                title={copy.charts.heatmapTitle}
              />
            ) : null}

            <div className="grid gap-4 lg:grid-cols-2">
              <ModelPanel copy={copy} models={payload.models} />
              <SourcePanel copy={copy} sources={payload.sources} />
            </div>

            <DevicePanel
              copy={copy}
              devices={payload.devices}
              onManage={() => {
                router.push("/settings");
              }}
            />
          </>
        ) : (
          <Card className="p-10">
            <Card.Header>
              <Card.Title>{copy.states.emptyTitle}</Card.Title>
              <Card.Description>{copy.states.emptyBody}</Card.Description>
            </Card.Header>
          </Card>
        )
      ) : null}
    </main>
  );
}
