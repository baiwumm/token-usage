const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { resolveTraeDbPaths } = require("../src/lib/trae-db");

function makeStoreDb(parent, module = "ai-agent") {
  const dir = path.join(parent, "ModularData", module);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "database.db");
  fs.writeFileSync(file, "");
  return file;
}

test("resolveTraeDbPaths discovers the international, SOLO, and CN stores on win32", (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "trae-db-home-"));
  const appdata = fs.mkdtempSync(path.join(os.tmpdir(), "trae-db-app-"));
  t.after(() => {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(appdata, { recursive: true, force: true });
  });
  const international = makeStoreDb(path.join(appdata, "Trae"));
  const solo = makeStoreDb(path.join(appdata, "TRAE SOLO"));
  const cn = makeStoreDb(path.join(appdata, "Trae CN"));

  const paths = resolveTraeDbPaths({ APPDATA: appdata }, { platform: "win32", home });

  assert.deepEqual(paths, [international, solo, cn]);
});

test("resolveTraeDbPaths prefers the ai-agent module over ai-chat", (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "trae-db-home-"));
  const appdata = fs.mkdtempSync(path.join(os.tmpdir(), "trae-db-app-"));
  t.after(() => {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(appdata, { recursive: true, force: true });
  });
  makeStoreDb(path.join(appdata, "Trae CN"), "ai-chat");
  const agent = makeStoreDb(path.join(appdata, "Trae CN"), "ai-agent");

  const paths = resolveTraeDbPaths({ APPDATA: appdata }, { platform: "win32", home });

  assert.deepEqual(paths, [agent]);
});

test("resolveTraeDbPaths discovers the CN store on darwin", (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "trae-db-home-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const cn = makeStoreDb(path.join(home, "Library", "Application Support", "Trae CN"));

  const paths = resolveTraeDbPaths({}, { platform: "darwin", home });

  assert.deepEqual(paths, [cn]);
});

test("resolveTraeDbPaths honors an explicit DB override over discovery", () => {
  const override = path.join(os.tmpdir(), "trae-db-explicit", "database.db");

  const paths = resolveTraeDbPaths(
    { TOKENUSAGE_TRAE_DB: override },
    { platform: "win32", home: os.tmpdir() },
  );

  assert.deepEqual(paths, [path.resolve(override)]);
});
