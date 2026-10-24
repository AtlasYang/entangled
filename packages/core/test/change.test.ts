import { describe, expect, it } from "vitest";
import { CHANGE_KINDS, InvalidKeyError, changeRank, parseChangeAttr, toChanges } from "../src/index.js";

describe("toChanges", () => {
  it("normalizes a key, keys, changes and a mix", () => {
    expect(toChanges("a")).toEqual([{ key: "a" }]);
    expect(toChanges(["a", "b:*"])).toEqual([{ key: "a" }, { key: "b:*" }]);
    const c = { key: "c", kind: "remove" as const, label: "−1" };
    expect(toChanges(["a", c])).toEqual([{ key: "a" }, c]);
    expect(toChanges(["a", c])[1]).toBe(c);
  });

  it("throws InvalidKeyError for a malformed key and TypeError for an unknown kind", () => {
    expect(() => toChanges("a:*:b")).toThrow(InvalidKeyError);
    expect(() => toChanges([{ key: "" }])).toThrow(InvalidKeyError);
    expect(() => toChanges([{ key: "a", kind: "explode" as never }])).toThrow(TypeError);
  });
});

describe("parseChangeAttr", () => {
  it("a bare kind applies to every key of the writer", () => {
    expect(parseChangeAttr("remove", ["clip:7", "timeline"])).toEqual([
      { key: "clip:7", kind: "remove" },
      { key: "timeline", kind: "remove" },
    ]);
  });

  it("per-key kinds, keys containing ':' included, leave the rest modify", () => {
    expect(parseChangeAttr("add:cart:items", ["cart:items", "cart:total"])).toEqual([
      { key: "cart:items", kind: "add" },
      { key: "cart:total" },
    ]);
    expect(parseChangeAttr("modify add:cart:items", ["cart:items", "cart:total"])).toEqual([
      { key: "cart:items", kind: "add" },
      { key: "cart:total", kind: "modify" },
    ]);
    expect(parseChangeAttr(null, ["a"])).toEqual([{ key: "a" }]);
  });

  it("reports unknown keys and unknown kinds", () => {
    const bad: string[] = [];
    expect(parseChangeAttr("add:other explode:a explode", ["a"], (t) => bad.push(t))).toEqual([{ key: "a" }]);
    expect(bad).toEqual(["add:other", "explode:a", "explode"]);
  });
});

describe("changeRank", () => {
  it("orders kinds remove > add > disable > enable > move > modify > invalidate", () => {
    expect(CHANGE_KINDS.map(changeRank)).toEqual([7, 6, 5, 4, 3, 2, 1]);
    expect(changeRank(undefined)).toBe(changeRank("modify"));
  });
});
