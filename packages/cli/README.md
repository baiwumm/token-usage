# tokenusage-cli

自托管 AI 编码 token 用量采集器，为 [token-usage](https://github.com/baiwumm/token-usage)（自托管仪表盘）上报数据。fork 自 [TokenTracker](https://github.com/xiufengsun/TokenTracker)（MIT，见 `LICENSE` 与 `THIRD_PARTY_NOTICES.md`），指向 token-usage 契约（`docs/cli-contract.md`）。

## 快速开始（三步）

```bash
# 1) 初始化本地扫描（配置扫描根、安装各工具的用量 hook）
tokenusage init

# 2) 配对：输出一个 user_code，浏览器打开提示的链接批准
tokenusage device-login
#    → https://<你的站点>/device?user_code=XXXX-XXXX
#    → 批准后本机自动拿到设备令牌（码 15 分钟内有效）

# 3) 上报
tokenusage sync            # 手动一轮：解析 → 入队 → 上传
tokenusage sync --drain    # 首次/积压补传（更大的批处理预算）
```

完成。之后随时跑 `tokenusage sync`，或用 `--watch` 常驻自动上报（见下）。

**谁批准配对？** 批准者就是配对时登录站点的那个账号——设备与其全部数据绑定到该账号，账号之间数据完全隔离。自托管用户批准自己的设备即可；站点管理员不需要、也无法替别人审批。陌生人可以对公开站点发起配对码，但没有账号就批不了（注册邀请制 / `token_allowed_emails` 白名单），码 15 分钟自动过期。

## 命令

| 命令 | 说明 |
|---|---|
| `tokenusage init` | 本地初始化（扫描根配置、各工具 hook 安装）。不含配对 |
| `tokenusage device-login` | 设备流配对：输出 `user_code`，在站点 `/device` 页批准后本机拿到设备令牌 |
| `tokenusage sync` | 解析本地 AI 工具日志 → 上报小时桶 + 会话元数据 |
| `tokenusage sync --watch` | 常驻模式，默认每 15 分钟增量一轮（`--interval <ms>` 可调，≥60000） |
| `tokenusage sync --no-sessions` | 只上报小时桶，跳过会话元数据 |
| `tokenusage sync --drain` | 补传模式：更大的批处理预算，适合首次接入/长期积压 |
| `tokenusage status` | 本地状态：Base URL、令牌、队列积压、最近解析/上传时间 |
| `tokenusage doctor` | 体检（运行时 / 网络 / 各工具配置），`--json` 输出 |
| `tokenusage diagnostics` | 诊断信息导出 |
| `tokenusage sessions` | 本地导出会话分析（JSON/CSV，元数据级） |
| `tokenusage uninstall [--purge]` | 移除 hook；`--purge` 连数据目录一起删 |

配置优先级：CLI 参数 > `~/.tokenusage/.../config.json` > 环境变量（`TOKENUSAGE_BASE_URL` 等）> 内置默认（你的部署地址 + 其公开 publishable key）。

## `sync --watch`：常驻自动上报

```bash
tokenusage sync --watch                          # 默认每 15 分钟一轮
tokenusage sync --watch --interval 300000        # 每 5 分钟一轮
tokenusage sync --watch --interval 3600000 --no-sessions   # 每小时，只传小时桶
```

- `--interval` 毫秒，最小 60000（小于该值回落到默认 15 分钟——每轮至少要跑一次本地扫描，过密无意义）。
- **停止**：在运行的终端 Ctrl+C 即可；`--watch` 只是前台进程，不注册任何系统计划任务/守护。随时终止都安全——队列与水位都已落盘，下次 `sync` 从断点继续。
- 每轮增量：首轮解析全部历史日志（可能较慢），之后只重扫有变化的文件；上报侧队列 offset + 会话水位双断点，多轮之间不重不漏。

## 未配对时会发生什么

CLI 未配对也能正常用，只是**降级为“只采集、不上报”**：

- `sync` 照常解析并入队，上传步骤提示 `skipped (no device token)`；数据留在本地队列，**不会丢**——配对后下一次 `sync --drain` 自动补传全部积压。
- `sync --auto`（hook 触发的静默档）静默等待令牌，按重试调度挂起。
- `status` / `doctor` 正常运行，令牌缺失显示为 warn。
- 服务端零暴露：没有配对令牌的请求一律 `401`，未配对机器读不到任何数据。

所以先装 CLI、后配站点（甚至先本地攒数据）是合法路径；配对完成那一刻，积压数据自动补传。

## 隐私边界

上报内容只有**聚合用量**：

- 小时桶：每工具每小时六项 token 计数与模型名。
- 会话元数据：`session_id`（厂商会话 UUID，或无 UUID 来源的本地稳定指纹）、来源、起止时间、项目 basename、token 拆分、每模型用量。

**永不上传**：prompt / 助手正文 / 工具参数 / 命令输出 / diff / 会话标题 / 本地绝对路径 / resume 命令。测试（`test/session-upload.test.js`）用字段白名单锁定该边界。

## 数据目录

`~/.tokenusage/`（`0700` 目录 + `0600` 文件）：上传队列（`queue.jsonl` + offset）、会话分析 sidecar、`session-upload-watermarks.json`（增量水位）。与旧版 tokentracker CLI 的 `~/.tokentracker/` 互不干扰，迁移期两套 CLI 可在同一台机器共存。

## provider 支持面

解析器随上游全量保留（仅未配置对应工具时休眠不扫描）：claude、codex、zcode、opencode、cursor、trae / trae-cn、grok、kimi、gemini、qoder、antigravity、openclaw 等。操作者实际启用面以 `tokenusage status` 为准；未使用的解析器不产生任何上传。

注：`cursor` / `trae-cn` 为账户级来源，会话元数据不会为其上传（服务端契约亦整段跳过）。

## 开发

```bash
pnpm install            # 仓库根
pnpm --filter tokenusage-cli test
```

发布（npm）是操作者动作，本包 `private: true`。
