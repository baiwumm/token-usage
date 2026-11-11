"use client";

// 回到顶部（2026-11-11 操作者要求）：页面滚动过阈值后浮出，点击平滑回顶
// （reduced-motion 下瞬时跳转）。显隐、悬停上浮、按压回弹全部走 CSS 过渡，
// 滚动监听用 rAF 节流，一帧最多一次 state 读取。

import { ArrowUp } from "@gravity-ui/icons";
import { Button, cn } from "@heroui/react";
import { useCallback, useEffect, useState } from "react";

/** 滚过这一步才浮出；Hero 约一屏高，避免一进页就出现。 */
const SHOW_AFTER_PX = 480;

export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      frame = 0;
      setVisible(window.scrollY > SHOW_AFTER_PX);
    };
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });

    return () => {
      window.removeEventListener("scroll", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const scrollToTop = useCallback(() => {
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }, []);

  return (
    <Button
      isIconOnly
      aria-label="回到顶部"
      className={cn(
        "border-default/60 bg-surface/90 text-foreground fixed right-4 bottom-4 z-30 size-11 rounded-full border shadow-lg backdrop-blur-md sm:right-6 sm:bottom-6",
        // 缓出曲线带一点回弹感；显隐、上浮、按压共用一条过渡。
        // visibility 也在过渡列表里：淡出时它到最后一帧才切 hidden，收场不会硬切。
        "transition-[opacity,transform,visibility,box-shadow,border-color,color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        // hover/active 底色显式压回表面色，避免 ghost 变体自带的灰底盖住 accent 描边。
        "hover:bg-surface active:bg-surface hover:-translate-y-1 hover:border-accent/60 hover:text-accent hover:shadow-xl",
        // 组件自带 :active 的 transform: scale(.97)；先清掉再走自己的 scale，免得多重缩放叠加。
        "active:translate-y-0 active:scale-95 active:transform-none",
        "motion-reduce:transition-none",
        visible
          ? "translate-y-0 scale-100 opacity-100"
          : "pointer-events-none invisible translate-y-3 scale-90 opacity-0",
      )}
      size="lg"
      variant="ghost"
      onPress={scrollToTop}
    >
      <ArrowUp aria-hidden="true" className="size-4.5" />
    </Button>
  );
}
