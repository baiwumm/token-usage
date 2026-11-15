"use strict";

// 声明式旗标解析（唯一实现）。
//
// 每个命令只声明「接受哪些旗标、写进哪个字段」，三类错误的文案与退出码
// 统一在这里：未知旗标（UNKNOWN_OPTION）、值旗标缺值（MISSING_VALUE）、
// 布尔旗标被赋值（UNEXPECTED_VALUE）。此前 8 个命令各写一份 if/else，
// 同一类错误才会一会儿退出 2、一会儿退出 1（还带着「Re-run with --debug」
// 这种把用户拼错当成崩溃的提示）。
//
// `flagNames()` 供 `test/cli-surface.test.js` 做「帮助文案 ↔ 解析器」的
// 双向一致性断言：任一方向改漏都会红。
//
//   const FLAGS = {
//     command: "upload",
//     defaults: { drain: false, json: false },
//     flags: [
//       { flag: "--drain", aliases: ["--force"], key: "drain" },
//       { flag: "--json", key: "json" },
//       { flag: "--out", key: "out", kind: "value" },
//     ],
//   };

const { UsageError, unknownOptionError } = require("./cli-errors");

function usageHint(command) {
  return command
    ? `Run \`tokenusage ${command} --help\` for supported options.`
    : "Run `tokenusage --help` to see supported commands.";
}

function missingValueError(flag, command) {
  return new UsageError(`${flag} requires a value`, {
    code: "MISSING_VALUE",
    hint: usageHint(command),
  });
}

/**
 * @param {string[]} argv 命令自身的参数（`--help` 已由 cli.js 剥离）
 * @param {{
 *   command: string,
 *   defaults?: Record<string, unknown>,
 *   flags?: Array<{
 *     flag: string,
 *     aliases?: string[],
 *     key: string,
 *     kind?: "boolean" | "value",
 *     parse?: (raw: string, flag: string) => unknown,
 *     const?: unknown,
 *   }>,
 * }} spec
 */
function parseFlags(argv = [], { command, defaults = {}, flags = [] } = {}) {
  const out = { ...defaults };
  const byFlag = new Map();
  for (const entry of flags) {
    byFlag.set(entry.flag, entry);
    for (const alias of entry.aliases || []) byFlag.set(alias, entry);
  }

  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i]);
    // 仅长旗标支持 `--flag=value`（与整改前各命令的行为一致）。
    const eqIndex = token.startsWith("--") ? token.indexOf("=") : -1;
    const name = eqIndex > 0 ? token.slice(0, eqIndex) : token;
    const inlineValue = eqIndex > 0 ? token.slice(eqIndex + 1) : undefined;
    const entry = byFlag.get(name);
    if (!entry) throw unknownOptionError(token, command);

    if ((entry.kind || "boolean") === "value") {
      let raw = inlineValue;
      if (raw === undefined) {
        raw = argv[i + 1];
        if (raw == null || raw === "" || String(raw).startsWith("--")) {
          throw missingValueError(name, command);
        }
        i += 1;
      } else if (raw === "") {
        throw missingValueError(name, command);
      }
      out[entry.key] = entry.parse ? entry.parse(raw, name) : raw;
      continue;
    }

    if (inlineValue !== undefined) {
      throw new UsageError(`${name} takes no value`, {
        code: "UNEXPECTED_VALUE",
        hint: usageHint(command),
      });
    }
    out[entry.key] = "const" in entry ? entry.const : true;
  }

  return out;
}

/** 该 spec 接受的全部旗标名（含别名），按声明顺序去重。 */
function flagNames(spec = {}) {
  const names = [];
  for (const entry of spec.flags || []) {
    for (const name of [entry.flag, ...(entry.aliases || [])]) {
      if (!names.includes(name)) names.push(name);
    }
  }
  return names;
}

module.exports = { parseFlags, flagNames };
