// 仓库链接（单一来源）：git URL 取根 package.json 的 repository 字段，
// 对齐 apps/web/src/lib/links.ts 的做法，避免硬编码漂移。

import rootPackage from "../../../../package.json";

const REPOSITORY_URL = rootPackage.repository.url
  .replace(/^git\+/, "")
  .replace(/\.git$/, "");

export const REPO_URL = REPOSITORY_URL;

export const DEPLOY_GUIDE_URL = `${REPO_URL}/blob/main/docs/deploy-guide.md`;

export const CLI_CONTRACT_URL = `${REPO_URL}/blob/main/docs/cli-contract.md`;

export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;

export const THIRD_PARTY_URL = `${REPO_URL}/blob/main/THIRD_PARTY_NOTICES.md`;

export const NPM_CLI_URL = "https://www.npmjs.com/package/tokenusage-cli";

/** 根 README 的 Deploy to Vercel 按钮同款链接（一键克隆部署）。 */
export const VERCEL_DEPLOY_URL =
  "https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbaiwumm%2Ftoken-usage&project-name=token-usage&repository-name=token-usage";
