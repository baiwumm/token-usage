// Throwaway helper (deleted after use): moves a contiguous block of top-level
// functions out of commands/sync.js into src/repairs/<name>.js, emitting the
// requires the block actually needs and the exports sync.js still references.
//
// Unlike the throwaway that produced the earlier batch, this one:
//  * keeps destructured bindings destructured (never `const ensureDir = require(..)`),
//  * never emits a require back into src/repairs,
//  * preserves sync.js line endings,
//  * reports names the block uses that it cannot resolve, so nothing is guessed.
const fs = require("fs");

const [moduleName, fromMarker, toMarker, ...headerLines] = process.argv.slice(2);
if (!moduleName || !fromMarker || !toMarker) {
  console.error("usage: node .tmp-move.js <module> <fromMarker> <toMarker> [header lines...]");
  process.exit(2);
}

const syncFile = "src/commands/sync.js";
const raw = fs.readFileSync(syncFile, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
const lines = raw.split(/\r?\n/);

const start = lines.findIndex((l) => l.startsWith(fromMarker));
const end = lines.findIndex((l, i) => i > start && l.startsWith(toMarker));
if (start < 0 || end < 0 || end <= start) throw new Error(`markers: ${start}/${end}`);
const body = lines.slice(start, end).join("\n").replace(/\s+$/, "");

// name -> { path, kind } for every top-level require in sync.js
const bindings = new Map();
for (const m of raw.replace(/\r/g, "").matchAll(/(?:const|let)\s+(\{[^}]*\}|[A-Za-z_$][\w$]*)\s*=\s*require\(["']([^"']+)["']\)/g)) {
  const [, binding, modPath] = m;
  if (binding.startsWith("{")) {
    for (const part of binding.slice(1, -1).split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) bindings.set(name, { path: modPath, kind: "destructured" });
    }
  } else if (/^[A-Za-z_$][\w$]*$/.test(binding)) {
    bindings.set(binding, { path: modPath, kind: "direct" });
  }
}

const stringConsts = new Map();
for (const m of raw.replace(/\r/g, "").matchAll(/^const\s+([A-Za-z_$][\w$]*)\s*=\s*("[^"]*");$/gm)) {
  stringConsts.set(m[1], m[2]);
}

// names declared right in the moved block
const declaredHere = new Set();
for (const line of body.split("\n")) {
  const fn = line.match(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/);
  if (fn) declaredHere.add(fn[1]);
  const cst = line.match(/^const\s+([A-Za-z_$][\w$]*)\s*=/);
  if (cst) declaredHere.add(cst[1]);
}

// names declared elsewhere in sync.js (candidates for "must move or re-export")
const declaredOutside = new Set();
for (const line of lines.join("\n").replace(/\r/g, "").split("\n")) {
  const fn = line.match(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/);
  if (fn && !declaredHere.has(fn[1])) declaredOutside.add(fn[1]);
  const cst = line.match(/^const\s+([A-Za-z_$][\w$]*)\s*=/);
  if (cst && !declaredHere.has(cst[1])) declaredOutside.add(cst[1]);
}

const used = (name) => (name.length < 3
  ? new RegExp(`(^|[^\\w$.])${name}([^\\w$]|$)`).test(body)
  : new RegExp(`\\b${name}\\b`).test(body));

const byPath = new Map();
const constsToMove = [];
const unresolved = [];
for (const [name, info] of bindings) {
  if (declaredHere.has(name) || !used(name)) continue;
  if (info.path.startsWith("../repairs/")) continue; // never re-import split modules
  if (!byPath.has(info.path)) byPath.set(info.path, []);
  byPath.get(info.path).push(name);
}
for (const [name, value] of stringConsts) {
  if (declaredHere.has(name) || bindings.has(name) || !used(name)) continue;
  constsToMove.push({ name, value });
}
for (const name of declaredOutside) {
  if (bindings.has(name) || stringConsts.has(name)) continue;
  if (used(name)) unresolved.push(name);
}

const entries = [...byPath.entries()].sort((a, b) => {
  const rank = (p) => (p.startsWith("node:") ? 0 : 1);
  return rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]);
});
const requireLines = [];
for (const [modPath, names] of entries) {
  const unique = [...new Set(names)].sort();
  const direct = unique.every((n) => bindings.get(n).kind === "direct");
  if (direct) requireLines.push(...unique.map((n) => `const ${n} = require("${modPath}");`));
  else requireLines.push(`const {\n${unique.map((n) => `  ${n},`).join("\n")}\n} = require("${modPath}");`);
}
const constLines = constsToMove.map((c) => `const ${c.name} = ${c.value};`);

// names the remaining sync.js still needs from the new module
const rest = [...lines.slice(0, start), ...lines.slice(end)].join("\n");
const stillUsed = [...declaredHere]
  .filter((n) => !stringConsts.has(n) || constsToMove.some((c) => c.name === n))
  .filter((n) => new RegExp(`\\b${n}\\b`).test(rest))
  .sort();

const header = headerLines.length ? headerLines.map((l) => (l ? `// ${l}` : "//")) : [];
const output = [
  '"use strict";',
  "",
  ...header,
  ...(header.length ? [""] : []),
  ...requireLines,
  ...(constLines.length ? ["", ...constLines] : []),
  "",
  body,
  "",
  "module.exports = {",
  ...[...new Set([...stillUsed, ...constsToMove.map((c) => c.name)])].sort().map((n) => `  ${n},`),
  "};",
  "",
].join("\n");
fs.writeFileSync(`src/repairs/${moduleName}.js`, output);

lines.splice(start, end - start);
const anchor = lines.findIndex((l) => l.includes('require("../repairs/workbuddy")'));
if (anchor < 0) throw new Error("require anchor not found");
if (stillUsed.length) {
  lines.splice(anchor + 1, 0,
    "const {",
    ...stillUsed.map((n) => `  ${n},`),
    `} = require("../repairs/${moduleName}");`,
  );
}
fs.writeFileSync(syncFile, lines.join(eol));

console.log(`src/repairs/${moduleName}.js: ${end - start} lines, ${requireLines.length} requires` +
  (constLines.length ? `, consts: ${constsToMove.map((c) => c.name).join(", ")}` : ""));
console.log("sync.js still uses from the module:", stillUsed.join(", ") || "(nothing)");
if (unresolved.length) {
  console.log("!! block references names it cannot resolve:", unresolved.sort().join(", "));
}
console.log(`sync.js now ${lines.length} lines`);
