# Third-Party Notices

Token Usage 以 MIT 发布，许可正文与版权行见 [`LICENSE`](./LICENSE)（其中
「Contains code derived from TokenTracker by xiufengsun (MIT)」是上游代码的衍生声明）。
本文件登记仓库内其余第三方资产的来源与许可；品牌名、标识与商标归各自权利人所有。

## 上游 TokenTracker（CLI 代码来源）

CLI 采集端 [`packages/cli/`](./packages/cli/) 由 [TokenTracker](https://github.com/xiufengsun/TokenTracker)
（MIT，Copyright (c) xiufengsun）fork 并改造：会话解析器、各工具 hook 集成与上传骨架沿用上游，
上报目标与契约换成本仓库的 `docs/cli-contract.md`。包内随附独立登记的
[`packages/cli/LICENSE`](./packages/cli/LICENSE) 与
[`packages/cli/THIRD_PARTY_NOTICES.md`](./packages/cli/THIRD_PARTY_NOTICES.md)。
本项目是独立社区维护的版本，与上游无隶属或背书关系。

## Provider 品牌图标

`apps/web/public/brand-logos/` 下的图标用于标识用量来源对应的 AI 编码工具（Anthropic Claude
Code、OpenAI Codex/ChatGPT、Cursor、GitHub Copilot、Google Gemini、DeepSeek、Moonshot Kimi、
xAI Grok、TRAE、Zed、Qoder、Kiro 等）。名称与图形是各厂商的商标，此处仅作来源指示
（nominative use），不代表任何隶属或背书关系。

其中多数图标沿用上游 TokenTracker（MIT）随包的品牌资产，补充图标（如 `workbuddy.svg`）
取自 juejin-usage（MIT）；暗色变体（`*-dark.*`）沿用同一套资产并重着色为 `currentColor`
以便跟随主题。新增或替换图标时，请在此登记来源。

## Maple Mono CN 字体

`apps/web/public/fonts/maple-mono-cn-regular.woff2` 是
[Maple Mono](https://github.com/subframe7536/maple-font) v7.9 的子集（GB2312 常用汉字 + ASCII
+ CJK 标点，6,893 字形），按 SIL Open Font License 1.1（OFL-1.1）自托管分发；子集化与
`unicode-range` 配置见 `apps/web/src/styles/globals.css`。OFL 允许随产品打包与子集化，字体
本身不单独售卖。

## 定价数据

`apps/web/src/lib/pricing/seed-snapshot.json` 是 vendored 的
[LiteLLM](https://github.com/BerriAI/litellm)（MIT）公开价格快照，仅用于本地成本估算；
`curated-overrides.json` / `selfhost-overrides.json` 是人工校准值，来源在各条 `note` 中注明。
价格仅供估算，请以厂商账单为准。

## 设计参考

热力图、来源分布卡片、来源 id 归一化与图表调色板数值参考了 juejin-usage（MIT）。
