import type { ReactNode } from "react";

import { LogoGithub } from "@gravity-ui/icons";
import { DocsLayout } from "fumadocs-ui/layouts/docs";

import { REPO_URL } from "@/lib/repo-links";
import { source } from "@/lib/source";

// 文档区布局：侧边栏顶部 nav.title 提供项目 Logo + 站名（不传 nav 时只剩
// 一个折叠按钮），底部操作条放 GitHub 图标链接（url 为绝对地址时 fumadocs
// 的 Link 自动 target="_blank"）。落地页是暗色单主题（2026-11-08 拍板，
// 根布局 html class="dark" 写死），文档区不做亮暗切换。
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      links={[
        {
          type: "icon",
          url: REPO_URL,
          icon: <LogoGithub className="size-4" />,
          text: "GitHub",
          label: "GitHub 仓库",
          external: true,
        },
      ]}
      // 落地页暗色单主题（2026-11-08 拍板）：不渲染亮暗切换器。
      nav={{
        title: (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt=""
              className="size-6 rounded-md"
              height={24}
              src="/logo-dark.svg"
              width={24}
            />
            <span className="font-semibold">Token Usage</span>
          </>
        ),
        url: "/",
      }}
      themeSwitch={{ enabled: false }}
      tree={source.pageTree}
    >
      {children}
    </DocsLayout>
  );
}
