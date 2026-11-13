"use client";

// Settings · public badge tab, selected-badge card (docs/badge.md §7.2–7.4,
// docs/ui-spec.md 设置 · 公开徽章). Presentational: the orchestrator owns the
// rows and the mutations. Display knobs save immediately (PATCH) — the public
// link carries no parameters, so an embedded badge follows them on its next
// fetch without the README changing.

import type { BadgeLink, BadgeLinkInput } from "@/lib/badge/api";
import type { BadgeCopy } from "@/lib/copy/badge";

import {
  Card,
  Chip,
  Description,
  Input,
  ListBox,
  Select,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@heroui/react";
import { useEffect, useState } from "react";

import { firstKey } from "./appearance-helpers";
import { BadgeHint } from "./badge-hint-icon";
import { badgeName } from "./badge-helpers";
import { BadgeSnippetSection } from "./badge-snippet-section";

import { PanelOverlay } from "@/components/panel-overlay";
import { PendingButton } from "@/components/pending-button";
import { badgePreviewUrl } from "@/lib/badge/api";
import { MAX_BADGE_LABEL } from "@/lib/badge/limits";

function Block({
  label,
  description,
  hint,
  children,
}: {
  label: string;
  description?: string;
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
        {description ? (
          <Description className="text-muted text-xs">
            {description}
          </Description>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function OptionGroup<T extends string>({
  disabled,
  label,
  value,
  options,
  onChange,
}: {
  disabled: boolean;
  label: string;
  value: T;
  options: Array<{ id: T; label: string }>;
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
        isDisabled={disabled}
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
          <ToggleButton key={option.id} id={option.id}>
            {index > 0 ? <ToggleButtonGroup.Separator /> : null}
            {option.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </div>
  );
}

export function BadgeDetailCard({
  allowedProjects,
  badge,
  busy,
  copy,
  labelBusy,
  origin,
  previewVersion,
  onSaveLabel,
  onUpdate,
}: {
  allowedProjects: string[];
  badge: BadgeLink | null;
  busy: boolean;
  copy: BadgeCopy;
  labelBusy: boolean;
  origin: string;
  previewVersion: number;
  onSaveLabel: (label: string) => void;
  onUpdate: (patch: BadgeLinkInput) => void;
}) {
  const [draftLabel, setDraftLabel] = useState(badge?.label ?? "");

  // Adopt the saved label after a PATCH (the server trims) and when the
  // selection changes.
  useEffect(() => {
    setDraftLabel(badge?.label ?? "");
  }, [badge?.id, badge?.label]);

  const [loadedPreview, setLoadedPreview] = useState<string | null>(null);

  if (!badge) {
    return (
      <Card className="p-6">
        <Card.Header>
          <Card.Title>{copy.detailTitle}</Card.Title>
        </Card.Header>
        <Card.Content>
          <Typography className="py-2 text-center" color="muted" type="body-sm">
            {copy.detailEmpty}
          </Typography>
        </Card.Content>
      </Card>
    );
  }

  const revoked = badge.revokedAt !== null;
  const previewSrc = badgePreviewUrl(
    {
      style: badge.style,
      theme: badge.theme,
      range: badge.range,
      project: badge.project,
    },
    previewVersion,
  );
  // Derived from the loaded src, so a new query starts in the loading state
  // during the very render that switched it — no effect, no stale frame.
  const previewLoading = loadedPreview !== previewSrc;
  const labelDirty = draftLabel.trim() !== badge.label;

  return (
    <Card className="p-6">
      <Card.Header>
        <div className="flex flex-wrap items-center gap-2">
          <Card.Title>{badgeName(copy, badge)}</Card.Title>
          {revoked ? (
            <Chip color="warning" size="sm" variant="soft">
              {copy.revokedChip}
            </Chip>
          ) : (
            <Chip color="success" size="sm" variant="soft">
              {copy.activeChip}
            </Chip>
          )}
        </div>
      </Card.Header>
      <Card.Content className="divide-border/60 flex flex-col divide-y">
        <Block label={copy.labelLabel}>
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <TextField
              aria-label={copy.labelLabel}
              className="w-full md:max-w-md"
              maxLength={MAX_BADGE_LABEL}
              name="badge_label"
              value={draftLabel}
              onChange={setDraftLabel}
            >
              <Input placeholder={copy.labelPlaceholder} variant="secondary" />
            </TextField>
            <PendingButton
              isDisabled={!labelDirty || busy}
              pending={labelBusy}
              size="sm"
              onPress={() => onSaveLabel(draftLabel)}
            >
              {copy.labelSave}
            </PendingButton>
          </div>
        </Block>

        <Block label={copy.paramsLabel}>
          <div className="flex flex-wrap items-end gap-4">
            <OptionGroup
              disabled={busy}
              label={copy.styleLabel}
              options={[
                { id: "sparkline", label: copy.styleSparkline },
                { id: "panel", label: copy.stylePanel },
                { id: "compact", label: copy.styleCompact },
              ]}
              value={badge.style}
              onChange={(style) => onUpdate({ style })}
            />
            <OptionGroup
              disabled={busy}
              label={copy.themeLabel}
              options={[
                { id: "dark", label: copy.themeDark },
                { id: "light", label: copy.themeLight },
                { id: "auto", label: copy.themeAuto },
              ]}
              value={badge.theme}
              onChange={(theme) => onUpdate({ theme })}
            />
            <OptionGroup
              disabled={busy}
              label={copy.rangeLabel}
              options={[
                { id: "all", label: copy.rangeAll },
                { id: "30d", label: copy.range30d },
              ]}
              value={badge.range}
              onChange={(range) => onUpdate({ range })}
            />
            {/* An empty value is the account badge; a picked key is that
                repo, and Select.ClearButton returns to the account badge. */}
            <div className="flex flex-col gap-1">
              <Typography color="muted" type="body-xs">
                {copy.projectLabel}
              </Typography>
              <Select
                aria-label={copy.projectLabel}
                className="w-48"
                isDisabled={busy || allowedProjects.length === 0}
                placeholder={copy.projectAll}
                value={badge.project}
                variant="secondary"
                onChange={(key) => {
                  onUpdate({ project: key == null ? null : String(key) });
                }}
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.ClearButton />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {allowedProjects.map((key) => (
                      <ListBox.Item key={key} id={key} textValue={key}>
                        {key}
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
            </div>
          </div>
          {allowedProjects.length === 0 ? (
            <Description className="text-muted text-xs">
              {copy.projectEmpty}
            </Description>
          ) : null}
        </Block>

        <Block
          description={copy.previewHelp}
          hint={
            <BadgeHint label={copy.previewHelpLabel}>
              <Typography type="body-xs">{copy.previewHelp}</Typography>
            </BadgeHint>
          }
          label={copy.previewAlt}
        >
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
            token={badge.token}
          />
        </Block>
      </Card.Content>
    </Card>
  );
}
