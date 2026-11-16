// 仓库链接（单一来源）：git URL 取根 package.json 的 repository 字段，
// 对齐 apps/web/src/lib/links.ts 的做法，避免硬编码漂移。

import rootPackage from "../../../../package.json";

const REPOSITORY_URL = rootPackage.repository.url
  .replace(/^git\+/, "")
  .replace(/\.git$/, "");

export const REPO_URL = REPOSITORY_URL;

/** 部署指南在本站文档区的入口（完整规范仍可从文档页跳 GitHub）。 */
export const DEPLOY_GUIDE_URL = "/docs/start/";

export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;

export const THIRD_PARTY_URL = `${REPO_URL}/blob/main/THIRD_PARTY_NOTICES.md`;

export const NPM_CLI_URL = "https://www.npmjs.com/package/tokenusage-cli";
