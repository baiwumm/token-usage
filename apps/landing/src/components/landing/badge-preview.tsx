"use client";

// 外链徽章预览框：徽章 <img> 指向操作者实例（跨境外链），首访网络慢时
// 原本是一块空白。占位框按徽章真实画布 600×176（docs/badge.md §5.2，sparkline
// 同尺寸）预留宽高比 + shimmer 脉冲，图片 onLoad 后淡入——加载期有可见反馈，
// 布局不抖。img 用 h-auto 自然高度渲染，**不做任何裁剪**（首版用 5:1 +
// object-cover 把 176px 画布裁掉了底部，已废弃）。
// 客户端组件的原因：onLoad 驱动淡入需要状态；外层 footer 保持服务端组件。

import { useState } from "react";

export function BadgePreview({
  alt,
  ariaLabel,
  href,
  src,
}: {
  alt: string;
  ariaLabel: string;
  href: string | undefined;
  src: string;
}) {
  const [loaded, setLoaded] = useState(false);

  return (
    <a
      aria-label={ariaLabel}
      className="block w-full"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      {/* 容器不锁宽高比：img 的 width/height 属性让浏览器加载前即预留
          600:176 空间（真实比例变了也自然适配，永不裁剪），shimmer 覆盖其上。 */}
      <span className="relative block w-full rounded-md">
        {loaded ? null : (
          <span
            aria-hidden="true"
            className="absolute inset-0 animate-pulse bg-default/40 motion-reduce:animate-none"
          />
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={alt}
          className={`h-auto w-full rounded-md transition-opacity duration-500 ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
          decoding="async"
          height={176}
          loading="lazy"
          src={src}
          width={600}
          onLoad={() => setLoaded(true)}
        />
      </span>
    </a>
  );
}
