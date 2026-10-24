// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  compileGraphCss,
  cssString,
  keyMatches,
  namespaceTokens,
  readerPresence,
  readerSelectors,
} from "../src/index.js";

describe("readerSelectors ≡ keyMatches", () => {
  const KEYS = [
    "theme",
    "a",
    "a:b",
    "a:c",
    "a:b:c",
    "a:*",
    "a:b:*",
    "a:b:c:*",
    "b:*",
    "ab:x",
    "*",
    'q"uote',
    "back\\slash",
  ];

  /** A real element carrying the attributes the runtime would set for a reader of `key`. */
  const reader = (key: string) => {
    const el = document.createElement("div");
    el.setAttribute("data-en-fx", "tint");
    el.setAttribute("data-en-by", key);
    const ns = namespaceTokens(key).join(" ");
    if (ns) el.setAttribute("data-en-ns", ns);
    return el;
  };

  for (const w of KEYS.filter((k) => k !== "*")) {
    it(`writer ${w}`, () => {
      const selector = readerSelectors(w).join(", ");
      for (const r of KEYS) {
        expect(reader(r).matches(selector), `${w} → ${r}`).toBe(keyMatches(w, r));
      }
    });
  }

  it("pruned selectors stay equivalent over the readers that exist", () => {
    const subsets = [["a:b", "theme"], ["a:*", "a:b:c"], ["*", "ab:x"], ["a:b:*"], []];
    for (const readers of subsets) {
      const present = readerPresence(readers);
      for (const w of KEYS.filter((k) => k !== "*")) {
        const sels = readerSelectors(w, present);
        for (const r of readers) {
          const matched = sels.length > 0 && reader(r).matches(sels.join(", "));
          expect(matched, `${w} → ${r} (present: ${readers})`).toBe(keyMatches(w, r));
        }
      }
    }
  });

  it("global writers have no element selectors (overlay only)", () => {
    expect(readerSelectors("*")).toEqual([]);
  });

  it("selector count grows with segments, not readers", () => {
    expect(readerSelectors("theme")).toHaveLength(2);
    expect(readerSelectors("a:b:c")).toHaveLength(4);
    expect(readerSelectors("a:b:*")).toHaveLength(3);
  });
});

describe("namespaceTokens", () => {
  it("lists proper prefixes for concrete keys and all prefixes for wildcards", () => {
    expect(namespaceTokens("theme")).toEqual([]);
    expect(namespaceTokens("media:42")).toEqual(["media"]);
    expect(namespaceTokens("media:42:thumb")).toEqual(["media", "media:42"]);
    expect(namespaceTokens("media:*")).toEqual(["media"]);
    expect(namespaceTokens("*")).toEqual([]);
  });
});

describe("cssString", () => {
  it("escapes quotes, backslashes and newlines", () => {
    expect(cssString('a"b')).toBe('"a\\"b"');
    expect(cssString("a\\b")).toBe('"a\\\\b"');
    expect(cssString("a\nb")).toBe('"a\\a b"');
    const el = document.createElement("i");
    el.setAttribute("data-k", 'x"y\\z');
    expect(el.matches(`[data-k=${cssString('x"y\\z')}]`)).toBe(true);
  });
});

describe("compileGraphCss", () => {
  const input = {
    writerKeys: ["theme", "media:*", "media:42", "*"],
    overlayKeys: ["theme"],
    intensities: { "media:*": 0.6123456 },
  };

  it("matches the snapshot", () => {
    expect(compileGraphCss(input)).toMatchSnapshot();
  });

  it("is deterministic regardless of input order and duplicates", () => {
    const shuffled = { ...input, writerKeys: ["*", "media:42", "theme", "media:*", "theme"] };
    expect(compileGraphCss(shuffled)).toBe(compileGraphCss(input));
  });

  it("emits a bounded number of rules: 2 per writer key plus overlay rules", () => {
    const keys = Array.from({ length: 500 }, (_, i) => `item:${i}`);
    const css = compileGraphCss({ writerKeys: keys });
    expect(css.match(/:root:has\(/g)).toHaveLength(1000);
    // Readers are never enumerated, so 10k readers of one key cost nothing extra.
    expect(compileGraphCss({ writerKeys: ["item:*"] }).match(/:root:has\(/g)).toHaveLength(2);
  });

  it("adds overlay rules only for keys that reach a global reader", () => {
    const css = compileGraphCss({ writerKeys: ["theme", "density"], overlayKeys: ["theme"] });
    const overlayRules = css.split("}").filter((r) => r.includes("[data-en-overlay]"));
    expect(overlayRules).toHaveLength(2); // hover + focus for "theme"
    expect(overlayRules.every((r) => r.includes('"theme"'))).toBe(true);
  });

  it("gates hover rules behind (hover: hover) unless disabled", () => {
    expect(compileGraphCss({ writerKeys: ["k"] })).toContain("@media (hover: hover)");
    expect(compileGraphCss({ writerKeys: ["k"] }, { gateHover: false })).not.toContain("@media");
  });

  it("wraps everything in the state layer", () => {
    const css = compileGraphCss({ writerKeys: ["k"] }, { layer: "custom.layer" });
    expect(css).toMatch(/@layer custom\.layer \{[\s\S]*\}\n$/);
  });

  it("emits minimal rules when the graph says exclusions are unnecessary", () => {
    const css = compileGraphCss({ writerKeys: ["theme"], readerKeys: ["theme"], overflowKeys: [], selfKeys: [] });
    expect(css).toContain(':root:has([data-en-affects~="theme"]:hover) [data-en-by~="theme"]:where([data-en-fx]) {');
    expect(css).not.toContain(":is(");
    expect(css).not.toContain(":not(");
    const full = compileGraphCss({ writerKeys: ["theme"], readerKeys: ["theme", "*"], overflowKeys: ["theme"], selfKeys: ["theme"] });
    expect(full).toContain(':is([data-en-by~="theme"], [data-en-by~="*"])');
    expect(full).toContain(':not([data-en-over~="theme"], [data-en-affects~="theme"]:hover)');
  });

  it("skips reader rules for writers nobody reads", () => {
    const css = compileGraphCss({ writerKeys: ["lonely"], readerKeys: ["theme"] });
    expect(css).not.toContain("lonely");
  });

  it("handles an empty graph", () => {
    expect(compileGraphCss({ writerKeys: [] })).toBe("/* @entangled-ui/core compiled: 0 writer keys */\n@layer entangled.state {\n}\n");
  });
});
