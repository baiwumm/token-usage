// Assemble the tauri updater manifest (latest.json) from a finished NSIS
// bundle. The installer asset is copied to a space-free release name (the
// productName contains a space; download URLs keep it simple without %20),
// the Ed25519 signature is inlined into the manifest, and the URL points at
// the release asset uploaded in the same workflow run. The manifest only
// resolves once the draft release is published — until then installed apps
// keep their current version.
//
// Usage: node assemble-updater-manifest.mjs <nsis-bundle-dir> <version> <tag>

import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [dir, version, tag] = process.argv.slice(2);

if (!dir || !version || !tag) {
  console.error("usage: assemble-updater-manifest.mjs <nsis-bundle-dir> <version> <tag>");
  process.exit(1);
}
if (!existsSync(dir)) {
  console.error(`bundle dir missing: ${dir}`);
  process.exit(1);
}

const installer = readdirSync(dir).find((file) => file.endsWith("-setup.exe"));
if (!installer) {
  console.error(`no *-setup.exe in ${dir}`);
  process.exit(1);
}
const sigPath = join(dir, `${installer}.sig`);
if (!existsSync(sigPath)) {
  console.error(`updater signature missing: ${sigPath} (createUpdaterArtifacts enabled?)`);
  process.exit(1);
}

const releaseName = `token-usage-desktop_${version}_x64-setup.exe`;
copyFileSync(join(dir, installer), join(dir, releaseName));

const manifest = {
  version,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature: readFileSync(sigPath, "utf8").trim(),
      url: `https://github.com/baiwumm/token-usage/releases/download/${tag}/${releaseName}`,
    },
  },
};

const out = join(dir, "latest.json");
writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`latest.json written: ${out}`);
console.log(`release asset: ${releaseName}`);
