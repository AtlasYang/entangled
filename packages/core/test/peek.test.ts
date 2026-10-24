// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type EntangledOptions,
  type EntangledRuntime,
  PeekTokenError,
  compilePeekCss,
  createEntangled,
  peekTokensByState,
  validatePeekTokens,
} from "../src/index.js";

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const tick = () => new Promise<void>((r) => queueMicrotask(r));
const $ = (sel: string) => document.querySelector(sel) as HTMLElement;

const THEME = {
  key: "theme",
  tokens: {
    "--bg": { light: "oklch(98% 0 0)", dark: "oklch(18% 0 0)" },
    "--fg": { light: "oklch(20% 0 0)", dark: "oklch(95% 0 0)" },
  },
};

describe("validatePeekTokens", () => {
  it("accepts paint-only tokens; a plain value map means <color>", () => {
    const { set, rejected } = validatePeekTokens({
      ...THEME,
      tokens: { ...THEME.tokens, "--veil": { syntax: "<percentage>", values: { light: "0%", dark: "40%" } } },
    });
    expect(rejected).toEqual([]);
    expect(set.tokens.map((t) => [t.name, t.syntax])).toEqual([
      ["--bg", "<color>"],
      ["--fg", "<color>"],
      ["--veil", "<percentage>"],
    ]);
    expect(set.states).toEqual(["light", "dark"]);
  });

  it("rejects layout-affecting tokens and malformed values, keeping the rest", () => {
    const { set, rejected } = validatePeekTokens({
      key: "density",
      tokens: {
        "--ok": { light: "red", dark: "blue" },
        "--gap": { syntax: "<length>", values: { a: "4px", b: "8px" } },
        "--pad": { syntax: "<length-percentage>", values: { a: "4px", b: "10%" } },
        "--tint": { layout: true, values: { a: "red", b: "blue" } },
        "--one": { light: "red" },
        "--bad": { light: "red; } body { display: none", dark: "blue" },
        "--alpha": { syntax: "<number>", values: { a: "0.5", b: "1px" } },
        notatoken: { a: "red", b: "blue" },
      },
    });
    expect(set.tokens.map((t) => t.name)).toEqual(["--ok"]);
    expect(Object.fromEntries(rejected.map((r) => [r.token, r.reason]))).toEqual({
      "--gap": expect.stringContaining("<length> may affect layout"),
      "--pad": expect.stringContaining("may affect layout"),
      "--tint": expect.stringContaining("layout-affecting"),
      "--one": expect.stringContaining("two states"),
      "--bad": expect.stringContaining("unsafe"),
      "--alpha": expect.stringContaining("not a <number>"),
      notatoken: expect.stringContaining("custom properties"),
    });
  });

  it("only concrete keys can peek", () => {
    expect(() => validatePeekTokens({ key: "media:*", tokens: {} })).toThrow(PeekTokenError);
    expect(() => validatePeekTokens({ key: "*", tokens: {} })).toThrow(PeekTokenError);
  });

  it("peekTokensByState pivots per-state theme values", () => {
    expect(peekTokensByState({ light: { "--bg": "white", "--fg": "black" }, dark: { "--bg": "black" } })).toEqual({
      "--bg": { light: "white", dark: "black" },
      "--fg": { light: "black" },
    });
  });
});

describe("compilePeekCss", () => {
  const theme = validatePeekTokens(THEME).set;
  const accent = validatePeekTokens({
    key: "accent",
    tokens: {
      "--card-accent": { indigo: "#4f46e5", rose: "#e11d48", teal: "#0d9488" },
      "--card-glow": { syntax: "<number>", values: { indigo: "0.2", rose: "0.4", teal: "0.3" } },
    },
  }).set;

  it("global scope: tokens on :root, one rule per next state", () => {
    expect(compilePeekCss([{ set: theme, scope: "global", current: "light" }])).toMatchSnapshot();
  });

  it("reader scope, three states, a <number> token", () => {
    expect(compilePeekCss([{ set: accent, scope: "readers", current: "teal" }], { gateHover: false })).toMatchSnapshot();
  });

  it("is deterministic and keyed by state", () => {
    const a = compilePeekCss([
      { set: accent, scope: "readers" },
      { set: theme, scope: "global", current: "dark" },
    ]);
    const b = compilePeekCss([
      { set: theme, scope: "global", current: "dark" },
      { set: accent, scope: "readers" },
    ]);
    expect(a).toBe(b);
    expect(a).toContain("--en-base-bg: oklch(18% 0 0);"); // current = dark
    expect(a).toContain('[data-en-next="light"]:hover');
    expect(a).not.toContain('[data-en-next="dark"]'); // nothing to peek at: it's current
    expect(a).toContain("--en-base-card-accent: #4f46e5;"); // no current: the first state
  });

  it("peek: false keeps the tokens' values but emits no blend rules", () => {
    const css = compilePeekCss([{ set: theme, scope: "global", current: "dark", peek: false }]);
    expect(css).toContain("--en-base-bg: oklch(18% 0 0);");
    expect(css).not.toContain(":hover");
    expect(css).not.toContain("--en-next-bg:");
  });

  it("never lets the blend exceed 35%", () => {
    expect(compilePeekCss([{ set: theme, scope: "global" }], { maxAmount: 0.9 })).toContain("min(var(--en-peek-amount, 0.15), 0.35)");
    expect(compilePeekCss([{ set: theme, scope: "global" }], { maxAmount: 0.2 })).toContain("min(var(--en-peek-amount, 0.15), 0.2)");
  });
});

let rt: EntangledRuntime | null = null;
const boot = (html: string, opts: EntangledOptions = {}) => {
  document.body.innerHTML = html;
  rt = createEntangled({ sensors: [], habituation: false, ...opts });
  rt.start();
  return rt;
};
const peekSheet = () => document.querySelector('style[data-en-sheet="peek"]')?.textContent ?? "";

afterEach(() => {
  rt?.destroy();
  rt = null;
  document.body.innerHTML = "";
  document.body.removeAttribute("data-en-by");
  vi.restoreAllMocks();
});

describe("token peek in the runtime", () => {
  it("follows the writer's data-en-value, recompiling only when it changes", async () => {
    document.body.setAttribute("data-en-by", "theme");
    const r = boot(`<button id="t" data-en-affects="theme" data-en-value="light" data-en-next="dark"></button>`);
    r.definePeekTokens(THEME);
    await tick();
    expect(peekSheet()).toContain(":root {\n    --en-base-bg: oklch(98% 0 0);");
    expect(peekSheet()).toContain('[data-en-next="dark"]:hover');
    $("#t").setAttribute("data-en-value", "dark");
    $("#t").setAttribute("data-en-next", "light");
    await tick();
    await tick();
    expect(peekSheet()).toContain("--en-base-bg: oklch(18% 0 0);");
    expect(peekSheet()).toContain('[data-en-next="light"]:hover');
  });

  it("infers a two-state key's current state from data-en-next alone", async () => {
    const r = boot(`<button data-en-affects="theme" data-en-next="dark"></button>`);
    r.definePeekTokens(THEME);
    await tick();
    expect(peekSheet()).toContain("--en-base-bg: oklch(98% 0 0);"); // not dark, so light
  });

  it("scopes to readers unless the key is global", async () => {
    const r = boot(`<button data-en-affects="accent" data-en-next="rose"></button><div id="card" data-en-by="accent"></div>`);
    r.definePeekTokens({ key: "accent", tokens: { "--card-accent": { indigo: "#4f46e5", rose: "#e11d48" } } });
    await tick();
    expect(peekSheet()).toContain(':where([data-en-by~="accent"], [data-en-by~="*"]) {');
    // A reader on <body> makes it global.
    document.body.setAttribute("data-en-by", "accent");
    await tick();
    await tick();
    await tick();
    expect(peekSheet()).toContain(":root {\n    --en-base-card-accent");
  });

  it("rejects unsafe tokens with a warning and lists them", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = boot(``);
    r.definePeekTokens({ key: "density", tokens: { "--gap": { syntax: "<length>", values: { a: "4px", b: "8px" } } } });
    r.definePeekTokens({ key: "other", tokens: { "--bg": { a: "red", b: "blue" } } });
    r.definePeekTokens({ key: "theme", tokens: { "--bg": { light: "white", dark: "black" } } });
    expect(warn).toHaveBeenCalledTimes(2);
    expect(r.peekRejections.map((x) => [x.key, x.token])).toEqual([
      ["density", "--gap"],
      ["theme", "--bg"], // already peeks for "other"
    ]);
    await tick();
    expect(peekSheet()).not.toContain("--gap");
  });

  it("registers option tokens at start, sets the amount, and cleans up", async () => {
    const r = boot(``, { peek: { amount: 0.25, tokens: [THEME] } });
    await tick();
    expect(peekSheet()).toContain("--bg: color-mix(in oklch");
    expect(document.documentElement.style.getPropertyValue("--en-peek-amount")).toBe("0.25");
    r.destroy();
    expect(peekSheet()).toBe("");
    expect(document.documentElement.style.getPropertyValue("--en-peek-amount")).toBe("");
  });

  it("skips the global blend on documents too large to restyle on hover, not the scoped one", async () => {
    document.body.setAttribute("data-en-by", "theme");
    const r = boot(`<button data-en-affects="accent"></button><i data-en-by="accent"></i>${"<p></p>".repeat(10)}`, {
      peek: { maxGlobalNodes: 5 },
    });
    r.definePeekTokens(THEME);
    r.definePeekTokens({ key: "accent", tokens: { "--card-accent": { indigo: "#4f46e5", rose: "#e11d48" } } });
    await tick();
    expect(peekSheet()).toContain("--en-base-bg"); // tokens still resolve
    expect(peekSheet()).not.toContain('"theme"][data-en-next');
    expect(peekSheet()).toContain('[data-en-affects~="accent"][data-en-next="rose"]:hover');
  });

  it("unregistering the last set removes the sheet", async () => {
    const r = boot(``);
    const off = r.definePeekTokens(THEME);
    await tick();
    expect(peekSheet()).not.toBe("");
    off();
    expect(peekSheet()).toBe("");
  });
});

describe("value peek", () => {
  const pointer = (type: string, target: Element, related: Element | null = null) =>
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, relatedTarget: related }));
  const withSensors = (html: string, opts: EntangledOptions = {}) => {
    document.body.innerHTML = html;
    rt = createEntangled({ dwellMs: 20, habituation: false, ...opts });
    rt.start();
    return rt;
  };
  const HTML = `<button id="w" data-en-affects="discount"></button><b id="total" data-en-by="discount"></b><b id="plain" data-en-by="discount"></b><p id="out"></p>`;
  const price = (d: number) => 120 * (1 - d / 100);

  function wire(r: EntangledRuntime) {
    let discount = 0;
    r.peekWriter($("#w"), { current: () => discount, next: () => discount + 10 });
    r.peekReader($("#total"), (cur, next) => `−€${price(cur as number) - price(next as number)}`);
    return (d: number) => (discount = d);
  }

  it("writes the delta after the dwell, without touching readers that didn't ask, and clears it on leave", async () => {
    const r = withSensors(HTML);
    const setDiscount = wire(r);
    const seen: unknown[] = [];
    r.onPeek("discount", (n) => seen.push(n));
    pointer("pointerover", $("#w"));
    await frame();
    expect($("#total").hasAttribute("data-en-delta")).toBe(false); // dwell
    await sleep(40);
    await frame();
    expect($("#total").getAttribute("data-en-delta")).toBe("−€12");
    expect($("#plain").hasAttribute("data-en-delta")).toBe(false);
    expect(seen).toEqual([10]);
    pointer("pointerout", $("#w"), $("#out"));
    await frame();
    expect($("#total").hasAttribute("data-en-delta")).toBe(false);
    expect(seen).toEqual([10, undefined]);
    // Next hover sees the new current value.
    setDiscount(10);
    pointer("pointerover", $("#w"));
    await sleep(40);
    await frame();
    expect($("#total").getAttribute("data-en-delta")).toBe("−€12");
    expect(seen).toEqual([10, undefined, 20]);
  });

  it("works in CSS mode, attaching hover sensors only once a reader asks", async () => {
    const g = globalThis as { CSS?: unknown };
    const prev = g.CSS;
    g.CSS = { supports: (q: string) => q.includes(":has"), registerProperty: () => {} };
    try {
      const r = withSensors(HTML, { mode: "css" });
      expect(r.mode).toBe("css");
      r.peekWriter($("#w"), { current: () => 0, next: () => 10 });
      pointer("pointerover", $("#w"));
      await sleep(40);
      await frame();
      expect($("#total").hasAttribute("data-en-delta")).toBe(false); // no listener yet
      pointer("pointerout", $("#w"), $("#out"));
      r.peekReader($("#total"), () => "−€12");
      pointer("pointerover", $("#w"));
      await sleep(40);
      await frame();
      expect($("#total").getAttribute("data-en-delta")).toBe("−€12");
      expect($("#total").hasAttribute("data-en-state")).toBe(false); // CSS still owns preview
    } finally {
      g.CSS = prev;
    }
  });

  it("disposing a reader removes its chip", async () => {
    const r = withSensors(HTML);
    wire(r);
    const off = r.peekReader($("#plain"), () => "x");
    pointer("pointerover", $("#w"));
    await sleep(40);
    await frame();
    expect($("#plain").getAttribute("data-en-delta")).toBe("x");
    off();
    expect($("#plain").hasAttribute("data-en-delta")).toBe(false);
  });
});
