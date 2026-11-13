"use client";

// Settings · account tab, public page card (docs/badge.md §3.2): the per-user
// account-level page's own switch and the page-token rotation. Self-contained
// — fetches /api/app/badge with the browser session and writes through the
// same PUT; the badges tab keeps governing only the badges.

import type { LoadStatus } from "@/lib/loadable";

import { Check, Xmark } from "@gravity-ui/icons";
import { Card, Skeleton, Switch, toast } from "@heroui/react";
import { useCallback, useEffect, useState } from "react";

import { Row } from "./appearance-row";
import { ResetPageTokenDialog } from "./badge-dialogs";

import { SectionError } from "@/components/section-states";
import { PendingButton } from "@/components/pending-button";
import {
  fetchBadgeSettings,
  isUnauthorized,
  updateBadgeConfig,
  type BadgeConfig,
} from "@/lib/badge/api";
import { BADGE_COPY } from "@/lib/copy/badge";
import { useLocale } from "@/lib/copy/locale";
import { browserTimezone } from "@/lib/dashboard/ranges";

export function PublicPageCard() {
  const [locale] = useLocale();
  const copy = BADGE_COPY[locale];

  const [status, setStatus] = useState<LoadStatus>("loading");
  const [config, setConfig] = useState<BadgeConfig | null>(null);
  const [busy, setBusy] = useState<"toggle" | "reset" | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setConfig(await fetchBadgeSettings());
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function togglePageEnabled(enabled: boolean) {
    if (busy || !config) return;
    setBusy("toggle");
    try {
      // §3.4: every save carries the browser's zone for active-day bucketing.
      setConfig({
        ...config,
        ...(await updateBadgeConfig({
          pageEnabled: enabled,
          timezone: browserTimezone(),
        })),
      });
      toast.success(enabled ? copy.pageOn : copy.pageOff);
    } catch (error) {
      if (isUnauthorized(error)) toast(copy.loadError);
      else toast(copy.saveError);
    } finally {
      setBusy(null);
    }
  }

  // §3.2 leak containment: rotating the page token kills every /u/<page_token>
  // link at once; badge SVG embeds keep working.
  async function confirmResetPageToken() {
    if (busy || !config) return;
    setBusy("reset");
    try {
      setConfig({
        ...config,
        ...(await updateBadgeConfig({ resetPageToken: true })),
      });
      setResetOpen(false);
      toast.success(copy.pageResetDone);
    } catch (error) {
      if (isUnauthorized(error)) toast(copy.loadError);
      else toast(copy.saveError);
    } finally {
      setBusy(null);
    }
  }

  if (status !== "ready" || !config) {
    return (
      <Card className="p-6">
        {status === "error" ? (
          <SectionError
            message={copy.loadError}
            retry={() => void load()}
            retryLabel={copy.retry}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-5 w-24 rounded-md" />
            <Skeleton className="h-9 w-full rounded-lg" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
        )}
      </Card>
    );
  }

  return (
    <>
      <Card className="p-6">
        <Card.Header>
          <Card.Title>{copy.pageLabel}</Card.Title>
          <Card.Description>{copy.pageCardDescription}</Card.Description>
        </Card.Header>
        <Card.Content className="divide-border/60 flex flex-col divide-y">
          <Row description={copy.pageDescription} label={copy.pageToggleLabel}>
            <Switch
              aria-label={copy.pageToggleLabel}
              isDisabled={busy !== null}
              isSelected={config.pageEnabled}
              onChange={togglePageEnabled}
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

          <Row description={copy.pageResetBody} label={copy.pageResetLabel}>
            <PendingButton
              isDisabled={busy !== null || config.pageToken === null}
              pending={false}
              size="sm"
              variant="tertiary"
              onPress={() => {
                setResetOpen(true);
              }}
            >
              {copy.pageResetConfirm}
            </PendingButton>
          </Row>
        </Card.Content>
      </Card>

      {resetOpen ? (
        <ResetPageTokenDialog
          busy={busy === "reset"}
          copy={copy}
          onClose={() => {
            setResetOpen(false);
          }}
          onSubmit={() => {
            void confirmResetPageToken();
          }}
        />
      ) : null}
    </>
  );
}
