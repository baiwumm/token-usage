import { loader } from "fumadocs-core/source";

import { docs } from "../../.source/server";

// 文档路由源：/docs 下单层 slug（一篇文档一页），静态导出期由
// generateStaticParams 枚举。
export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
});
