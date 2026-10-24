import { describe, expect, it } from "vitest";
import { InvalidKeyError, isValidKey, keyMatches, parseKey, splitKeys } from "../src/index.js";

describe("parseKey", () => {
  it("parses concrete keys", () => {
    expect(parseKey("theme")).toMatchObject({ segments: ["theme"], wildcard: false, global: false });
    expect(parseKey("media:42")).toMatchObject({ segments: ["media", "42"], wildcard: false });
  });

  it("parses wildcards and the global key", () => {
    expect(parseKey("media:*")).toMatchObject({ segments: ["media"], wildcard: true, global: false });
    expect(parseKey("*")).toMatchObject({ segments: [], wildcard: true, global: true });
  });

  it.each(["", "a::b", ":a", "a:", "a b", "me*a:4", "media:4*", "*:media", "a:*:b", "**"])(
    "rejects %j",
    (k) => {
      expect(() => parseKey(k)).toThrow(InvalidKeyError);
      expect(isValidKey(k)).toBe(false);
    },
  );
});

describe("keyMatches", () => {
  const cases: Array<[string, string, boolean]> = [
    ["theme", "theme", true],
    ["theme", "themes", false],
    ["media:42", "media:42", true],
    ["media:42", "media:43", false],
    ["media:*", "media:42", true],
    ["media:*", "media:42:thumb", true],
    ["media:*", "media", false],
    ["media:*", "mediaX:1", false],
    ["media:*", "media:*", true],
    ["media:*", "media:42:*", true],
    ["media:42:*", "media:43:x", false],
    ["*", "theme", true],
    ["*", "media:*", true],
    ["theme", "*", true],
  ];
  it.each(cases)("%s ~ %s → %s (both directions)", (a, b, expected) => {
    expect(keyMatches(a, b)).toBe(expected);
    expect(keyMatches(b, a)).toBe(expected);
  });
});

describe("splitKeys", () => {
  it("splits, dedupes and reports invalid tokens", () => {
    const bad: string[] = [];
    expect(splitKeys("  theme media:42\n theme a::b ", (t) => bad.push(t))).toEqual(["theme", "media:42"]);
    expect(bad).toEqual(["a::b"]);
    expect(splitKeys(null)).toEqual([]);
  });
});
