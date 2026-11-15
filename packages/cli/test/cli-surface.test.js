"use strict";

// 命令「面」一致性：帮助文案 ↔ 解析器 spec ↔ 命令表。
//
// 此前三者可以各自漂移：`diagnostics` 解析 `--compact/--pretty` 但帮助里没有，
// `device-login` 解析 4 个旗标却只文档化 2 个，`pause --json` 连参数都收不到。
// 每个命令导出的 `flagSpec` 是唯一声明，这里做双向断言：usage 里出现的每个
// 旗标必须被解析器接受，解析器接受的每个旗标也必须在 usage 里出现。

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { COMMANDS } = require("../src/cli");
const { flagNames } = require("../src/lib/cli-flags");

const SPEC_MODULES = {
  upload: "../src/commands/upload",
  sessions: "../src/commands/sessions",
  diagnostics: "../src/commands/diagnostics",
  doctor: "../src/commands/doctor",
  "device-login": "../src/commands/device-login",
  pause: "../src/commands/pause",
  status: "../src/commands/status",
  uninstall: "../src/commands/uninstall",
};

function documentedFlags(command) {
  const text = (command.usage || []).join("\n");

  return new Set(text.match(/--[a-z][a-z0-9-]*/g) || []);
}

test("every command has a unique name, a summary and usage text", () => {
  assert.equal(
    new Set(COMMANDS.map((command) => command.name)).size,
    COMMANDS.length,
    "command names must be unique",
  );

  for (const command of COMMANDS) {
    assert.ok(command.summary?.length, `${command.name} has a summary`);
    assert.ok(command.usage?.length, `${command.name} has usage text`);
    assert.equal(typeof command.run, "function", `${command.name} has a runner`);
  }
});

test("documented flags and the parser spec never drift", () => {
  for (const [name, modulePath] of Object.entries(SPEC_MODULES)) {
    const command = COMMANDS.find((entry) => entry.name === name);

    assert.ok(command, `${name} must be registered in COMMANDS`);
    const { flagSpec } = require(modulePath);

    assert.ok(flagSpec, `${name} must export its flag spec`);

    const documented = documentedFlags(command);
    const accepted = new Set(flagNames(flagSpec));

    for (const flag of accepted) {
      assert.ok(
        documented.has(flag),
        `${name}: ${flag} is accepted by the parser but missing from --help`,
      );
    }
    for (const flag of documented) {
      assert.ok(
        accepted.has(flag),
        `${name}: ${flag} is documented in --help but rejected by the parser`,
      );
    }
  }
});

test("every spec-backed command routes typos through the shared parser", () => {
  for (const [name, modulePath] of Object.entries(SPEC_MODULES)) {
    const { parseArgs } = require(modulePath);

    assert.throws(
      () => parseArgs(["--definitely-not-a-flag"], name),
      (error) => error?.code === "UNKNOWN_OPTION",
      `${name} must reject an unknown flag`,
    );
  }
});
