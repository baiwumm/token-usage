"use client";

// Settings · public badge card (docs/badge.md §7.2–7.4, docs/ui-spec.md
// 设置 · 公开徽章). Self-loading like the other account cards: it reads and
// writes /api/app/badge with the browser session's cookies. The plaintext
// token only ever exists inside the one-time reveal dialog; everything else —
// preview, snippets — works without it (the preview authenticates by session,
// the snippets carry a placeholder).

import type { LoadStatus } from "@/lib/loadable";
import type { Key } from "react";

import { Check, CircleInfo, Xmark } from "@gravity-ui/icons";
import {
  Button,
  Card,
  Description,
  Input,
  ListBox,
  Select,
  Skeleton,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
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

import { PanelOverlay } from "@/components/panel-overlay";
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
// Mirrors the server cap (docs/badge.md §7.1): the input stops at 80 so the
// trimmed save can never come back shorter than what was typed.
const MAX_NAME_LENGTH = 80;

type Busy = "toggle" | "token" | "projects" | "name" | null;

// Long-content row: label + description stacked above a full-width body
// (allowlist caveat, preview image, README snippet). Same divider rhythm as
// the appearance Row. `hint` optionally renders beside the label.
function Block({
  label,
  description,
  hint,
  children,
}: {
  label: string;
  description: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <Typography type="body-sm" weight="medium">
            {label}
          </Typography>
          {hint}
        </div>
        <Description className="text-muted text-xs">{description}</Description>
      </div>
      {children}
    </div>
  );
}

// Secondary explanations (token rotation rules, naming details, allowlist
// coverage and time zone, preview preconditions) live behind this info icon so
// each row keeps only the one line the operator needs before acting.
function Hint({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip delay={0}>
      <Button
        aria-label={label}
        className="text-muted size-5 shrink-0 p-0"
        size="sm"
        variant="ghost"
      >
        <CircleInfo aria-hidden="true" className="size-3.5" />
      </Button>
      <Tooltip.Content showArrow placement="bottom">
        <Tooltip.Arrow />
        <div className="flex max-w-72 flex-col gap-1.5">{children}</div>
      </Tooltip.Content>
    </Tooltip>
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
  const [draftName, setDraftName] = useState("");
  const [draftProjects, setDraftProjects] = useState<string[]>([]);
  const [busy, setBusy] = useState<Busy>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [revealToken, setRevealToken] = useState<string | null>(null);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [loadedPreview, setLoadedPreview] = useState<string | null>(null);
  // `window` does not exist during the server render; the snippet snippets
  // need the real origin, so read it after mount instead of touching window
  // in render (which crashed SSR and would also mismatch hydration).
  const [origin, setOrigin] = useState("");
  const [view, setView] = useState<BadgeView>({
    style: "panel",
    theme: "dark",
    range: "all",
    project: null,
  });

  const previewSrc = badgePreviewUrl(view, previewVersion);
  // Derived from the loaded src, so a new query starts in the loading state
  // during the very render that switched it — no effect, no stale frame.
  const previewLoading = loadedPreview !== previewSrc;

  const redirectToLogin = useCallback(() => {
    router.replace(`${LOGIN_PATH}?next=${encodeURIComponent("/settings")}`);
  }, [router]);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const next = await fetchBadgeSettings();

      setSettings(next);
      setDraftName(next.displayName);
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

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

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
      // Generation also re-snapshots the public name from the profile (§7.1) —
      // re-sync from GET so the name input never shows a value the row no
      // longer holds. Best effort: the token flow itself already succeeded.
      const fresh = await fetchBadgeSettings().catch(() => null);

      if (fresh) {
        setSettings((current) =>
          current ? { ...fresh, knownProjects: current.knownProjects } : fresh,
        );
        setDraftName(fresh.displayName);
      }
      setPreviewVersion((value) => value + 1);
    } catch (error) {
      handleFailure(error);
    } finally {
      setBusy(null);
    }
  }

  async function saveName() {
    if (busy) return;
    setBusy("name");
    try {
      // §3.4: every save carries the browser's zone for active-day bucketing.
      const config = await updateBadgeConfig({
        displayName: draftName,
        timezone: browserTimezone(),
      });

      applyConfig(config);
      // The server trims; adopt its value so the dirty check settles.
      setDraftName(config.displayName);
      setPreviewVersion((value) => value + 1);
      toast.success(copy.nameSaved);
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
      // back to the account badge (no project = all, §2.1).
      setView((current) =>
        current.project && !config.allowedProjects.includes(current.project)
          ? { ...current, project: null }
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

        <Row
          description={copy.tokenDescription}
          hint={
            <Hint label={copy.tokenHelpLabel}>
              <Typography type="body-xs">{copy.tokenHelp}</Typography>
            </Hint>
          }
          label={copy.tokenLabel}
        >
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
          description={copy.nameDescription}
          hint={
            <Hint label={copy.nameHelpLabel}>
              <Typography type="body-xs">{copy.nameHelp}</Typography>
            </Hint>
          }
          label={copy.nameLabel}
        >
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <TextField
              aria-label={copy.nameLabel}
              className="w-full md:max-w-md"
              maxLength={MAX_NAME_LENGTH}
              name="public_name"
              value={draftName}
              onChange={setDraftName}
            >
              <Input placeholder={copy.namePlaceholder} variant="secondary" />
            </TextField>
            <PendingButton
              isDisabled={
                draftName.trim() === (settings.displayName ?? "") ||
                (busy !== null && busy !== "name")
              }
              pending={busy === "name"}
              size="sm"
              onPress={() => {
                void saveName();
              }}
            >
              {copy.nameSave}
            </PendingButton>
          </div>
        </Block>

        <Block
          description={copy.projectsDescription}
          hint={
            <Hint label={copy.projectsHelpLabel}>
              <Typography type="body-xs">{copy.projectsCaveat}</Typography>
              <Typography type="body-xs">
                {formatMessage(copy.timezoneNote, locale, {
                  timezone: settings.timezone,
                })}
              </Typography>
            </Hint>
          }
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
        </Block>

        <Block
          description={copy.previewDescription}
          hint={
            <Hint label={copy.previewHelpLabel}>
              <Typography type="body-xs">{copy.previewHelp}</Typography>
            </Hint>
          }
          label={copy.previewLabel}
        >
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
            {/* Repository replaces the old account/repo toggle (§2.1): an
                empty value is the account badge, a picked key is that repo,
                and Select.ClearButton returns to the account badge. */}
            <div className="flex flex-col gap-1">
              <Typography color="muted" type="body-xs">
                {copy.projectLabel}
              </Typography>
              <Select
                aria-label={copy.projectLabel}
                className="w-48"
                isDisabled={settings.allowedProjects.length === 0}
                placeholder={copy.projectAll}
                value={view.project}
                variant="secondary"
                onChange={(key) => {
                  setView((current) => ({
                    ...current,
                    project: key == null ? null : String(key),
                  }));
                }}
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.ClearButton />
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
            </div>
          </div>
          {settings.allowedProjects.length === 0 ? (
            <Description className="text-muted text-xs">
              {copy.projectEmpty}
            </Description>
          ) : null}
          {/* Wide panels scroll inside the card, never the page (ui-spec).
              The overlay holds the frame while a new query loads, so switching
              style/theme/range never shows the previous render in place. */}
          <div
            aria-busy={previewLoading}
            className="bg-surface-secondary relative rounded-xl"
          >
            <div className="flex min-h-44 items-center overflow-x-auto p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={copy.previewAlt}
                className="max-w-none"
                src={previewSrc}
                onError={() => setLoadedPreview(previewSrc)}
                onLoad={() => setLoadedPreview(previewSrc)}
              />
            </div>
            <PanelOverlay active={previewLoading} className="rounded-xl" />
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
