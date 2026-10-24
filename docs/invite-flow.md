# 邀请建号与首次登录流程（M2）

本文面向自部署者（=管理员）：如何给新用户建号、用户如何完成首次登录。
登录方式仅两种：**邮箱密码**（管理员下发临时密码）与**邮件魔法链接**；公开注册关闭
（`docs/requirements.md` 角色与权限）。

## 0. 前置条件（一次性）

1. Supabase 项目已建库（`token_*` 表，`supabase db push`），环境变量按
   `docs/rewrite-plan.md` §9 配齐（`NEXT_PUBLIC_SUPABASE_URL` /
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY`）。
2. **Supabase Auth URL 配置**（Dashboard → Authentication → URL Configuration）：
   - Site URL 填部署域名根（如 `https://token-usage.baiwumm.com`）；
   - Redirect URLs 加入 `<部署域名>/auth/callback`（魔法链接会话交换的落点）。
   本地验收时按对应 origin（如 `http://127.0.0.1:3000/auth/callback`）追加。
3. 邮件服务：Supabase **内置邮件服务有限速**（免费档每小时少量封数），只适合验证与
   极小规模自用；生产建议在 Dashboard → Authentication → SMTP 配置自定义 SMTP。
   邀请邮件与魔法链接都走这条通道，注意预算。

## 1. 管理员建号（二选一）

脚本：`scripts/admin/create-user.cjs`（读 `apps/web/.env.local`，可用 `--env-file` 覆盖）。

### 模式 A：发邀请邮件（默认）

```bash
node scripts/admin/create-user.cjs --email user@example.com
```

- 调 Supabase Auth `POST /auth/v1/invite`，向该邮箱发送邀请邮件；
- 收件人点击邮件链接完成激活后即可登录；
- 可选 `--redirect-to <url>` 指定邮件链接回跳地址（默认 Site URL）。
- 注意：消耗一封邮件额度。

### 模式 B：直接建号 + 临时密码（不依赖邮件可达）

```bash
node scripts/admin/create-user.cjs --email user@example.com --password
# 或指定临时密码：
node scripts/admin/create-user.cjs --email user@example.com --password --password-value 'temp-pass-123'
```

- 调 Auth Admin API `POST /auth/v1/admin/users`，`email_confirm=true` 直接建号；
- 不发任何邮件（`--password-value` 缺省时脚本生成 20 位随机临时密码并打印）；
- 把打印出的临时密码通过安全渠道交给用户，用户用「密码登录」进入；
- 临时密码的重置：v1 暂无自助改密页面，管理员可在 Supabase Dashboard →
  Authentication → Users 中删除/重建，或用本脚本重跑（邮箱已存在会报错，先删除旧号）。

## 2. 用户首次登录

入口：部署域名的 `/login`（登录页提供两种方式切换）。

### 密码登录

1. 输入管理员下发的邮箱与临时密码 → 「登录」；
2. 成功后跳转 `?next=` 指定的原目标页（缺省进仪表盘 `/`）。

### 魔法链接

1. 切到「魔法链接」标签 → 输入邮箱 → 「发送魔法链接」；
2. 邮箱收到一次性登录邮件 → 点击链接回跳 `<部署域名>/auth/callback?code=...`；
3. 服务端完成 PKCE 会话交换（写入会话 cookie）后回跳原目标页。
   链接过期/重复使用会回到登录页并提示重新登录。

## 3. 登录之后

- 未登录访问受保护页（仪表盘 / 设置 / wrapped / 服务状态 / 配对页）一律跳登录页并
  携带原路径与查询参数（配对链接 `?user_code=` 不丢失），登录后回跳原目标。
- 设备的接入与吊销在设置页（`/settings`）管理；CLI 配对见 `docs/cli-contract.md` §2.1–2.3
  与配对页任务（M5）。
- 浏览器网络面板里除认证链路（`@supabase/ssr` 的会话 cookie / token 刷新，已裁决豁免）
  外，零 Supabase 直连；数据全部经本应用 route.ts 读取。

## 4. 测试数据纪律

- 脚本/演示产生的测试账号一律用 `accept-m2-` 前缀邮箱（如
  `accept-m2+<stamp>@example.test`），验收后删除该用户（Dashboard 或 Auth Admin API
  `DELETE /auth/v1/admin/users/<id>`），关联设备行随之清理。
- 任何测试不使用真实用户邮箱（操作者本人的魔法链接验收除外——那是真实账号，不清理）。
