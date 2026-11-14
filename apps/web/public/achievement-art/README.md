# 成就徽章插画（achievement artwork）

本目录是 `apps/web/public/achievement-art/`，对外 URL 前缀 `/achievement-art/`。
**不要再改回 `/achievements/`**：那是需要登录的成就页路由，`src/proxy.ts` 的页面守卫
会把匿名请求的静态资源一并 307 到 `/login`，公开页 `/u/<token>` 的徽章会静默降级成
参数化 SVG 兜底图。守卫测试 `tests/unit/achievements-catalog.test.ts` 锁定这条约束。

每条成就一张 256×256 PNG 透明徽章（调色板量化，17–30 KB / 张，共 20 张），
文件名为成就 id（与 `apps/web/src/lib/achievements/catalog.ts` 的 `ACHIEVEMENTS[].id`
一一对应）：

```
token_titan.png  wordsmith.png  cachekeeper.png  veteran.png
big_day.png     cache_alchemy.png  marathon_session.png  model_symphony.png
streak.png      marathoner.png  weekend_warrior.png  night_owl.png
polyglot.png    multitool.png  project_hopper.png  project_devotion.png
fleet.png       sync_diligence.png  early_bird.png  biggest_session.png
```

## 来源与授权

- **自有生成**：由 `scripts/admin/achievement-assets/generate.mjs` 调用 MiniMax
  `image-01` 按统一风格模板出图（浮雕硬币徽章 + 纯黑虚空背景），再由脚本做圆形
  alpha 裁切与 256px 缩放。prompt 模板与逐条主体描述见
  `scripts/admin/achievement-assets/prompts.json`。
- 随项目一起以根 `LICENSE`（MIT）发布；**不含任何上游仓库（TokenTracker）的素材**，
  也未复用其代码。
- 资产本身与段位无关：铜 / 银 / 金 / 钻 / 王者五档由 UI 叠加的金属外环表达，
  同一张图复用五档。

## 使用约定

- 徽章是**装饰性插画**，不承载唯一信息：段位同时以文字显示（`achievements.tier.*`），
  锁定态灰化 + 锁标，颜色不是唯一信息通道。
- 加载失败时必须回退到 `apps/web/src/components/achievements/achievement-art.tsx`
  的参数化 SVG 徽章（`<img onError>` 切换 + 挂载后检查 `naturalWidth`，覆盖 SSR 首屏就
  404 的情况），页面不得出现空徽章位。
- 段位由 UI 叠加的金属外环表达（`achievement-medallion.tsx`，外环占直径 6 %）；插画是满幅
  圆盘，展示时在圆框内放大 1.0526 倍（裁 5 % 直径），避免自带最外圈与外环叠成「双环」。
- 建议 `<img loading="lazy" decoding="async">`；不要给徽章加 `width/height` 之外的
  布局依赖，避免 CLS。
