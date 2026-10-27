# tokenusage-cli 发版手册

npm 包 `tokenusage-cli` 的发布流程、首发未竟事项与发版后检查。机制由
`.github/workflows/release-cli.yml` 承载：`cli-v*` tag 触发 → tag 与
`packages/cli/package.json` 版本强校验且必须落在 main 上 → `pnpm verify` →
`npm publish --provenance`（Trusted Publishing，OIDC 免 token）→ 从
`packages/cli/CHANGELOG.md` 取本版本段落生成 GitHub Release。

## 0. 0.1.0 首发当前状态（2026-10-27 凌晨，待收尾）

- tag `cli-v0.1.0` 已打在 `875dd54` 并推送，仍是 main 祖先，**无需重打**。
- release run [40359194166](https://github.com/baiwumm/token-usage/actions/runs/40359194166)
  走到 npm publish 步失败：**npm PUT 404**。原因：Trusted Publishing 不能创建
  新包——包必须先存在并登记 Trusted Publisher，OIDC 才能对它发版。tag 校验、
  `pnpm verify`、provenance 签名（sigstore logIndex 3490625652）均成功。
- GitHub Release 未创建。完成下节三步后重跑该 run 即可补齐，整条链转绿。

## 一、完成 0.1.0 首发（一次性，任一 npm 已登录环境）

```bash
npm login --registry=https://registry.npmjs.org   # 2FA 会提示 OTP
cd <仓库>/packages/cli
npm publish --access public --registry=https://registry.npmjs.org   # 手动首发；只打包已提交的 CLI 文件
```

注：默认源是 npmmirror 等国内镜像的机器（本机 `~/.npmrc` 即如此）必须显式
`--registry` 指回 npmjs——镜像是只读代理，登录它对发包无用，publish 也发不
上去。npm 凭证按源分别存储（`//registry.npmjs.org/:_authToken`），这样登录
不影响日常安装继续走镜像。

注：浏览器登录若卡在 passkey/Google 密码管理器（到不了 Google 的网络取不出
GPM 里的通行密钥，2026-10-27 公司机实测），改用终端登录，完全不经浏览器：

```bash
npm login --registry=https://registry.npmjs.org --auth-type=legacy
# 依次输入 Username / Password / OTP（2FA 验证器 App 的动态码）
```

然后在网页上登记 Trusted Publisher（无法用命令完成）：

> npmjs.com → tokenusage-cli 包页 → Settings → Trusted Publisher →
> Repository: `baiwumm/token-usage`，Workflow filename: `release-cli.yml`，
> Environment 留空。

登记完成后重跑失败的 run（npm 已有该版本 → 自动跳过 publish，只补 Release）：

```bash
gh run rerun 40359194166 --failed
```

验证三件齐活：

```bash
npm view tokenusage-cli version        # → 0.1.0
gh release view cli-v0.1.0             # 正文来自 CHANGELOG 的 0.1.0 段
```

注：手动首发的 0.1.0 没有 provenance 徽章；从下一个版本起由 CI 发布自动带上。

## 二、日常发版（此后每次，全自动）

1. 改 `packages/cli/package.json` 的 `version`，并在 `packages/cli/CHANGELOG.md`
   顶部补一节 `## X.Y.Z`（release notes 的来源，缺了会退回自动生成）。
2. 提交并推送 main，确认 CI 绿。
3. 打 tag 并推送：`git tag cli-vX.Y.Z && git push origin cli-vX.Y.Z`
   （必须打在**已推送**的 main 提交上；打在旧提交上不会触发任何东西且无报错）。
4. workflow 全自动完成：版本校验 → main 祖先校验 → `pnpm verify` → 发包 → Release。
5. 纪律：run 结束前不要 rebase / 强推 main——重写历史会让 tag 脱离 main，
   发布被安全拒绝（只会发不出去，不会发错）。

回滚：误发版本用 `npm deprecate tokenusage-cli@X.Y.Z "reason"` + 发 patch 版；
确需下架走 npm 联系支持（unpublish 有 72h 限制），GitHub Release 手动删除。

## 三、发版后事项（0.1.0 发布后逐项勾掉）

- [ ] **本机更新采集器**：`npm i -g tokenusage-cli@latest`。本机全局安装
  （`E:\nodejs\node_modules\tokenusage-cli`）目前是旧版——更新后 94bb8e9 的
  auto 进度输出与 875dd54 的日志降噪才生效；计划任务无需改动（VBS 包装指向
  的 node/CLI 路径不变）。
- [ ] **本机计划任务复验**：`Start-ScheduledTask TokenUsageSync` 后确认
  `LastTaskResult=0`、日志 `C:\Users\i\.tokenusage\logs\sync.log` 正常追加且
  不再出现 SQLite ExperimentalWarning。
- [ ] **公司机换装正式包**（2026-10-27 实查：公司机已装开发期 0.1.0（Volta
  全局），且已配对在传——`tokenusage status` 显示 device token set、queue 0，
  `init` / `device-login` 不必重做）：发布后 `volta install tokenusage-cli@0.1.0`
  换成 npm 正式产物（同版本号下直接 `npm i -g tokenusage-cli` 会被 "up to
  date" 跳过，等价命令 `npm i -g tokenusage-cli@0.1.0 --force`），装完
  `tokenusage status` 确认 device token 仍在，跑一次 `tokenusage sync` 收尾。
  默认源走镜像的机器要等 npmmirror 同步上游后才装得到
  （`curl https://registry.npmmirror.com/sync/tokenusage-cli` 可手动触发），
  急用可对 npmjs 显式 `--registry` 强装。
  旧账迁移按 `docs/launch-runbook.md` 与桌面 replay 材料（约 13.6B 待迁）。
- [ ] **观察首日**：仪表盘数据、sync.log、GitHub Release 页面三处对账。

## 四、已知待办（不阻塞发版）

- 下个 CLI 版本：`init` 接管 Windows 计划任务注册（默认隐藏窗口方式，免弹
  conhost）+ autoLog 落滚动日志文件（不再依赖注册时的 `>>` 重定向）。
- 审计 P2：zcode 恢复行缺 billable/cost 字段；桶键 `|` 分隔符与含 `|` model
  名的往返解析；OpenCode 负 delta 链路；`runtime-config` 的 `INSFORGE_*` env
  名；`init.js` 死常量 `www.tokenusage.cc`。
- apps/web 依赖有 10 条审计通告（1 low / 5 moderate / 2 high / 2 critical），
  属仪表盘侧，另行处理。
