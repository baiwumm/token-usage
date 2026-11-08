/** @type {import('next').NextConfig} */

// token-usage.cc 落地页（2026-11-08 立项）：纯静态营销站，无数据面、无 API、
// 无登录。output: "export" 是本仓库第一个静态导出 app，产物 out/ 直接交给
// Vercel 第二项目（见 apps/landing/README.md）。
const nextConfig = {
	output: "export",
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

export default nextConfig;
