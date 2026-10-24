"use client";

import {
  BookOpen,
  Display,
  LogoGithub,
  ShieldCheck,
  Wallet,
} from "@gravity-ui/icons";
import { Button, Card, Link } from "@heroui/react";
import { useRouter } from "next/navigation";

import { DEPLOY_GUIDE_URL, GITHUB_URL, LANDING_COPY } from "@/lib/copy/landing";
import { useLocale, type Locale } from "@/lib/copy/locale";

const FEATURE_ICONS = [Display, ShieldCheck, Wallet] as const;

function LocaleSwitcher({
  locale,
  onToggle,
}: {
  locale: Locale;
  onToggle: (next: Locale) => void;
}) {
  return (
    <Button
      aria-label="Switch language"
      size="sm"
      variant="ghost"
      onPress={() => {
        onToggle(locale === "zh" ? "en" : "zh");
      }}
    >
      {locale === "zh" ? "EN" : "中文"}
    </Button>
  );
}

export function Landing() {
  const router = useRouter();
  const [locale, setLocale] = useLocale();
  const copy = LANDING_COPY[locale];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex flex-col">
          <span className="font-semibold">Token Usage</span>
          <span className="text-foreground/50 text-xs">
            {copy.brandTagline}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <LocaleSwitcher locale={locale} onToggle={setLocale} />
          <Button
            size="sm"
            onPress={() => {
              router.push("/login");
            }}
          >
            {copy.login}
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-14 px-6 py-12">
        <section className="flex flex-col items-center gap-5 text-center">
          <h1 className="max-w-2xl text-4xl font-semibold leading-tight md:text-5xl">
            {copy.heroTitle}
          </h1>
          <p className="text-foreground/60 max-w-2xl text-base leading-relaxed">
            {copy.heroSubtitle}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              size="lg"
              onPress={() => {
                router.push("/login");
              }}
            >
              {copy.heroCta}
            </Button>
            <Link href={GITHUB_URL} rel="noopener noreferrer" target="_blank">
              <LogoGithub className="size-4" />
              {copy.github}
            </Link>
            <Link
              href={DEPLOY_GUIDE_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              <BookOpen className="size-4" />
              {copy.deployGuide}
            </Link>
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <h2 className="text-foreground/60 text-center text-sm tracking-wide uppercase">
            {copy.featuresHeading}
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {copy.features.map((feature, index) => {
              const Icon = FEATURE_ICONS[index] ?? Display;

              return (
                <Card key={feature.title} className="flex-col gap-3 p-6">
                  <Icon aria-hidden="true" className="text-primary size-6" />
                  <h3 className="font-medium">{feature.title}</h3>
                  <p className="text-foreground/60 text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </Card>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="border-default-100 flex items-center justify-between border-t px-6 py-4 text-foreground/40 text-xs">
        <span>{copy.footerNote}</span>
        <div className="flex items-center gap-4">
          <Link href={GITHUB_URL} rel="noopener noreferrer" target="_blank">
            {copy.github}
          </Link>
          <span>{copy.footerLicense}</span>
        </div>
      </footer>
    </div>
  );
}
