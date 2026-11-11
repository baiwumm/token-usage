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

`src/data/snapshot.json` 是操作者公开页的聚合数字快照（`fetchedAt` 标注窗口右端）。
它由脚本生成，**不再手工抄数字**：

```bash
pnpm --filter @token-usage/landing sync:snapshot   # 拉一次并改写 snapshot.json
pnpm build:landing:deploy                          # 同步 + 构建（部署用）
```

- 数据源：`GET /api/badge/data?token=…`（`docs/badge.md` §2.4），与 `/u/<token>` 走
  同一个 service-role 加载器，两处数字必然一致；
- 令牌与实例 origin 仍从仓库根 `README.md` 解析（同 `src/lib/badge-url.ts`），不硬编码；
- 任一失败（README 缺、离线、非 200、结构不符）只告警并**保留已提交的快照**，构建不中断；
  `TOKEN_USAGE_SNAPSHOT_SYNC=off` 跳过网络调用，`TOKEN_USAGE_SNAPSHOT_URL` 覆盖同步地址
  （本地联调 / 预发）；
- `pnpm verify` 里的 `next build` 不跑同步，门禁保持离线、可重复；
- 部署构建命令即 `pnpm build:landing:deploy`（见下文「部署」），产物里的数字是构建时刻的
  最新值（部署后仍是冻结静态页，直到下次构建）。

文件形状不变：`heatmap.cells` 为 `[day, tokens, level]` 三元组（52 列 × 7 行，周序，
`level` 与仪表盘同一套 0–4 分档），`series` 为近 30 天日桶。

页脚「实时公开徽章」与顶栏「公开页演示」链接在**构建期**从仓库根 `README.md`
解析（`src/lib/badge-url.ts`），README 变更即跟随，不硬编码令牌。页脚徽章渲染
**light / dark 两版并排**（`badgeImageUrl(style, theme)`），暗色页上亮色版更醒目，
成对展示填满右半区。

## 部署（腾讯云 EdgeOne Pages · Makers）

实际托管：操作者使用**腾讯云 EdgeOne Pages（Makers 套餐）**部署本站，域名绑定
**token-usage.cc**（2026-11-08 拍板）。仓库为 pnpm monorepo，接入方式固定为「Git 连接
+ 根目录 `/`」：构建产物是静态导出目录 `apps/landing/out`，无需 Node 运行时。

### 首次建项目：控制台「配置项目」怎么填

| 字段 | 值 |
|------|-----|
| 导入仓库 | `baiwumm/token-usage`，分支 `main` |
| 项目名称 | `token-usage` |
| 可用区 | 全球可用区（含中国大陆） |
| 框架预设 | `Other`（纯静态导出，不用框架自动识别） |
| 根目录 | `/` |
| 安装命令 | `pnpm install --frozen-lockfile` |
| 构建命令 | `pnpm build:landing:deploy` |
| 输出目录 | `apps/landing/out` |
| Node 版本 | `22.11.0`（平台预装） |
| 环境变量 | 无 |

其中安装命令、构建命令、输出目录、Node 版本已写在仓库根 `edgeone.json`，该文件会
**覆盖控制台设置**——控制台值只是建项目时的初始值，之后改配置改文件即可（重部署生效）。
**根目录必须留 `/`**：`edgeone.json` 只从项目根目录读取，挪到 `apps/landing/` 不生效。

构建命令必须是 `pnpm build:landing:deploy`（`sync:snapshot` → `next build`），这样每次
部署都会刷新快照数字；只想验证构建时用 `pnpm build:landing`（离线、不联网）。
**部署顺序**：先让 `apps/web` 上线（`/api/badge/data` 存在于线上），再触发本站构建；
否则同步失败只告警、沿用已提交的旧快照（见上文「数据快照」）。

### 仓库根 `edgeone.json`（重定向与缓存）

- **重定向**：`$wwwhost` → `$host`（301），即 `www.token-usage.cc` → `token-usage.cc`。
  apex 是规范域名，与 `src/app/layout.tsx` 的 `metadataBase` 及文档口径一致。`$host` /
  `$wwwhost` 只在自定义域名上生效（平台分配的预览域名不受影响）。要改为 www 规范，把
  `source` / `destination` 对调，并同步改 `metadataBase` 与页面文案里的域名；
- **缓存头**：`/_next/static/*` 一年 `immutable`（文件名带内容哈希，安全）；其余资源与
  HTML 不设长缓存，重新部署即时生效。`headers` / `redirects` 的 `source` 是 URL 路径
  通配符（`*` 不是文件 glob）；
- 本项目一律走 Git 连接构建；「直接上传 `out/`」没有构建步骤，安装/构建/输出目录三项
  无意义，不作为部署路径。

排障：若构建日志报 pnpm 版本相关错误（例如不认识 `pnpm-workspace.yaml` 里的
`trustPolicy` / `minimumReleaseAgeExclude`），说明构建环境的 pnpm 低于仓库声明的
`pnpm@12.11.2`，把安装命令换成 `corepack enable && pnpm install --frozen-lockfile`
再重试。

### 域名与备案

- 域名 `token-usage.cc`（及可选 `www.`）在腾讯云内侧 CNAME 接入 EdgeOne；
- 备案：域名已备案（粤ICP备2023007649号-5，2026-11-11 备案通过），页脚右下角展示
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
