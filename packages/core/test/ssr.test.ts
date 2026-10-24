// @vitest-environment node
import { describe, expect, it } from "vitest";

describe("SSR safety", () => {
  it("imports and starts without a DOM", async () => {
    const core = await import("../src/index.js");
    const auto = await import("../src/auto.js");
    const rt = core.createEntangled();
    expect(() => rt.start()).not.toThrow();
    expect(rt.started).toBe(false);
    expect(() => rt.confirm("theme")).not.toThrow();
    expect(() => rt.preview("theme")()).not.toThrow();
    expect(auto.autoStart().started).toBe(false);
  });
});
