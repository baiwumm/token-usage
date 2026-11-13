# CLI 发版手册

npm 包 `tokenusage-cli`（命令 `tokenusage`）的发布流程。机制由
`.github/workflows/release-cli.yml` 承载：`cli-v*` tag 触发 → tag 与
`packages/cli/package.json` 版本强校验且必须落在 main 上 → `pnpm verify` →
`npm publish --provenance`（Trusted Publishing，OIDC 免 token）→ 从
`packages/cli/CHANGELOG.md` 取本版本段落生成 GitHub Release。

版本真源是 `packages/cli/package.json`，变更说明看 `packages/cli/CHANGELOG.md`；历次发版与
采集机验收记录见 `docs/archive/cli-releases.md`。

## 日常发版（全自动）

1. 改 `packages/cli/package.json` 的 `version`，并在 `packages/cli/CHANGELOG.md` 顶部补一节
   `## X.Y.Z`（release notes 的来源，缺了会退回自动生成）。
2. 安全审计：`pnpm audit --prod --registry=https://registry.npmjs.org` 应为
   "No known vulnerabilities found"。npmmirror 没有 audit 端点（报 404 而非漏洞），必须显式带
   官方 registry 参数。
3. 提交并推送 main，确认 CI 绿。
4. 打 annotated tag 并推送：
   `git tag -a cli-vX.Y.Z -m "tokenusage-cli X.Y.Z" && git push origin cli-vX.Y.Z`。
   tag 必须打在**已推送**的 main 提交上——打在旧提交上不会触发任何东西且无报错。
5. workflow 自动完成：版本校验 → main 祖先校验 → `pnpm verify` → 发包 → Release。
6. 纪律：run 结束前不要 rebase / 强推 main——重写历史会让 tag 脱离 main，发布被安全拒绝（只会
   发不出去，不会发错）。

## 发版后检查

- `npm view tokenusage-cli version` 与 `dist-tags.latest` 指向新版本，包页带 provenance 徽章；
- GitHub Release 正文取自 CHANGELOG；
- 镜像同步：`curl https://registry.npmmirror.com/tokenusage-cli/latest` 确认 npmmirror 已跟进，
  再让采集机升级（Volta 调用 npm 时用机器默认源，`--registry` 不生效，镜像未同步会报 `ETARGET`）；
- 采集机升级后跑 `tokenusage init --yes --no-integrations --no-open` 刷新运行时副本，再
  `tokenusage doctor`（应全 OK）与 `tokenusage reconcile --days 7`（应 OK 且退出码 0）。

## 首次发布与 Trusted Publishing（已完成，留档备查）

首发走手动 publish，并把 npm 包页的 **Trusted Publisher** 指向本仓库：

> npmjs.com → tokenusage-cli 包页 → Settings → Trusted Publisher → Repository
> `baiwumm/token-usage`、Workflow filename `release-cli.yml`、Environment 留空、
> Allowed actions 勾 `Allow npm publish`（`Allow npm dist-tag` 不勾，用不到）。

手动发布要点：默认源是镜像的机器必须显式 `--registry=https://registry.npmjs.org`；浏览器
passkey 登录在受限网络下会卡住，可改用
`npm login --registry=https://registry.npmjs.org --auth-type=legacy`（输入 Username / Password /
OTP）。手动发布的版本没有 provenance 徽章，CI 发布自带。

## 回滚

误发版本用 `npm deprecate tokenusage-cli@X.Y.Z "reason"` 并发 patch 版；确需下架走 npm 支持
（unpublish 有 72h 限制），GitHub Release 手动删除。
