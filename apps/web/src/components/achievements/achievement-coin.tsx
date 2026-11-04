"use client";

// The achievement coin in the detail dialog: the medallion (front) that flips
// to a metal disc carrying the tier name and the day it landed (back).
//
// Interaction follows the upstream TokenTracker badge coin (Badge3DCoin):
// opening spins the coin a full turn into place, then an idle sway keeps the
// grab affordance alive; horizontal pointer drag rotates it 1:1 and release
// flicks a spring that settles on the nearest face (multiples of 180°). A
// plain click / Enter / Space still flips it, so the whole coin stays one
// native button (`aria-pressed` reports the face shown; arrows nudge ±30°).
// `touch-action: pan-y` keeps vertical swipes scrolling on touch. Physics is
// motion/react (2026-10-24 裁决：按需安装); reduced-motion users get no
// entrance/sway and a short tween on release — the drag itself stays because
// it is user-driven.
//
// It resets to the front whenever the dialog closes or another achievement
// opens (replaying the entrance, like the upstream remount).

import type { AchievementProgress } from "@/lib/achievements/types";
import type { Locale } from "@/lib/copy/locale-config";

import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import { Tooltip, Typography } from "@heroui/react";
import { useEffect, useRef, useState } from "react";

import { AchievementMedallion } from "./achievement-medallion";
import { tierMetal, tierRamp } from "./achievement-tiers";
import { useAchievementFormat } from "./use-achievements-format";

import { achievementById, TIERS } from "@/lib/achievements/catalog";
import { achievementCopy } from "@/lib/copy/achievements";
import { formatMessage } from "@/lib/copy/message";
import { useFormat } from "@/lib/format/format";

/** Distance between the front and back face planes (coin thickness). */
const COIN_THICKNESS = 8;
/** Rotation per pixel of horizontal drag. */
const DRAG_FACTOR = 0.55;
/** Horizontal slop (px) before a press counts as a drag, not a click. */
const DRAG_SLOP = 5;

type DragState = {
  pointerId: number;
  startX: number;
  startRot: number;
  samples: { t: number; x: number }[];
};

export function AchievementCoin({
  progress,
  open,
  locale,
}: {
  progress: AchievementProgress;
  /** The dialog's open state — closing the dialog shows the front again. */
  open: boolean;
  locale: Locale;
}) {
  const format = useAchievementFormat();
  const { formatDate } = useFormat();
  const rotY = useMotionValue(0);
  const reducedMotion = useReducedMotion();
  const dragRef = useRef<DragState | null>(null);
  const movedRef = useRef(false);
  const interactedRef = useRef(false);
  const animRef = useRef<AnimationPlaybackControls | null>(null);
  const openRef = useRef(open);
  const [flipped, setFlipped] = useState(false);

  const entry = achievementById(progress.id);
  const currentTier = TIERS.find((tier) => tier.tier === progress.tier) ?? null;
  const metal = tierMetal(progress.tier);
  const ramp = tierRamp(progress.tier);
  const day = currentTier ? progress.achieved_at[currentTier.key] : null;
  const nextThreshold =
    progress.tier < TIERS.length ? progress.thresholds[progress.tier] : null;
  const flipLabel = achievementCopy(
    locale,
    flipped ? "achievements.ui.coinFlipBack" : "achievements.ui.coinFlip",
  );

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const stopAnim = () => {
    animRef.current?.stop();
    animRef.current = null;
  };

  // Reset to the front on close / achievement switch, then replay the
  // upstream entrance: one full spin into place, followed by an idle sway.
  // Both stop forever on the first interaction.
  useEffect(() => {
    let cancelled = false;

    animRef.current?.stop();
    animRef.current = null;
    rotY.set(0);
    setFlipped(false);
    interactedRef.current = false;

    if (!open || reducedMotion) return;

    rotY.set(-360);
    const entrance = animate(rotY, 0, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
    });

    animRef.current = entrance;
    entrance.then(() => {
      if (cancelled || interactedRef.current || !openRef.current) return;
      animRef.current = animate(rotY, [0, -14, 14, 0], {
        duration: 4.5,
        repeat: Infinity,
        ease: "easeInOut",
      });
    });

    return () => {
      cancelled = true;
      animRef.current?.stop();
      animRef.current = null;
    };
  }, [open, progress.id, reducedMotion, rotY]);

  /** Face shown at a settled rotation: odd multiples of 180° are the back. */
  const faceAt = (rotation: number) =>
    (((Math.round(rotation / 180) * 180) % 360) + 360) % 360 === 180;

  /** Release: project a flick target from the velocity, snap to a face. */
  const settle = (velocity: number) => {
    const current = rotY.get();
    const target =
      Math.round((reducedMotion ? current : current + velocity * 0.35) / 180) *
      180;

    setFlipped(faceAt(target));
    animRef.current = reducedMotion
      ? animate(rotY, target, { duration: 0.2, ease: "easeOut" })
      : animate(rotY, target, {
          type: "spring",
          velocity,
          stiffness: 58,
          damping: 13.5,
          mass: 1,
        });
  };

  const flip = () => {
    stopAnim();
    interactedRef.current = true;
    const target = Math.round(rotY.get() / 180) * 180 + 180;

    setFlipped(faceAt(target));
    animRef.current = animate(rotY, target, {
      type: "spring",
      stiffness: 120,
      damping: 16,
    });
  };

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    interactedRef.current = true;
    stopAnim();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    movedRef.current = false;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startRot: rotY.get(),
      samples: [{ t: event.timeStamp, x: event.clientX }],
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startX;

    if (!movedRef.current && Math.abs(deltaX) > DRAG_SLOP) {
      movedRef.current = true;
    }
    rotY.set(drag.startRot + deltaX * DRAG_FACTOR);
    drag.samples.push({ t: event.timeStamp, x: event.clientX });
    if (drag.samples.length > 5) drag.samples.shift();
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) return;

    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const first = drag.samples[0];
    const last = drag.samples[drag.samples.length - 1];
    const elapsed = last.t - first.t;
    const velocity =
      elapsed > 0 ? ((last.x - first.x) * DRAG_FACTOR * 1000) / elapsed : 0; // deg/s

    settle(velocity);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

    event.preventDefault();
    interactedRef.current = true;
    stopAnim();
    const delta = event.key === "ArrowRight" ? 30 : -30;

    animRef.current = animate(rotY, rotY.get() + delta, {
      duration: 0.15,
      ease: "easeOut",
    });
  };

  // The click event fires after pointerup; a real drag suppresses it so the
  // release settle does not get a flip stacked on top.
  const onClick = () => {
    if (movedRef.current) {
      movedRef.current = false;

      return;
    }
    flip();
  };

  // Sheen tracks rotation so light appears to travel across the metal. The
  // back face is pre-rotated 180°, so its sheen sweeps the opposite way — the
  // light source stays fixed in the room while the coin turns through it.
  const sheenX = useTransform(rotY, (rotation) => {
    const normalized = ((rotation % 360) + 360) % 360;

    return `${(normalized / 360) * 160 - 80}%`;
  });
  const sheenXBack = useTransform(rotY, (rotation) => {
    const normalized = ((rotation % 360) + 360) % 360;

    return `${80 - (normalized / 360) * 160}%`;
  });
  // Faces fall into shadow as they turn away from the key light (edge-on =
  // darkest). The dead zone below ~20° keeps the resting/idle-sway coin at
  // full brightness — shading only kicks in on a real turn.
  const faceShade = useTransform(rotY, (rotation) => {
    const t = Math.abs(Math.sin((rotation * Math.PI) / 180));

    return Math.max(0, (t - 0.35) / 0.65) * 0.3;
  });

  const faceStyle = {
    backfaceVisibility: "hidden",
    WebkitBackfaceVisibility: "hidden",
  } as const;

  return (
    <Tooltip delay={0}>
      <button
        aria-label={flipLabel}
        aria-pressed={flipped}
        className="focus-visible:outline-accent inline-flex cursor-grab select-none items-center justify-center rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 active:cursor-grabbing [&_img]:[-webkit-user-drag:none]"
        style={{ perspective: 900, touchAction: "pan-y" }}
        type="button"
        onClick={onClick}
        onDragStart={(event) => event.preventDefault()}
        onKeyDown={onKeyDown}
        onPointerCancel={onPointerEnd}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
      >
        <span
          className="relative block w-44"
          style={{ transform: "rotateX(-8deg)", transformStyle: "preserve-3d" }}
        >
          <motion.div
            className="relative"
            style={{
              rotateY: rotY,
              transformStyle: "preserve-3d",
              width: 176,
              height: 176,
            }}
          >
            {/* Coin edge: stacked rings between the two face planes. */}
            {[-3, -1.5, 0, 1.5, 3].map((z) => (
              <span
                key={z}
                aria-hidden="true"
                className="absolute inset-0 rounded-full"
                style={{
                  transform: `translateZ(${z}px)`,
                  background: metal.deep,
                }}
              />
            ))}

            {/* Front face: the medallion artwork with studio lighting. The
                face is transparent to hit-testing so every press lands on the
                button itself — pressing the bitmap artwork must never start a
                native image drag (that hijack is why centre presses used to
                dead-end the drag). Faces self-round their layers instead of
                relying on overflow clipping, which is unreliable inside a
                preserve-3d subtree. */}
            <div
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{
                ...faceStyle,
                transform: `translateZ(${COIN_THICKNESS / 2}px)`,
              }}
            >
              <AchievementMedallion
                art={entry?.art}
                className="w-full"
                icon={entry?.icon ?? "tokens"}
                id={progress.id}
                tier={progress.tier}
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-full"
                style={{
                  background:
                    "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.45), rgba(255,255,255,0) 42%), linear-gradient(172deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 38%, rgba(0,0,0,0.08) 100%)",
                  boxShadow:
                    "inset 0 3px 7px rgba(255,255,255,0.5), inset 0 -3px 8px rgba(0,0,0,0.15)",
                }}
              />
              <motion.div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-full"
                style={{
                  x: sheenX,
                  background:
                    "linear-gradient(105deg, transparent 34%, rgba(255,255,255,0.5) 50%, transparent 66%)",
                }}
              />
              <motion.div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-full"
                style={{
                  opacity: faceShade,
                  background: "rgba(8, 12, 10, 0.9)",
                }}
              />
            </div>

            {/* Back face: the tier metal disc — machined texture, mirrored
                studio light, engraved tier name + day (or the next threshold
                while locked). */}
            <div
              className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5 rounded-full px-6 text-center"
              style={{
                ...faceStyle,
                transform: `rotateY(180deg) translateZ(${COIN_THICKNESS / 2}px)`,
                background: `radial-gradient(circle at 32% 26%, ${metal.light}, ${metal.mid} 58%, ${metal.deep})`,
                boxShadow: `inset 0 0 0 5px ${metal.mid}, inset 0 0 0 6.5px rgba(255,255,255,0.22), inset 0 3px 7px rgba(255,255,255,0.4), inset 0 -4px 12px rgba(0,0,0,0.22)`,
              }}
            >
              {/* Radial machining lines, like a lathe-finished coin reverse. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-full"
                style={{
                  background:
                    "repeating-radial-gradient(circle at 50% 50%, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 1px, transparent 1px, transparent 4px)",
                }}
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-full"
                style={{
                  background:
                    "radial-gradient(circle at 70% 20%, rgba(255,255,255,0.4), rgba(255,255,255,0) 44%), linear-gradient(188deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 38%, rgba(0,0,0,0.10) 100%)",
                }}
              />
              <span className="relative flex flex-col items-center gap-1.5 text-center">
                {currentTier ? (
                  <>
                    <Typography
                      className="text-lg font-semibold"
                      style={{ color: ramp.ink }}
                    >
                      {achievementCopy(locale, currentTier.copyKey)}
                    </Typography>
                    {day ? (
                      <Typography
                        className="tabular-nums whitespace-nowrap"
                        style={{ color: ramp.ink, opacity: 0.8 }}
                        type="body-xs"
                      >
                        {formatMessage(
                          achievementCopy(
                            locale,
                            "achievements.ui.dialogAchieved",
                          ),
                          locale,
                          {
                            date: formatDate(day, {
                              dateStyle: "medium",
                              timeZone: "UTC",
                            }),
                          },
                        )}
                      </Typography>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Typography
                      className="text-lg font-semibold"
                      style={{ color: ramp.ink }}
                    >
                      {achievementCopy(locale, "achievements.ui.cardLocked")}
                    </Typography>
                    {nextThreshold != null ? (
                      <Typography
                        className="tabular-nums"
                        style={{ color: ramp.ink, opacity: 0.8 }}
                        type="body-xs"
                      >
                        {achievementCopy(locale, "achievements.ui.dialogNext")}
                        {" · "}
                        {format(progress.unit, nextThreshold)}
                      </Typography>
                    ) : null}
                  </>
                )}
              </span>
              {/* Travelling sheen (opposite direction: fixed room light). */}
              <motion.div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-full"
                style={{
                  x: sheenXBack,
                  background:
                    "linear-gradient(105deg, transparent 34%, rgba(255,255,255,0.45) 50%, transparent 66%)",
                }}
              />
              <motion.div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-full"
                style={{
                  opacity: faceShade,
                  background: "rgba(8, 12, 10, 0.9)",
                }}
              />
            </div>
          </motion.div>
          {/* Ground shadow anchors the coin in space. */}
          <span
            aria-hidden="true"
            className="absolute left-1/2 h-3 w-3/5 -translate-x-1/2 rounded-[100%] bg-black/20 blur-md dark:bg-black/45"
            style={{ bottom: -20 }}
          />
        </span>
      </button>
      <Tooltip.Content showArrow placement="bottom">
        <Tooltip.Arrow />
        <Typography type="body-xs">{flipLabel}</Typography>
      </Tooltip.Content>
    </Tooltip>
  );
}
