// /llms.txt（llmstxt.org 约定）：给 LLM / Agent 的站点索引。构建期静态
// 生成，链接与描述全部从文档源派生——新增 mdx 不会漏，也不会和真实 slug
// 漂移。静态导出下必须显式 force-static。
//
// 只收录「值得给模型看」的入口：首页 + 全部文档页 + 仓库/npm。页面内的
// 营销段落不重复，避免索引随文案变动。

import { docsPageUrl, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo";
import { NPM_CLI_URL, REPO_URL } from "@/lib/repo-links";
import { source } from "@/lib/source";

export const dynamic = "force-static";

export function GET() {
  const docs = source.getPages().map((page) => {
    const description = page.data.description
      ? `: ${page.data.description}`
      : "";

    return `- [${page.data.title}](${docsPageUrl(page.slugs)})${description}`;
  });

  const body = [
    `# ${SITE_NAME}`,
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    "## Docs",
    ...docs,
    "",
    "## Links",
    `- [首页](${SITE_URL}/)`,
    `- [GitHub](${REPO_URL})`,
    `- [npm](${NPM_CLI_URL})`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
