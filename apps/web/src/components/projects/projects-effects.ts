// Review-mode catalogue for the /projects effect candidates. The switches are
// page-local only: no other page reads them, and they are not persisted.

import type { ProjectEffectId } from "@/lib/copy/projects";

export type ProjectEffectGroup = "rows" | "dialog" | "states";

/** What a single "preview" button replays for each candidate. */
export type EffectPreviewAction =
  "list" | "dialog" | "detail" | "chart" | "drill" | "loading" | "state";

export const EFFECT_GROUPS: ReadonlyArray<{
  id: ProjectEffectGroup;
  effects: ReadonlyArray<ProjectEffectId>;
}> = [
  {
    id: "rows",
    effects: ["hoverLift", "meterFlow", "selectedRail", "staggerRows"],
  },
  {
    id: "dialog",
    effects: [
      "dialogEntrance",
      "detailCrossfade",
      "flowNumbers",
      "chartBars",
      "dayDrilldown",
    ],
  },
  { id: "states", effects: ["skeletonShimmer", "stateMotion"] },
];

export const EFFECT_IDS: ProjectEffectId[] = EFFECT_GROUPS.flatMap((group) => [
  ...group.effects,
]);

export const EFFECT_PREVIEW: Record<ProjectEffectId, EffectPreviewAction> = {
  hoverLift: "list",
  meterFlow: "list",
  selectedRail: "list",
  staggerRows: "list",
  dialogEntrance: "dialog",
  detailCrossfade: "detail",
  flowNumbers: "detail",
  chartBars: "chart",
  dayDrilldown: "drill",
  skeletonShimmer: "loading",
  stateMotion: "state",
};

export type ProjectEffectState = Record<ProjectEffectId, boolean>;

/** Every candidate ships enabled so the reviewer can see all of them first. */
export function defaultEffects(): ProjectEffectState {
  return Object.fromEntries(
    EFFECT_IDS.map((id) => [id, true]),
  ) as ProjectEffectState;
}

export function allEffects(value: boolean): ProjectEffectState {
  return Object.fromEntries(
    EFFECT_IDS.map((id) => [id, value]),
  ) as ProjectEffectState;
}
