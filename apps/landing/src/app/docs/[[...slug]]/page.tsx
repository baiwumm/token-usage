import type { Metadata } from "next";

import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/page";
import { notFound } from "next/navigation";

import { getMDXComponents } from "@/mdx-components";
import {
  docsPageUrl,
  SITE_NAME,
  SITE_OG_IMAGE_ALT,
  SITE_OG_IMAGE_PATH,
  SITE_OG_IMAGE_SIZE,
  SITE_URL,
} from "@/lib/seo";
import { source } from "@/lib/source";

const DOCS_HOME_URL = `${SITE_URL}/docs/`;

/**
 * 文档页结构化数据：正文页用 TechArticle、目录页用 CollectionPage，附带
 * 首页 → 文档 [→ 当前页] 的面包屑。全部从文档源派生，新增 mdx 自动覆盖。
 */
function docsJsonLd(page: {
  description?: string;
  slugs: string[];
  title: string;
}) {
  const url = docsPageUrl(page.slugs);
  const isIndex = page.slugs.length === 0;

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "首页", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "文档", item: DOCS_HOME_URL },
      ...(isIndex
        ? []
        : [
            {
              "@type": "ListItem",
              position: 3,
              name: page.title,
              item: url,
            },
          ]),
    ],
  };

  const main = isIndex
    ? {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: page.title,
        description: page.description,
        url,
        inLanguage: "zh-CN",
        isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
      }
    : {
        "@context": "https://schema.org",
        "@type": "TechArticle",
        headline: page.title,
        description: page.description,
        url,
        mainEntityOfPage: { "@type": "WebPage", "@id": url },
        inLanguage: "zh-CN",
        author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
        publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
        isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
      };

  return [main, breadcrumb];
}

export default async function Page(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await props.params;
  const page = source.getPage(slug);

  if (!page) notFound();

  const MDX = page.data.body;
  const jsonLd = docsJsonLd({ ...page.data, slugs: page.slugs });

  return (
    <>
      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        type="application/ld+json"
      />
      <DocsPage toc={page.data.toc}>
        <DocsTitle>{page.data.title}</DocsTitle>
        {page.data.description ? (
          <DocsDescription>{page.data.description}</DocsDescription>
        ) : null}
        <DocsBody>
          <MDX components={getMDXComponents()} />
        </DocsBody>
      </DocsPage>
    </>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const page = source.getPage(slug);

  if (!page) return {};

  // trailingSlash: true 下 canonical 与产物路径一致（/docs/ 或
  // /docs/<slug>/，index 页的 slug 为空数组，不能拼出 /docs//）。
  const url = docsPageUrl(page.slugs);
  const isIndex = page.slugs.length === 0;

  // 覆盖根布局的 openGraph 会把它自动注入的社交卡一并顶掉，所以这里要
  // 显式带上同一张图（路径/尺寸/alt 与根布局同源，见 lib/seo.ts）。
  const ogImage = {
    url: SITE_OG_IMAGE_PATH,
    width: SITE_OG_IMAGE_SIZE.width,
    height: SITE_OG_IMAGE_SIZE.height,
    alt: SITE_OG_IMAGE_ALT,
    type: "image/png",
  };

  return {
    alternates: { canonical: url },
    description: page.data.description,
    title: page.data.title,
    // 根布局的 Open Graph 指向首页；文档页必须覆盖成自己的标题与 URL，
    // 否则每篇文档的 og:url / og:title 都是首页。
    openGraph: {
      type: isIndex ? "website" : "article",
      siteName: SITE_NAME,
      title: page.data.title,
      description: page.data.description,
      url,
      locale: "zh_CN",
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title: page.data.title,
      description: page.data.description,
      images: [{ url: SITE_OG_IMAGE_PATH, alt: SITE_OG_IMAGE_ALT }],
    },
  };
}
