"use client";

// Dashboard auto-refresh preferences (2026-10-27 operator call): both default
// to off because the dashboard already has a manual refresh button. Stored per
// browser; the dashboard reads the same store.

import { Check, Xmark } from "@gravity-ui/icons";
import { Card, Slider, Switch, Typography } from "@heroui/react";
import { useEffect, useState } from "react";

import { Row } from "./appearance-row";

import { APPEARANCE_COPY } from "@/lib/copy/appearance";
import { useLocale } from "@/lib/copy/locale";
import { formatMessage } from "@/lib/copy/message";
import {
  REFRESH_INTERVAL_MAX,
  REFRESH_INTERVAL_STEP,
  useRefreshPreferencesStore,
} from "@/stores/refresh-preferences-store";

export function DataRefreshCard() {
  const [locale] = useLocale();
  const copy = APPEARANCE_COPY[locale];
  const refreshOnVisible = useRefreshPreferencesStore(
    (state) => state.refreshOnVisible,
  );
  const intervalMinutes = useRefreshPreferencesStore(
    (state) => state.intervalMinutes,
  );
  const setRefreshOnVisible = useRefreshPreferencesStore(
    (state) => state.setRefreshOnVisible,
  );
  const setIntervalMinutes = useRefreshPreferencesStore(
    (state) => state.setIntervalMinutes,
  );
  // Persist on release: dragging the thumb must not restart the dashboard
  // timer (or write localStorage) on every step.
  const [draftMinutes, setDraftMinutes] = useState(intervalMinutes);

  // The first client render replays the SSR snapshot (0); the saved value
  // arrives with hydration. Pull it back into the draft when it changes.
  useEffect(() => {
    setDraftMinutes(intervalMinutes);
  }, [intervalMinutes]);

  const intervalValue =
    draftMinutes === 0
      ? copy.refreshIntervalOff
      : draftMinutes >= REFRESH_INTERVAL_MAX
        ? copy.refreshIntervalHour
        : formatMessage(copy.refreshIntervalValue, locale, {
            count: draftMinutes,
          });

  return (
    <Card className="p-6">
      <Card.Header>
        <Card.Title>{copy.refreshHeading}</Card.Title>
        <Card.Description>{copy.refreshDescription}</Card.Description>
      </Card.Header>
      <Card.Content className="divide-border/60 flex flex-col divide-y">
        <Row
          description={copy.refreshOnVisibleDescription}
          label={copy.refreshOnVisibleLabel}
        >
          <Switch
            aria-label={copy.refreshOnVisibleLabel}
            isSelected={refreshOnVisible}
            onChange={setRefreshOnVisible}
          >
            {({ isSelected }) => (
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb>
                    <Switch.Icon>
                      {isSelected ? (
                        <Check className="size-3 text-inherit opacity-100" />
                      ) : (
                        <Xmark className="size-3 text-inherit opacity-70" />
                      )}
                    </Switch.Icon>
                  </Switch.Thumb>
                </Switch.Control>
              </Switch.Content>
            )}
          </Switch>
        </Row>

        <Row
          description={copy.refreshIntervalDescription}
          label={copy.refreshIntervalLabel}
        >
          <div className="flex w-full flex-col gap-1.5 md:w-64">
            <Slider
              aria-label={copy.refreshIntervalLabel}
              maxValue={REFRESH_INTERVAL_MAX}
              minValue={0}
              step={REFRESH_INTERVAL_STEP}
              value={draftMinutes}
              onChange={(value) => {
                if (typeof value === "number") setDraftMinutes(value);
              }}
              onChangeEnd={(value) => {
                if (typeof value === "number") setIntervalMinutes(value);
              }}
            >
              <Slider.Output className="tabular-nums">
                {intervalValue}
              </Slider.Output>
              <Slider.Track>
                <Slider.Fill />
                <Slider.Thumb />
              </Slider.Track>
            </Slider>
            <div className="flex w-full justify-between">
              <Typography color="muted" type="body-xs">
                {copy.refreshIntervalOff}
              </Typography>
              <Typography color="muted" type="body-xs">
                {copy.refreshIntervalMax}
              </Typography>
            </div>
          </div>
        </Row>
      </Card.Content>
    </Card>
  );
}
