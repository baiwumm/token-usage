# Changelog

本包（`tokenusage-cli`）的用户可见变更记录。发版时在顶部新增一节，
`## <版本号>` 行会被 release workflow 取作 GitHub Release 正文。

## 0.1.0

首个公开发布版本：TokenTracker CLI 采集端 fork，重接到 token-usage 契约
（`docs/cli-contract.md`）。

- 设备流配对（`device-login`）、`init`、`sync`（含 `--watch` / `--drain`）、
  `status`、`sessions`、`doctor`、`diagnostics`、`uninstall`
- 会话上传走隐私白名单：只传聚合 token 数字，标题 / 路径 / 正文永不出本机
- 上传链路防毒行硬化：契约非法的用量桶 / 账户会话状态在出批前丢弃或修正，
  而不是让 ingest 边缘整批 400、队头永久停摆；Grok ACP 小数计数器解析期取整；
  会话 ID 校验对齐服务端的完整 Unicode Cc 控制字符范围
- 请求日志降噪：`node:sqlite` 每次加载都打印的 ExperimentalWarning 不再
  混入重定向的同步日志
- 要求 Node ≥ 22.19（undici 8 的引擎下限；undici 仅用于代理支持）
