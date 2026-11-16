# demo 实例运维手册

公开演示实例 `https://demo.token-usage.cc` 的建库、部署、重置与排障。方案与决策见
[`docs/demo-instance-plan.md`](demo-instance-plan.md)；本册只讲「怎么操作」。

**边界（不可逾越）**：demo 与操作者生产实例 `token-usage.baiwumm.com` 相互隔离
（官方域名决策 #19）。不同 Supabase 项目、不同 Vercel 项目、不同域名，代码同源。
下列任何一步都**不要**复用生产环境的 key。

## 1. 一次性建库

1. Supabase 新建项目（Free 档），记三组值：Project URL、publishable key、secret key；
2. 建库（迁移幂等，共 21 个文件）：

```bash
npx supabase login
npx supabase link --project-ref <demo-project-ref>
npx supabase db push
```

3. Auth → **关闭 Allow new users to sign up**（演示账号由种子脚本创建，注册通道必须关闭）；
4. Auth → URL Configuration：
   - Site URL：`https://demo.token-usage.cc`
   - Redirect URLs：`https://demo.token-usage.cc/**`（通配，精确条目盖不住 `?next=`）

**完成条件**：Table Editor 里有 12 张 `token_*` 表且**没有任何 policy**。

## 2. Vercel 项目

| 字段 | 值 |
| --- | --- |
| 仓库 / 分支 | `baiwumm/token-usage` · `main` |
| Root Directory | `apps/web` |
| Include files outside the root directory | **Enabled**（pnpm workspace 根在仓库根） |
| Framework | Next.js（自动识别） |

环境变量：

```text
NEXT_PUBLIC_SUPABASE_URL              = https://<demo-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  = sb_publishable_…
SUPABASE_SECRET_KEY                   = sb_secret_…            # 服务端专用
TOKEN_USAGE_DASHBOARD_URL             = https://demo.token-usage.cc
TOKEN_USAGE_DEMO                      = on                     # 只读闸门
NEXT_PUBLIC_TOKEN_USAGE_DEMO          = on                     # 横幅与禁用态
TOKEN_USAGE_DEMO_EMAIL                = demo@token-usage.cc    # 演示账号
TOKEN_USAGE_DEMO_PASSWORD             = <强随机口令>            # 服务端专用
```

**完成条件**：`https://<vercel-domain>/api/functions/token-usage-public-config` 返回
`supabase_url` 指向 **demo** 项目。

> 配置护栏：`TOKEN_USAGE_DEMO=on` 且 `TOKEN_USAGE_DASHBOARD_URL` 命中生产域名，
> 或缺少演示账号口令时，受保护页面直接 500（`Demo instance misconfigured`），不会渲染空壳。

## 3. 域名

1. Vercel → Project → Domains → 添加 `demo.token-usage.cc`，按提示到 DNSPod 加 TXT 校验；
2. DNSPod 加 CNAME：`demo` → `cname.vercel-dns.com`；
3. 等 Vercel 签发证书（通常几分钟）。

子域沿用主域 `token-usage.cc` 的备案，不需要单独备案。

## 4. 首次灌数据

```bash
# 本地（推荐首次）：把 demo 的三组值写进 apps/web/.env.local 或 --env-file 指定的文件
TOKEN_USAGE_DEMO=on node scripts/demo/seed.mjs --dry-run   # 先看摘要，不写库
TOKEN_USAGE_DEMO=on node scripts/demo/seed.mjs             # 真写
```

脚本会：确保演示账号存在 → 只清该账号的行 → 写入 120 天确定性数据（3 台设备、2298 个
小时桶、约 430 条会话、约 490 条采集记录、公开徽章与公开页配置）→ 打印摘要与公开链接。

可用参数：`--days <n>`、`--seed <int>`、`--dry-run`、`--env-file <path>`、`--force`。

**安全护栏**：未设 `TOKEN_USAGE_DEMO=on`（且未 `--force`）拒绝运行；项目里有多个用户时
拒绝清表；`TOKEN_USAGE_DASHBOARD_URL` 指向生产实例时拒绝运行。

**完成条件**：脚本打印 `Seed complete.`，且输出的 `/u/<page_token>` 可打开。

## 5. 每晚重灌（保活）

`.github/workflows/demo-reseed.yml` 每天 03:00 UTC 跑一次，同时承担 Supabase Free 项目
的闲置保活（7 天无活动会被暂停）。

GitHub → Settings → Secrets and variables → Actions：

| 类型 | 名称 | 值 |
| --- | --- | --- |
| Secret | `DEMO_SUPABASE_URL` | `https://<demo-ref>.supabase.co` |
| Secret | `DEMO_SUPABASE_SECRET_KEY` | demo 项目的 secret key |
| Secret | `DEMO_DEMO_PASSWORD` | 演示账号口令（与 Vercel 上一致） |
| Variable | `DEMO_EMAIL` | `demo@token-usage.cc` |

启用前先本地手动跑通一次 §4；首次可用 `workflow_dispatch` 手动触发确认。

## 6. 自检清单

| 检查 | 期望 |
| --- | --- |
| 匿名打开 `https://demo.token-usage.cc/` | ≤2 跳直达仪表盘（proxy → demo-login → 302） |
| 顶部横幅 | 显示「演示实例 · 只读」及重置说明 |
| `POST /api/app/badge` | `403 {"error":"Demo instance is read-only"}` |
| `POST /api/functions/token-usage-ingest` | 同上 403 |
| `PUT /api/functions/token-usage-ingest` | `405 Method not allowed`（契约层先判） |
| `/settings` 徽章与设备 | 新增/编辑/吊销/删除按钮禁用；徽章链接仍可复制 |
| `/device` | 批准按钮禁用并提示「演示实例不可修改」 |
| `/sessions` `/projects` `/sync-runs` `/wrapped` `/achievements` | 均有数据 |
| 浏览器网络面板 | 无 Supabase 数据表直连（仅认证流量） |

## 7. 重置与排障

- **数据没更新**：看 Actions 的 `Demo reseed` 最近一次运行；失败时本地按 §4 手动跑一次。
- **页面全部 500 `Demo instance misconfigured`**：演示账号口令缺失，或
  `TOKEN_USAGE_DASHBOARD_URL` 写成了生产域名。
- **匿名打开跳 `/login?error=demo_unavailable`**：演示账号不存在或口令与 Vercel 上不一致，
  重跑 §4（脚本会更新口令）。
- **数字全 0 / 成本全 0**：种子没跑完，或模型不在定价表内；`pnpm --filter @token-usage/web
  exec vitest run tests/unit/demo-seed-generator.test.ts` 会校验定价覆盖。
- **Supabase 项目被暂停**：Free 档 7 天无活动会暂停；恢复后重跑 §4。
- **换域名 / 退役 demo**：先改 `apps/landing/src/lib/demo-url.ts`、本文与 README，再在
  Vercel / DNSPod 解绑。属于不可逆操作，先与操作者确认。
