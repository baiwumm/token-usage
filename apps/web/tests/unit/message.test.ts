// Unit tests for ICU formatting (lib/copy/message.ts). Only count/plural
// templates go through IntlMessageFormat; plain strings must pass through.

import { describe, expect, it } from "vitest";

import { formatMessage } from "@/lib/copy/message";

const REVOKED_EN =
  "{count, plural, one {# token invalidated} other {# tokens invalidated}}";

describe("formatMessage", () => {
  it("formats Chinese count templates", () => {
    expect(formatMessage("{count} 个令牌已失效", "zh", { count: 3 })).toBe(
      "3 个令牌已失效",
    );
  });

  it("applies English plural rules", () => {
    expect(formatMessage(REVOKED_EN, "en", { count: 1 })).toBe(
      "1 token invalidated",
    );
    expect(formatMessage(REVOKED_EN, "en", { count: 0 })).toBe(
      "0 tokens invalidated",
    );
    expect(formatMessage(REVOKED_EN, "en", { count: 12 })).toBe(
      "12 tokens invalidated",
    );
  });

  it("returns plain templates unchanged", () => {
    expect(formatMessage("No devices yet", "en")).toBe("No devices yet");
    expect(formatMessage("暂无设备", "zh")).toBe("暂无设备");
  });
});
