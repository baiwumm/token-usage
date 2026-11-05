"use client";

// Review-mode panel: switch each candidate effect on/off and replay it in
// isolation. This is an operator review tool for /projects only — it is not a
// settings surface and no preference is persisted.

import type { ProjectEffectId } from "@/lib/copy/projects";
import type {
  EffectPreviewAction,
  ProjectEffectState,
} from "./projects-effects";

import { Button, Card, Chip, Typography, cn } from "@heroui/react";

import { EFFECT_GROUPS, EFFECT_PREVIEW } from "./projects-effects";

export type SimulatedState =
  "ready" | "loading" | "empty" | "error" | "detailError";

export interface ProjectsReviewPanelProps {
  copy: {
    title: string;
    subtitle: string;
    demo: string;
    live: string;
    reset: string;
    preview: string;
    on: string;
    off: string;
    useDemo: string;
    useLive: string;
    allOn: string;
    allOff: string;
    groups: Record<"rows" | "dialog" | "states", string>;
    stateLabel: string;
    stateReady: string;
    stateLoading: string;
    stateEmpty: string;
    stateError: string;
    stateDetailError: string;
    openDetail: string;
  };
  effects: ProjectEffectState;
  effectCopy: Record<ProjectEffectId, { label: string; description: string }>;
  useDemo: boolean;
  simulatedState: SimulatedState | null;
  onToggle: (id: ProjectEffectId) => void;
  onSetAll: (value: boolean) => void;
  onReset: () => void;
  onToggleDemo: () => void;
  onSimulate: (state: SimulatedState) => void;
  onPreview: (action: EffectPreviewAction) => void;
  onOpenDetail: () => void;
}

const STATES: SimulatedState[] = [
  "ready",
  "loading",
  "empty",
  "error",
  "detailError",
];

export function ProjectsReviewPanel(props: ProjectsReviewPanelProps) {
  const {
    copy,
    effects,
    effectCopy,
    useDemo,
    simulatedState,
    onToggle,
    onSetAll,
    onReset,
    onToggleDemo,
    onSimulate,
    onPreview,
    onOpenDetail,
  } = props;
  const stateCopy: Record<SimulatedState, string> = {
    ready: copy.stateReady,
    loading: copy.stateLoading,
    empty: copy.stateEmpty,
    error: copy.stateError,
    detailError: copy.stateDetailError,
  };

  return (
    <Card className="p-4 md:p-6">
      <Card.Header className="flex-col items-start gap-1">
        <div className="flex w-full flex-wrap items-center gap-2">
          <Card.Title>{copy.title}</Card.Title>
          <Chip className="ms-auto" color="warning" size="sm" variant="soft">
            {useDemo ? copy.demo : copy.live}
          </Chip>
        </div>
        <Typography className="max-w-3xl" color="muted" type="body-xs">
          {copy.subtitle}
        </Typography>
      </Card.Header>
      <Card.Content className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={useDemo ? "primary" : "outline"}
            onPress={onToggleDemo}
          >
            {useDemo ? copy.useLive : copy.useDemo}
          </Button>
          <Button size="sm" variant="outline" onPress={onOpenDetail}>
            {copy.openDetail}
          </Button>
          <div className="ms-auto flex flex-wrap items-center gap-2">
            <Button size="sm" variant="tertiary" onPress={() => onSetAll(true)}>
              {copy.allOn}
            </Button>
            <Button
              size="sm"
              variant="tertiary"
              onPress={() => onSetAll(false)}
            >
              {copy.allOff}
            </Button>
            <Button size="sm" variant="tertiary" onPress={onReset}>
              {copy.reset}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Typography color="muted" type="body-xs">
            {copy.stateLabel}
          </Typography>
          {STATES.map((state) => (
            <Button
              key={state}
              size="sm"
              variant={simulatedState === state ? "primary" : "outline"}
              onPress={() => onSimulate(state)}
            >
              {stateCopy[state]}
            </Button>
          ))}
        </div>

        {EFFECT_GROUPS.map((group) => (
          <div key={group.id} className="flex flex-col gap-2">
            <Typography color="muted" type="body-xs" weight="semibold">
              {copy.groups[group.id]}
            </Typography>
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {group.effects.map((id) => (
                <div
                  key={id}
                  className="border-border bg-surface flex flex-wrap items-center gap-2 rounded-2xl border px-3 py-2"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <Typography type="body-xs" weight="semibold">
                      {effectCopy[id].label}
                    </Typography>
                    <Typography
                      className="max-w-72"
                      color="muted"
                      type="body-xs"
                    >
                      {effectCopy[id].description}
                    </Typography>
                  </div>
                  <Button
                    aria-label={`${effectCopy[id].label}: ${effects[id] ? copy.on : copy.off}`}
                    className={cn("shrink-0", !effects[id] && "opacity-70")}
                    size="sm"
                    variant={effects[id] ? "primary" : "outline"}
                    onPress={() => onToggle(id)}
                  >
                    {effects[id] ? copy.on : copy.off}
                  </Button>
                  <Button
                    size="sm"
                    variant="tertiary"
                    onPress={() => onPreview(EFFECT_PREVIEW[id])}
                  >
                    {copy.preview}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Card.Content>
    </Card>
  );
}
