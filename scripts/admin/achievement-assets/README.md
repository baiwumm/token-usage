# 成就徽章资产生成（achievement-assets）

重新生成 `apps/web/public/achievements/*.png`（18 张成就徽章插画）的流水线。
**这是离线资产生成脚本，不参与 web 应用构建**（`apps/web` 的 `verify` 不覆盖它）。

## 组成

| 文件 | 说明 |
|---|---|
| `prompts.json` | 风格模板 + 18 条成就的主体描述与点睛色（唯一真源） |
| `generate.mjs` | 出图 → QA → 圆形 alpha 裁切 → 写盘 |

## 依赖

1. **`mmx` CLI**（MiniMax 图像生成，模型 `image-01`）需在 PATH 上并已登录：
   `mmx auth login --api-key sk-xxxxx`（凭据只存在操作者机器的 `~/.mmx/`，不进仓库）。
2. **`jpeg-js` + `pngjs`**：JPEG 解码与 PNG 编码。2026-10-30 经操作者批准，
   已以精确版本加入**仓库根 `package.json` 的 `devDependencies`**
   （`jpeg-js@0.4.4` + `pngjs@7.0.0`）——脚本在仓库根目录下运行，Node 按目录
   向上解析到根 `node_modules`，不是 `apps/web`。二者是离线脚本依赖，不参与
   web 构建、不计入运行时预算（`docs/rewrite-plan.md` §4 已记录）。
   > `sharp` 仍未安装：它只用于把成片量化到 ≤ 30 KB / 张（没有它脚本仍能跑，
   > 成片约 80–110 KB / 张，`--optimize` 自动跳过）。已入库的 18 张是在量化后
   > 的版本；sharp 是原生二进制，确实需要重新量化时再单独申请。

## 用法

```bash
# 全量重生成（会覆盖 apps/web/public/achievements/*.png）
node scripts/admin/achievement-assets/generate.mjs

# 只重生成某几条
node scripts/admin/achievement-assets/generate.mjs --only cachekeeper,fleet

# 同一 subject 换构图：换基准 seed
node scripts/admin/achievement-assets/generate.mjs --only polyglot --seed 52000

# 只做体积收口（不出图，需 sharp）
node scripts/admin/achievement-assets/generate.mjs --optimize-only
```

## 流水线

1. **出图**：`mmx image generate --aspect-ratio 1:1 --seed <seed>`，prompt =
   `主体描述 + 风格模板 + 点睛色`；seed 由成就序号推导，固定可复现。
2. **QA**（不合规就换 seed 重试，最多 4 次）：
   - 画面四边必须是纯黑虚空（边框平均亮度 ≤ 18）；
   - 硬币外接圆必须正圆（宽高差 ≤ 8 % 画幅）、居中（偏移 ≤ 5 %）、占幅 70–95 %。
3. **圆形 alpha 裁切**：以硬币外接圆为圆心做 1px 羽化的圆形蒙版，黑色虚空变透明。
4. **缩放**：盒式滤波降到 256×256，写 `apps/web/public/achievements/<id>.png`
   （RGBA PNG，`deflateLevel: 9`）。
5. **量化（可选）**：装了 `sharp` 时再做一次调色板量化（256 色 + alpha），
   单张落到 17–30 KB；没装就跳过，文件偏大但显示效果一致。

## 已知的风格风险

- 模型偶尔不遵守「纯黑虚空背景」（会画成浅灰影棚背景）→ QA 会拦下并重试。
- 模型偶尔自造外框（深铜铆钉框、深色厚圈）→ 与其他徽章不统一，需要人工挑图或
  追加 seed 后重试。
- 单次生成约 25–40 秒，全量（含重试）约 10–15 分钟。
