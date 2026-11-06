// Public repository links (single source). The git URL lives in the repo's
// package.json `repository` field; every UI link is derived from it so the
// links can never drift from the repo metadata. The URL used to be hardcoded
// in each of the consuming files.
//
// Upstream attribution stays out of these links and lives only in the LICENSE /
// THIRD_PARTY_NOTICES files (AGENTS.md rule 10).

import rootPackage from "../../../../package.json";

/** npm stores the git form (`git+https://… .git`); strip it to a web URL. */
const REPOSITORY_URL = rootPackage.repository.url
  .replace(/^git\+/, "")
  .replace(/\.git$/, "");

export const REPO_URL = REPOSITORY_URL;

export const README_URL = `${REPO_URL}#readme`;
