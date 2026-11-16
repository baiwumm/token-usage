import { defineDocs, defineConfig } from "fumadocs-mdx/config";

// 文档内容真源就是本目录 src/content/docs/（提交进仓库，本站自建精编内容，
// 面向读者；仓库根 docs/ 面向开发者与 AI Agent，两者解耦——同
// better-admin/apps/website 的结论）。直接改 mdx，fumadocs-mdx 构建期编译。
export const docs = defineDocs({
  dir: "src/content/docs",
});

export default defineConfig();
