"use strict";

// 0.2.5 dropped @mongodb-js/zstd: the package engine floor is >=22.19, so
// node:zlib can always decode zstd. These tests exercise the two real decode
// paths (Zed thread blobs and concatenated DeepSeek Harness frames) so a
// future dependency/engine change cannot silently remove zstd support.

const assert = require("node:assert/strict");
const zlib = require("node:zlib");
const { test } = require("node:test");

const { decodeDshZstd, decodeZedThreadBlob } = require("../src/lib/rollout");

test("the supported Node runtime has a built-in zstd decoder", () => {
  assert.equal(typeof zlib.zstdDecompressSync, "function");
});

test("Zed zstd thread blobs decode through the built-in decoder", async () => {
  const text = JSON.stringify({ tokens: { input: 10, output: 4 }, model: "zed-test" });
  const decoded = await decodeZedThreadBlob({
    dataType: "zstd",
    data: zlib.zstdCompressSync(Buffer.from(text)),
  });
  assert.equal(decoded, text);
});

test("concatenated DeepSeek Harness zstd frames are decoded one by one", async () => {
  const first = "{\"seq\":1}\n";
  const second = "{\"seq\":2}\n";
  const payload = Buffer.concat([
    zlib.zstdCompressSync(Buffer.from(first)),
    zlib.zstdCompressSync(Buffer.from(second)),
  ]);
  const decoded = await decodeDshZstd(payload, { maxOutputBytes: 4096 });
  assert.equal(decoded.toString("utf8"), first + second);
});
