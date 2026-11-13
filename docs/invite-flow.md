# 邀请建号与首次登录

面向自部署者（= 管理员）：如何给新用户建号、用户如何完成首次登录。公开注册关闭，账号由管理员
（service-role）创建；登录方式为邮箱密码、邮件魔法链接，可选 GitHub / Google OAuth（只作已有
账号的登录方式，不是注册通道）。

前置条件（建库、Auth URL 配置、SMTP）见 [`docs/deploy-guide.md`](deploy-guide.md) §2–§3。
关键前提只有两条：迁移已执行；Supabase **Allow new users to sign up 已关闭**（否则陌生人可自助
注册，绕过邀请）。

## 1. 管理员建号（二选一）

脚本：`scripts/admin/create-user.cjs`（读 `apps/web/.env.local`，可用 `--env-file` 覆盖）。

**模式 A：发邀请邮件（默认）**

```bash
node scripts/admin/create-user.cjs --email user@example.com
```

调 `POST /auth/v1/invite` 发送邀请邮件；收件人点链接完成激活后即可登录。`--redirect-to <url>`
可指定回跳地址（默认 Site URL）。消耗一封邮件额度。

**模式 B：直接建号 + 临时密码（不依赖邮件可达）**

```bash
node scripts/admin/create-user.cjs --email user@example.com --password
node scripts/admin/create-user.cjs --email user@example.com --password --password-value 'temp-pass-123'
```

调 `POST /auth/v1/admin/users` 并以 `email_confirm=true` 建号；不发邮件（缺省时生成 20 位随机临时
密码并打印）。把临时密码通过安全渠道交给用户，用「密码登录」进入。

临时密码有自助重置路径：登录页「忘记密码」走邮箱重置，或在设置页「账户 → 密码」自助改密（≥8 位；
魔法链接账号在此开启密码登录）。管理员侧也可在 Supabase → Authentication → Users 删除 / 重建，
或用本脚本重跑（邮箱已存在会报错，先删除旧号）。

## 2. 用户首次登录

入口：部署域名的 `/login`（两种方式切换，OAuth 按钮仅在部署者配置后出现）。

- **密码登录**：输入邮箱与临时密码 → 成功后跳转 `?next=` 指定的原目标页（缺省进仪表盘 `/`）。
- **魔法链接**：切到「魔法链接」→ 输入邮箱 → 点邮件链接回跳
  `<部署域名>/auth/callback?code=...` → 服务端完成 PKCE 会话交换后回跳原目标页。链接过期或
  重复使用会回到登录页并提示重新登录。

## 3. 登录之后

- 未登录访问受保护页一律跳登录页并携带原路径与查询参数（配对链接 `?user_code=` 不丢失），登录后
  回跳原目标。受保护页面清单是 `apps/web/src/proxy.ts` 的 `PROTECTED_PAGES`；例外只有 `/login`、
  `/auth/callback` 与公开页 `/u/<token>`、`/api/functions/*`。
- 设备接入与吊销在设置页（`/settings`）管理；CLI 配对流程见 `docs/cli-contract.md` §2.1–2.3。
- 浏览器除认证链路（`@supabase/ssr` 的会话 cookie 与 token 刷新）外零 Supabase 直连，数据全部经
  本应用 `route.ts` 读取。

## 4. 测试数据纪律

测试账号一律用 `accept-m2-` 前缀邮箱（如 `accept-m2+<stamp>@example.test`），验收后删除该用户
（Dashboard 或 `DELETE /auth/v1/admin/users/<id>`），关联设备行随之清理。任何测试不使用真实用户
邮箱（操作者本人的验收账号除外——那是真实账号，不清理）。
