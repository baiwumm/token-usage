# @token-usage/landing

token-usage.cc 官方落地页（2026-11-08 立项）：纯静态单页营销站，暗色单主题，
无数据面、无 API、无登录。`output: "export"` 静态导出，产物 `out/`。

## 本地开发

```bash
pnpm dev:landing     # http://localhost:3000
pnpm build:landing   # 静态导出到 out/
pnpm verify          # 根门禁（web + cli + landing 全量）
```

## 数据快照

`src/data/snapshot.json` 是操作者公开徽章/公开页的聚合数字快照（README 已公开
链接，无行级数据），`fetchedAt` 标注提取日期。更新方式：改 `fetchedAt` 与对
应数字即可——热力图 cells 为 `[day, tokens, level]` 三元组（52 列 × 7 行，
周序），series 为近 30 天日桶。

页脚「实时公开徽章」与 Hero「公开页演示」链接在**构建期**从仓库根 `README.md`
解析（`src/lib/badge-url.ts`），README 变更即跟随，不硬编码令牌。

## Vercel 部署（第二项目）

与 `apps/web` 的自托管部署相互独立，绑定域名 **token-usage.cc**：

1. Vercel 上**新建独立项目**（不要复用 web 的项目），导入本仓库；
2. **Root Directory 设为 `apps/landing`**（框架自动识别 Next.js）；
3. Build Command 用默认 `next build`（package.json 的 build 已含静态导出）；
   Output 由 Vercel 从 `output: "export"` 自动识别，无需手工填；
4. 环境变量：无必填（快照已固化、徽章直链指向实例域名）；
5. Domains 绑定 `token-usage.cc`（及可选 `www.`），DNS 在腾讯云加 CNAME；
6. 备案（可选）：.cc 可备案，备案号填 `site-footer.tsx` 的 ICP 占位。

## 素材说明

- `public/fonts/maple-mono-cn-regular.woff2`：与 apps/web 同一份字体子集
  （OFL-1.1，见 globals.css 头注）。
- `public/share-cards/*.png`：由 apps/web 的 Canvas 分享卡引擎以 mock 数据
  导出（四风格：特刊/小票/霓虹/唱片），非操作者真实数据。
- `public/brand-logos/`、`public/achievements/`：从 apps/web public 复制的
  子集，更新时两边同步。
