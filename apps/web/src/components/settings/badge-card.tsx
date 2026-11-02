"use client";

// Settings · public badge card (docs/badge.md §7.2–7.4, docs/ui-spec.md
// 设置 · 公开徽章). Self-loading like the other account cards: it reads and
// writes /api/app/badge with the browser session's cookies. The plaintext
// token only ever exists inside the one-time reveal dialog; everything else —
// preview, snippets — works without it (the preview authenticates by session,
// the snippets carry a placeholder).

import type { LoadStatus } from "@/lib/loadable";
import type { Key } from "react";

import { Check, Xmark } from "@gravity-ui/icons";
import {
  Button,
  Card,
  Description,
  ListBox,
  Select,
  Skeleton,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  toast,
} from "@heroui/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { firstKey } from "./appearance-helpers";
import { Row } from "./appearance-row";
import { ResetBadgeDialog, RevealTokenDialog } from "./badge-dialogs";
import { TOKEN_PLACEHOLDER } from "./badge-helpers";
import { BadgeSnippetSection } from "./badge-snippet-section";

import { PendingButton } from "@/components/pending-button";
import { SectionError } from "@/components/section-states";
import { LOGIN_PATH } from "@/lib/auth/next-path";
import {
  badgePreviewUrl,
  fetchBadgeSettings,
  generateBadgeToken,
  isUnauthorized,
  updateBadgeConfig,
  type BadgeConfig,
  type BadgeSettings,
  type BadgeView,
} from "@/lib/badge/api";
import { BADGE_COPY, type BadgeCopy } from "@/lib/copy/badge";
import { useLocale } from "@/lib/copy/locale";
import { formatMessage } from "@/lib/copy/message";
import { browserTimezone } from "@/lib/dashboard/ranges";

const MAX_PROJECTS = 32;

type Busy = "toggle" | "token" | "projects" | null;

// Long-content row: label + description stacked above a full-width body
// (allowlist caveat, preview image, README snippet). Same divider rhythm as
// the appearance Row.
function Block({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-col gap-1">
        <Typography type="body-sm" weight="medium">
          {label}
        </Typography>
        <Description className="text-muted text-xs">{description}</Description>
      </div>
      {children}
    </div>
  );
}

function OptionGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ id: T; label: string; isDisabled?: boolean }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Typography color="muted" type="body-xs">
        {label}
      </Typography>
      <ToggleButtonGroup
        disallowEmptySelection
        aria-label={label}
        selectedKeys={[value]}
        selectionMode="single"
        size="sm"
        onSelectionChange={(keys) => {
          const key = firstKey(keys);
          const option = options.find((entry) => entry.id === key);

          if (option) onChange(option.id);
        }}
      >
        {options.map((option, index) => (
          <ToggleButton
            key={option.id}
            id={option.id}
            isDisabled={option.isDisabled}
          >
            {index > 0 ? <ToggleButtonGroup.Separator /> : null}
            {option.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </div>
  );
}

function sameProjects(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((key, index) => key === b[index]);
}

export function BadgeCard() {
  const [locale] = useLocale();
  const copy: BadgeCopy = BADGE_COPY[locale];
  const router = useRouter();

  const [status, setStatus] = useState<LoadStatus>("loading");
  const [settings, setSettings] = useState<BadgeSettings | null>(null);
  const [draftProjects, setDraftProjects] = useState<string[]>([]);
  const [busy, setBusy] = useState<Busy>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [revealToken, setRevealToken] = useState<string | null>(null);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [view, setView] = useState<BadgeView>({
    style: "panel",
    theme: "dark",
    range: "all",
    scope: "user",
    project: null,
  });

  const redirectToLogin = useCallback(() => {
    router.replace(`${LOGIN_PATH}?next=${encodeURIComponent("/settings")}`);
  }, [router]);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const next = await fetchBadgeSettings();

      setSettings(next);
      setDraftProjects(next.allowedProjects);
      setStatus("ready");
    } catch (error) {
      if (isUnauthorized(error)) {
        redirectToLogin();

        return;
      }
      setStatus("error");
    }
  }, [redirectToLogin]);

  useEffect(() => {
    void load();
  }, [load]);

  // Saved config replaces the loaded one; the known-projects list only comes
  // with GET and stays as loaded.
  const applyConfig = useCallback((config: BadgeConfig) => {
    setSettings((current) =>
      current ? { ...config, knownProjects: current.knownProjects } : current,
    );
  }, []);

  const handleFailure = useCallback(
    (error: unknown) => {
      if (isUnauthorized(error)) redirectToLogin();
      else toast(copy.saveError);
    },
    [copy.saveError, redirectToLogin],
  );

  async function toggleEnabled(enabled: boolean) {
    if (busy) return;
    setBusy("toggle");
    try {
      // §3.4: every save carries the browser's zone for active-day bucketing.
      applyConfig(
        await updateBadgeConfig({ enabled, timezone: browserTimezone() }),
      );
      toast.success(enabled ? copy.enabledOn : copy.enabledOff);
    } catch (error) {
      handleFailure(error);
    } finally {
      setBusy(null);
    }
  }

  async function issueToken() {
    if (busy) return;
    setBusy("token");
    try {
      const token = await generateBadgeToken();

      setResetOpen(false);
      setRevealToken(token);
      // Generation enables the badge and records the new suffix (§7.1).
      setSettings((current) =>
        current
          ? {
              ...current,
              enabled: true,
              hasToken: true,
              tokenLast4: token.slice(-4),
            }
          : current,
      );
      setPreviewVersion((value) => value + 1);
    } catch (error) {
      handleFailure(error);
    } finally {
      setBusy(null);
    }
  }

  async function saveProjects() {
    if (busy) return;
    setBusy("projects");
    try {
      const config = await updateBadgeConfig({
        allowedProjects: draftProjects,
        timezone: browserTimezone(),
      });

      applyConfig(config);
      setDraftProjects(config.allowedProjects);
      // A preview pointing at a project that just left the allowlist falls
      // back to the account badge.
      setView((current) =>
        current.scope === "repo" &&
        (!current.project || !config.allowedProjects.includes(current.project))
          ? { ...current, scope: "user", project: null }
          : current,
      );
      setPreviewVersion((value) => value + 1);
      toast.success(copy.projectsSaved);
    } catch (error) {
      handleFailure(error);
    } finally {
      setBusy(null);
    }
  }

  function renderBody() {
    if (status === "loading" || !settings) {
      if (status === "error") {
        return (
          <SectionError
            message={copy.loadError}
            retry={() => void load()}
            retryLabel={copy.retry}
          />
        );
      }

      return (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-44 w-full rounded-lg" />
        </div>
      );
    }

    // Allowlisted entries that no longer show up in Sessions stay listed so
    // they can still be removed.
    const projectOptions = [
      ...settings.knownProjects,
      ...draftProjects.filter((key) => !settings.knownProjects.includes(key)),
    ];
    const projectsDirty = !sameProjects(
      draftProjects,
      settings.allowedProjects,
    );
    const origin = window.location.origin;

    return (
      <>
        <Row
          description={
            settings.hasToken ? copy.enabledDescription : copy.enabledNeedsToken
          }
          label={copy.enabledLabel}
        >
          <Switch
            aria-label={copy.enabledLabel}
            isDisabled={!settings.hasToken || busy !== null}
            isSelected={settings.enabled}
            onChange={(enabled) => {
              void toggleEnabled(enabled);
            }}
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

        <Row description={copy.tokenDescription} label={copy.tokenLabel}>
          <Typography className="tabular-nums" type="body-sm">
            {settings.hasToken && settings.tokenLast4
              ? formatMessage(copy.tokenActive, locale, {
                  last4: settings.tokenLast4,
                })
              : copy.tokenNone}
          </Typography>
          {settings.hasToken ? (
            <Button
              isDisabled={busy !== null}
              size="sm"
              variant="secondary"
              onPress={() => setResetOpen(true)}
            >
              {copy.reset}
            </Button>
          ) : (
            <PendingButton
              isDisabled={busy !== null && busy !== "token"}
              pending={busy === "token"}
              size="sm"
              onPress={() => {
                void issueToken();
              }}
            >
              {copy.generate}
            </PendingButton>
          )}
        </Row>

        <Block
          description={copy.projectsDescription}
          label={copy.projectsLabel}
        >
          {projectOptions.length === 0 ? (
            <Typography color="muted" type="body-sm">
              {copy.projectsEmpty}
            </Typography>
          ) : (
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <Select
                aria-label={copy.projectsLabel}
                className="w-full md:max-w-md"
                placeholder={copy.projectsPlaceholder}
                selectionMode="multiple"
                value={draftProjects}
                variant="secondary"
                onChange={(keys) => {
                  const next = (keys as Key[]).map(String);

                  // Keep the option order so the dirty check is stable.
                  setDraftProjects(
                    projectOptions.filter((key) => next.includes(key)),
                  );
                }}
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox selectionMode="multiple">
                    {projectOptions.map((key) => (
                      <ListBox.Item key={key} id={key} textValue={key}>
                        {key}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
              <PendingButton
                isDisabled={
                  !projectsDirty ||
                  draftProjects.length > MAX_PROJECTS ||
                  (busy !== null && busy !== "projects")
                }
                pending={busy === "projects"}
                size="sm"
                onPress={() => {
                  void saveProjects();
                }}
              >
                {copy.projectsSave}
              </PendingButton>
            </div>
          )}
          <Description className="text-muted text-xs">
            {copy.projectsCaveat}
          </Description>
          <Description className="text-muted text-xs">
            {formatMessage(copy.timezoneNote, locale, {
              timezone: settings.timezone,
            })}
          </Description>
        </Block>

        <Block description={copy.previewDescription} label={copy.previewLabel}>
          <div className="flex flex-wrap items-end gap-4">
            <OptionGroup
              label={copy.styleLabel}
              options={[
                { id: "panel", label: copy.stylePanel },
                { id: "compact", label: copy.styleCompact },
                { id: "sparkline", label: copy.styleSparkline },
              ]}
              value={view.style}
              onChange={(style) =>
                setView((current) => ({ ...current, style }))
              }
            />
            <OptionGroup
              label={copy.themeLabel}
              options={[
                { id: "dark", label: copy.themeDark },
                { id: "light", label: copy.themeLight },
                { id: "auto", label: copy.themeAuto },
              ]}
              value={view.theme}
              onChange={(theme) =>
                setView((current) => ({ ...current, theme }))
              }
            />
            <OptionGroup
              label={copy.rangeLabel}
              options={[
                { id: "all", label: copy.rangeAll },
                { id: "30d", label: copy.range30d },
              ]}
              value={view.range}
              onChange={(range) =>
                setView((current) => ({ ...current, range }))
              }
            />
            <OptionGroup
              label={copy.scopeLabel}
              options={[
                { id: "user", label: copy.scopeUser },
                {
                  id: "repo",
                  label: copy.scopeRepo,
                  isDisabled: settings.allowedProjects.length === 0,
                },
              ]}
              value={view.scope}
              onChange={(scope) =>
                setView((current) => ({
                  ...current,
                  scope,
                  project:
                    scope === "repo"
                      ? (current.project ?? settings.allowedProjects[0] ?? null)
                      : null,
                }))
              }
            />
            {view.scope === "repo" ? (
              <Select
                aria-label={copy.scopeRepo}
                className="w-48"
                value={view.project}
                variant="secondary"
                onChange={(key) => {
                  if (key != null) {
                    setView((current) => ({
                      ...current,
                      project: String(key),
                    }));
                  }
                }}
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {settings.allowedProjects.map((key) => (
                      <ListBox.Item key={key} id={key} textValue={key}>
                        {key}
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
            ) : null}
          </div>
          {settings.allowedProjects.length === 0 ? (
            <Description className="text-muted text-xs">
              {copy.scopeRepoEmpty}
            </Description>
          ) : null}
          {/* Wide panels scroll inside the card, never the page (ui-spec). */}
          <div className="bg-surface-secondary flex min-h-44 items-center overflow-x-auto rounded-xl p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={copy.previewAlt}
              className="max-w-none"
              src={badgePreviewUrl(view, previewVersion)}
            />
          </div>
        </Block>

        <Block description={copy.snippetDescription} label={copy.snippetLabel}>
          <BadgeSnippetSection
            copy={copy}
            origin={origin}
            token={TOKEN_PLACEHOLDER}
            view={view}
          />
        </Block>
      </>
    );
  }

  return (
    <Card className="p-6">
      <Card.Header>
        <Card.Title>{copy.heading}</Card.Title>
        <Card.Description>{copy.description}</Card.Description>
      </Card.Header>
      <Card.Content className="divide-border/60 flex flex-col divide-y">
        {renderBody()}
      </Card.Content>

      <ResetBadgeDialog
        busy={busy === "token"}
        copy={copy}
        isOpen={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={() => {
          void issueToken();
        }}
      />
      <RevealTokenDialog
        copy={copy}
        origin={typeof window === "undefined" ? "" : window.location.origin}
        token={revealToken}
        view={view}
        onClose={() => setRevealToken(null)}
      />
    </Card>
  );
}
