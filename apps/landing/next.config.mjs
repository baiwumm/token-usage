import { createMDX } from "fumadocs-mdx/next";

// token-usage.cc 落地页（2026-11-08 立项）：静态站，营销首页 + /docs 文档区
// （fumadocs 静态导出）。无数据面、无运行时 API、无登录。output: "export"
// 产物 out/ 直接交给 EdgeOne Pages（见 apps/landing/README.md）。
//
// /docs 文档区的静态导出链路（同 better-admin/apps/website 验证过的组合）：
// - fumadocs 原生 /api/search 服务端搜索不可用 → route 改 `staticGET` +
//   `force-static`，构建期把索引固化为 out/api/search 静态文件，前端
//   RootProvider 用 staticClient 拉取；
// - trailingSlash: true 让每篇文档落到 out/docs/<slug>/index.html，静态
//   托管无需扩展名改写；根路径 / 不受影响。
const nextConfig = {
	output: "export",
	trailingSlash: true,
	images: { unoptimized: true },
	// 与 apps/web 同款隔离开关：测试/并行 build 可用 NEXT_DIST_DIR 指到独立
	// 目录。本 app 的 tsconfig 刻意不引用任何替代 dist 目录的 glob（不复刻
	// web 的 NEXT_DIST_DIR 副作用）。
	distDir: process.env.NEXT_DIST_DIR || ".next",
	experimental: {
		// Barrel packages imported by name across components; the optimizer
		// rewrites them to per-symbol modules.
		optimizePackageImports: ["@heroui/react", "@gravity-ui/icons"],
	},
};

export default createMDX()(nextConfig);
