# Third-Party Notices

`tokenusage-cli` 以 MIT 发布，许可正文与版权行见本包 [`LICENSE`](./LICENSE)。

## TokenTracker (upstream)

The `tokenusage` CLI in this package is forked from
[TokenTracker](https://github.com/xiufengsun/TokenTracker) (MIT License,
Copyright (c) xiufengsun). Substantial portions of `src/` originate from the
upstream repository and were then modified for the token-usage contract
(`docs/cli-contract.md` in the repository root). The upstream MIT license text
and copyright notice are preserved in this package's `LICENSE` file.

## juejin-usage (pricing data)

`src/lib/pricing/curated-overrides.json` 中的 volcengine / xiaomi / meta(muse) /
alibaba-cn / moonshotai-cn 五组共 69 条 exact 定价条目（2026-11-03 导入）取自
[juejin-usage](https://github.com/juejin-cn/juejin-usage)（MIT License,
Copyright (c) juejin-cn）commit `f72ca4d` 的 `packages/core/src/pricing/pricing.json`
（models.dev 官方渠道价格集）。juejin-usage 的 MIT 许可要求复制时保留其版权与许可声明：

> MIT License, Copyright (c) 2026 juejin-cn — Permission is hereby granted,
> free of charge, to any person obtaining a copy of this software and
> associated documentation files, to deal in the Software without restriction,
> subject to the condition that the above copyright notice and this permission
> notice shall be included in all copies or substantial portions of the
> Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.

本包其余部分不含其他第三方资产：运行时依赖（如 `undici`）的许可随
`node_modules` 一同分发；品牌图标、字体与定价快照（LiteLLM seed）的登记见仓库根目录的
`THIRD_PARTY_NOTICES.md`。
