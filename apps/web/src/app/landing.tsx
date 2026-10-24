"use client";

import {
  BookOpen,
  Display,
  LogoGithub,
  ShieldCheck,
  Wallet,
} from "@gravity-ui/icons";
import { Button, Card, Link, Typography } from "@heroui/react";
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
          <Typography type="body" weight="semibold">
            Token Usage
          </Typography>
          <Typography color="muted" type="body-xs">
            {copy.brandTagline}
          </Typography>
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
          <Typography className="max-w-2xl leading-tight" type="h1">
            {copy.heroTitle}
          </Typography>
          <Typography className="max-w-2xl leading-relaxed" color="muted">
            {copy.heroSubtitle}
          </Typography>
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
          <Typography
            className="text-center tracking-wide uppercase"
            color="muted"
            type="body-sm"
          >
            {copy.featuresHeading}
          </Typography>
          <div className="grid gap-4 md:grid-cols-3">
            {copy.features.map((feature, index) => {
              const Icon = FEATURE_ICONS[index] ?? Display;

              return (
                <Card key={feature.title} className="p-6">
                  <Icon aria-hidden="true" className="text-primary size-6" />
                  <Card.Header>
                    <Card.Title>{feature.title}</Card.Title>
                    <Card.Description>{feature.description}</Card.Description>
                  </Card.Header>
                </Card>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="border-default-100 flex items-center justify-between border-t px-6 py-4">
        <Typography color="muted" type="body-xs">
          {copy.footerNote}
        </Typography>
        <div className="flex items-center gap-4">
          <Link href={GITHUB_URL} rel="noopener noreferrer" target="_blank">
            {copy.github}
          </Link>
          <Typography color="muted" type="body-xs">
            {copy.footerLicense}
          </Typography>
        </div>
      </footer>
    </div>
  );
}
