# tokenusage-cli

自托管 AI 编码 token 用量采集器，为 [token-usage](https://github.com/baiwumm/token-usage)（自托管仪表盘）上报数据。fork 自 [TokenTracker](https://github.com/xiufengsun/TokenTracker)（MIT，见 `LICENSE` 与 `THIRD_PARTY_NOTICES.md`），指向 token-usage 契约（`docs/cli-contract.md`）。

## 命令

| 命令 | 说明 |
|---|---|
| `tokenusage init` | 本地初始化（扫描根、各工具 hook 安装）。配对见 `device-login` |
| `tokenusage device-login` | 设备流配对：输出 `user_code`，在站点 `/device` 页批准后本机拿到设备令牌 |
| `tokenusage sync` | 解析本地 AI 工具日志 → 上报小时桶 + 会话元数据 |
| `tokenusage sync --watch` | 常驻模式，默认每 15 分钟增量一轮（`--interval <ms>` 可调，≥60000） |
| `tokenusage sync --no-sessions` | 只上报小时桶，跳过会话元数据 |
| `tokenusage status` / `doctor` / `diagnostics` | 状态与体检 |
| `tokenusage sessions` | 本地导出会话分析（元数据级，JSON/CSV） |
| `tokenusage uninstall [--purge]` | 卸载钩子与数据 |

配置优先级：CLI 参数 > `~/.tokenusage/.../config.json` > 环境变量（`TOKENUSAGE_BASE_URL` 等）> 内置默认（生产站点 + 其公开 publishable key）。

## 隐私边界

上报内容只有**聚合用量**：

- 小时桶：每工具每小时六项 token 计数与模型名。
- 会话元数据：`session_id`（厂商会话 UUID）、来源、起止时间、项目 basename、token 拆分、每模型用量。

**永不上传**：prompt / 助手正文 / 工具参数 / 命令输出 / diff / 会话标题 / 本地绝对路径 / resume 命令。测试（`test/session-upload.test.js`）用字段白名单锁定该边界。

## 数据目录

`~/.tokenusage/`（`0700` 目录 + `0600` 文件）：上传队列、会话分析 sidecar、`session-upload-watermarks.json`（增量水位）。与旧版 tokentracker CLI 的 `~/.tokentracker/` 互不干扰，迁移期两套 CLI 可在同一台机器共存。

## provider 支持面

解析器随上游全量保留（仅未配置对应工具时休眠不扫描）：claude、codex、zcode、opencode、cursor、trae / trae-cn、grok、kimi、gemini、qoder、antigravity、openclaw 等。操作者实际启用面以 `tokenusage status` 为准；未使用的解析器不产生任何上传。

注：`cursor` / `trae-cn` 为账户级来源，会话元数据不会为其上传（服务端契约亦整段跳过）。

## 开发

```bash
pnpm install            # 仓库根
pnpm --filter tokenusage-cli test
```

发布（npm）是操作者动作，本包 `private: true`。
