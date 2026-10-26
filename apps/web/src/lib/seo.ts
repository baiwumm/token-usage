import type { Metadata } from "next";

import { cookies, headers } from "next/headers";
import { cache } from "react";

import {
  LOCALE_COOKIE,
  resolveLocale,
  type Locale,
} from "@/lib/copy/locale-config";
import {
  PAGE_SEO_COPY,
  SITE_SEO_COPY,
  type PageSeoKey,
} from "@/lib/copy/metadata";

const FALLBACK_SITE_NAME = "TokenUsage";
const FALLBACK_SITE_URL = "http://localhost:3000";
const OG_IMAGE_PATH = "/web-app-manifest-512x512.png";

/**
 * Product name used in page titles (`<page> - <siteName>`) and the Apple web
 * app title. Deployments can rebrand without editing source.
 */
export const siteName =
  process.env.TOKEN_USAGE_SITE_NAME?.trim() || FALLBACK_SITE_NAME;

function resolveSiteUrl(value: string | undefined): URL {
  try {
    return new URL(value?.trim() || FALLBACK_SITE_URL);
  } catch {
    return new URL(FALLBACK_SITE_URL);
  }
}

export const siteUrl = resolveSiteUrl(process.env.TOKEN_USAGE_DASHBOARD_URL);

/**
 * Effective locale for the current request. `cache` keeps the cookie/header
 * reads shared between the root layout and page-level generateMetadata.
 */
export const resolveRequestLocale = cache(async (): Promise<Locale> => {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);

  return resolveLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    headerStore.get("accept-language"),
  );
});

function openGraphLocale(locale: Locale): string {
  return locale === "zh" ? "zh_CN" : "en_US";
}

function alternateOpenGraphLocale(locale: Locale): string {
  return locale === "zh" ? "en_US" : "zh_CN";
}

export function createSiteMetadata(locale: Locale): Metadata {
  const copy = SITE_SEO_COPY[locale];

  return {
    metadataBase: siteUrl,
    applicationName: siteName,
    title: {
      default: siteName,
      template: `%s - ${siteName}`,
    },
    description: copy.description,
    keywords: copy.keywords,
    authors: [{ name: siteName }],
    creator: siteName,
    publisher: siteName,
    category: "technology",
    robots: {
      index: true,
      follow: true,
    },
    appleWebApp: {
      title: siteName,
    },
    openGraph: {
      type: "website",
      siteName,
      title: siteName,
      description: copy.description,
      url: "/",
      locale: openGraphLocale(locale),
      alternateLocale: [alternateOpenGraphLocale(locale)],
      images: [
        {
          url: OG_IMAGE_PATH,
          width: 512,
          height: 512,
          alt: siteName,
        },
      ],
    },
    twitter: {
      card: "summary",
      title: siteName,
      description: copy.description,
      images: [OG_IMAGE_PATH],
    },
  };
}

export interface PageMetadataOptions {
  key: PageSeoKey;
  path: string;
  locale: Locale;
}

/**
 * Shared page-level SEO fields. Titles are emitted absolute because
 * `title.template` from the root layout does not apply to a `title` set in the
 * root segment's own `page.js` (Next docs, generate-metadata); `absolute`
 * bypasses the template for every route identically. Canonical and Open Graph
 * URLs are relative to `metadataBase` in the root layout.
 */
export function createPageMetadata({
  key,
  path,
  locale,
}: PageMetadataOptions): Metadata {
  const copy = PAGE_SEO_COPY[locale][key];
  const fullTitle = `${copy.title} - ${siteName}`;

  return {
    title: { absolute: fullTitle },
    description: copy.description,
    alternates: {
      canonical: path,
    },
    openGraph: {
      type: "website",
      siteName,
      title: fullTitle,
      description: copy.description,
      url: path,
      locale: openGraphLocale(locale),
      alternateLocale: [alternateOpenGraphLocale(locale)],
      images: [
        {
          url: OG_IMAGE_PATH,
          width: 512,
          height: 512,
          alt: siteName,
        },
      ],
    },
    twitter: {
      card: "summary",
      title: fullTitle,
      description: copy.description,
      images: [OG_IMAGE_PATH],
    },
  };
}
