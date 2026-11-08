"use client";

// 自部署段（设计定稿 07 段）：三步摘要 + Deploy to Vercel 一键按钮
// （README 同款链接）+ 部署指南外链。部署动作本身在 Vercel 完成。

import { ArrowUpRight } from "@gravity-ui/icons";
import { Button, Typography } from "@heroui/react";

import { SectionHeader } from "./section-header";

import { LANDING_COPY } from "@/lib/copy";
import {
  DEPLOY_GUIDE_URL,
  REPO_URL,
  VERCEL_DEPLOY_URL,
} from "@/lib/repo-links";

export function Deploy() {
  const copy = LANDING_COPY.zh;

  return (
    <section className="border-t border-default/50" id="deploy">
      <div className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-24">
        <SectionHeader
          eyebrow={copy.deploy.eyebrow}
          sub={copy.deploy.sub}
          title={copy.deploy.title}
        />

        <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-3">
          {copy.deploy.steps.map((step, index) => (
            <div
              key={step.title}
              className="flex flex-col gap-2.5 border-t border-default/50 pt-6"
            >
              <Typography
                className="font-mono text-xs text-accent"
                weight="semibold"
              >
                {String(index + 1).padStart(2, "0")}
              </Typography>
              <Typography type="body-sm" weight="semibold">
                {step.title}
              </Typography>
              <Typography color="muted" type="body-xs">
                {step.body}
              </Typography>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            variant="primary"
            onPress={() =>
              window.open(VERCEL_DEPLOY_URL, "_blank", "noopener,noreferrer")
            }
          >
            {copy.deploy.primaryCta}
            <ArrowUpRight className="size-4" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            onPress={() =>
              window.open(DEPLOY_GUIDE_URL, "_blank", "noopener,noreferrer")
            }
          >
            {copy.deploy.guideCta}
          </Button>
          <Button
            size="lg"
            variant="ghost"
            onPress={() =>
              window.open(REPO_URL, "_blank", "noopener,noreferrer")
            }
          >
            {copy.deploy.githubCta}
          </Button>
        </div>
      </div>
    </section>
  );
}
