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

## 部署（腾讯云 EdgeOne Pages · Makers）

实际托管：操作者使用**腾讯云 EdgeOne Pages（Makers 套餐）**部署本站，域名绑定
**token-usage.cc**（2026-11-08 拍板）。要点：

1. 构建产物为静态导出目录 `out/`（`pnpm build:landing`），EdgeOne Pages 按静态
   站点接入（Git 连接或产物上传均可），无需 Node 运行时；
2. 环境变量：无必填（快照已固化、徽章直链指向实例域名）；
3. 域名 `token-usage.cc`（及可选 `www.`）在腾讯云内侧 CNAME 接入 EdgeOne；
4. 备案：域名已备案（粤ICP备2023007649号-5，2026-11-11 备案通过），页脚右下角展示
   ICP 号并链接工信部；文案在 `src/lib/copy.ts` 的 `footer.beian`（`icp` / `police`，
   空串隐藏对应条目）。公安网备待部署后提交，拿到号填 `beian.police` 即可（数字部分
   自动拼进 `beian.mps.gov.cn` 查询链接）。

**对外口径仍为 Vercel**：落地页上的 Deploy to Vercel 按钮与部署指南面向的是
**自部署用户**（部署 `apps/web` 仪表盘），与本站的托管选择无关，保持不变；
本站实际托管在 EdgeOne 属运营细节，不在对外文案中提及。

## 素材说明

- `public/fonts/maple-mono-cn-regular.woff2`：与 apps/web 同一份字体子集
  （OFL-1.1，见 globals.css 头注）。
- `public/share-cards/*.png`：由 apps/web 的 Canvas 分享卡引擎以 mock 数据
  导出（四风格：特刊/小票/霓虹/唱片），非操作者真实数据。
- `public/brand-logos/`、`public/achievements/`：从 apps/web public 复制的
  子集，更新时两边同步。
- `public/beian/icp.png` / `public/beian/police.png`：页脚备案图标（14px 展示），
  取自操作者站点通用素材；换号时只改 `src/lib/copy.ts` 的 `footer.beian` 文案。
