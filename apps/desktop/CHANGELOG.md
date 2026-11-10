# Changelog

桌面端（`apps/desktop`，Windows NSIS 安装包 + tauri updater）的用户可见变更记录。
发版时在顶部新增一节，`## <版本号>` 行会被 release workflow 取作 GitHub Release
正文。

## 0.1.0

2026-11-10。首个 Windows 安装包发布。托盘伴生监控台：本机采集视角的今日/近 7 天
tokens、来源构成、同步状态与队列积压；一键同步 / Doctor / 对账 / 暂停恢复；配对
向导；每日汇总与故障提醒通知、免打扰时段；开机自启、单实例、浅/深/系统三态主题。
内置自动更新（Ed25519 签名校验，GitHub Releases 分发）。
