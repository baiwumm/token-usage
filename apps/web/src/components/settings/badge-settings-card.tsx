"use client";

// Settings · public badge tab, account-level card (docs/badge.md §7.2,
// docs/ui-spec.md 设置 · 公开徽章). The account owns the master switch, the
// public name, the time zone and the repository allowlist; every badge row
// inherits them. Presentational — the orchestrator owns the loaded settings,
// the drafts and the fetch flows.

import type { BadgeSettings } from "@/lib/badge/api";
import type { BadgeCopy } from "@/lib/copy/badge";
import type { Locale } from "@/lib/copy/locale-config";
import type { Key } from "react";

import { Check, Xmark } from "@gravity-ui/icons";
import {
  Card,
  Description,
  InputGroup,
  ListBox,
  Select,
  Switch,
  TextField,
  Typography,
} from "@heroui/react";

import { Row } from "./appearance-row";
import { BadgeHint } from "./badge-hint-icon";

import { PendingButton } from "@/components/pending-button";
import { MAX_DISPLAY_NAME, MAX_PROJECTS } from "@/lib/badge/limits";
import { formatMessage } from "@/lib/copy/message";

export type BadgeSettingsBusy = "toggle" | "name" | "projects" | null;

// Long-content row: label + description stacked above a full-width body.
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

function sameProjects(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((key, index) => key === b[index]);
}

export function BadgeSettingsCard({
  badgeCount,
  busy,
  copy,
  draftName,
  draftProjects,
  locale,
  settings,
  onDraftNameChange,
  onDraftProjectsChange,
  onSaveName,
  onSaveProjects,
  onToggleEnabled,
}: {
  badgeCount: number;
  busy: BadgeSettingsBusy;
  copy: BadgeCopy;
  draftName: string;
  draftProjects: string[];
  locale: Locale;
  settings: BadgeSettings;
  onDraftNameChange: (value: string) => void;
  onDraftProjectsChange: (value: string[]) => void;
  onSaveName: () => void;
  onSaveProjects: () => void;
  onToggleEnabled: (enabled: boolean) => void;
}) {
  // Allowlisted entries that no longer show up in Sessions stay listed so
  // they can still be removed.
  const projectOptions = [
    ...settings.knownProjects,
    ...draftProjects.filter((key) => !settings.knownProjects.includes(key)),
  ];
  const projectsDirty = !sameProjects(draftProjects, settings.allowedProjects);

  return (
    <Card className="p-6">
      <Card.Header>
        <Card.Title>{copy.settingsTitle}</Card.Title>
        <Card.Description>{copy.settingsDescription}</Card.Description>
      </Card.Header>
      <Card.Content className="divide-border/60 flex flex-col divide-y">
        <Row
          description={
            badgeCount > 0 ? copy.enabledDescription : copy.enabledNeedsBadge
          }
          label={copy.enabledLabel}
        >
          <Switch
            aria-label={copy.enabledLabel}
            isDisabled={badgeCount === 0 || busy !== null}
            isSelected={settings.enabled}
            onChange={onToggleEnabled}
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

        <Block
          description={copy.nameDescription}
          hint={
            <BadgeHint label={copy.nameHelpLabel}>
              <Typography type="body-xs">{copy.nameHelp}</Typography>
            </BadgeHint>
          }
          label={copy.nameLabel}
        >
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <TextField
              aria-label={copy.nameLabel}
              className="w-full md:max-w-md"
              name="public_name"
              value={draftName}
              onChange={onDraftNameChange}
            >
              {/* Suffix 实时字数（上限与 limits.ts / 迁移约束对齐） */}
              <InputGroup variant="secondary">
                <InputGroup.Input placeholder={copy.namePlaceholder} />
                <InputGroup.Suffix>
                  {draftName.length}/{MAX_DISPLAY_NAME}
                </InputGroup.Suffix>
              </InputGroup>
            </TextField>
            <PendingButton
              isDisabled={
                draftName.trim() === settings.displayName ||
                (busy !== null && busy !== "name")
              }
              pending={busy === "name"}
              size="sm"
              onPress={onSaveName}
            >
              {copy.nameSave}
            </PendingButton>
          </div>
        </Block>

        <Block
          description={copy.projectsDescription}
          hint={
            <BadgeHint label={copy.projectsHelpLabel}>
              <Typography type="body-xs">{copy.projectsCaveat}</Typography>
              <Typography type="body-xs">
                {formatMessage(copy.timezoneNote, locale, {
                  timezone: settings.timezone,
                })}
              </Typography>
            </BadgeHint>
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
                  onDraftProjectsChange(
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
                onPress={onSaveProjects}
              >
                {copy.projectsSave}
              </PendingButton>
            </div>
          )}
        </Block>
      </Card.Content>
    </Card>
  );
}
