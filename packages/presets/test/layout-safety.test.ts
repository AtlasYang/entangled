import { describe, expect, it } from "vitest";
import { presetsCss } from "../src/index.js";

/**
 * Static layout-invariance guard: walk every rule in the shipped CSS and
 * check which properties it may touch, depending on what it targets.
 */
interface Rule {
  selector: string;
  decls: Array<[prop: string, value: string]>;
  keyframes: string | null;
}

function parse(css: string): Rule[] {
  const rules: Rule[] = [];
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const stack: string[] = [];
  let buf = "";
  for (const ch of src) {
    if (ch === "{") {
      stack.push(buf.trim());
      buf = "";
    } else if (ch === "}") {
      const prelude = stack.pop()!;
      const body = buf.trim();
      buf = "";
      if (!prelude.startsWith("@") && body) {
        const kf = stack.find((s) => s.startsWith("@keyframes"));
        rules.push({
          selector: prelude,
          keyframes: kf ? kf.split(/\s+/)[1]! : null,
          decls: body
            .split(";")
            .map((d) => d.trim())
            .filter(Boolean)
            .map((d) => {
              const i = d.indexOf(":");
              return [d.slice(0, i).trim(), d.slice(i + 1).trim()] as [string, string];
            }),
        });
      }
    } else buf += ch;
  }
  return rules;
}

/** Split on commas that are not inside parentheses. */
function splitTopLevel(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of value) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  return [...out, cur];
}

const rules = parse(presetsCss);
const isPseudo = (s: string) => /::(after|before)/.test(s);
const isOverlay = (s: string) => s.includes("[data-en-overlay]");
const isMediaOnly = (s: string) => s.startsWith(":is(img, video");
const isSvgOnly = (s: string) => s.startsWith(":is(svg, g, path");
/** Rules in `@layer entangled.form`. */
const formStart = presetsCss.indexOf("@layer entangled.form {");
const formRules = parse(presetsCss.slice(formStart, presetsCss.indexOf("@layer entangled.peek {", formStart)));

// Properties allowed on real (author) elements: paint-only.
const ELEMENT_PROPS = new Set([
  "box-shadow",
  "transition",
  "transition-duration",
  "animation",
  "outline",
  "outline-color",
  "outline-style",
  "outline-width",
  "outline-offset",
  "color",
  "text-shadow",
]);
// SVG graphics elements have no CSS boxes inside: their paint properties and filter are
// layout-safe.
const SVG_PROPS = new Set(["filter", "stroke", "stroke-width", "fill"]);
// Keyframe properties allowed, by where they are used.
const ELEMENT_KF_PROPS = new Set(["box-shadow", "outline-color", "outline-offset", "outline-style", "outline-width", "color", "text-shadow"]);
/** The orienting stage's keyframes may only use outline longhands. */
const ORIENT_KF_PROPS = new Set(["outline-color", "outline-offset", "outline-style", "outline-width"]);
const MEDIA_KF_PROPS = new Set(["box-shadow", "filter"]);
const PSEUDO_KF_PROPS = new Set(["opacity", "transform", "background"]);
const SVG_KF_PROPS = new Set(["filter"]);

describe("preset CSS is layout-safe", () => {
  it("parses a meaningful number of rules", () => {
    expect(rules.filter((r) => !r.keyframes).length).toBeGreaterThan(20);
  });

  it("only touches paint properties on author elements", () => {
    for (const r of rules) {
      if (r.keyframes || isPseudo(r.selector) || isOverlay(r.selector) || r.selector === ":root") continue;
      for (const [prop] of r.decls) {
        if (prop.startsWith("--")) continue;
        if (isSvgOnly(r.selector) && SVG_PROPS.has(prop)) continue;
        expect(ELEMENT_PROPS, `${r.selector} { ${prop} }`).toContain(prop);
      }
    }
  });

  it(":root only defines tokens", () => {
    for (const r of rules.filter((r) => r.selector === ":root")) {
      for (const [prop] of r.decls) expect(prop.startsWith("--")).toBe(true);
    }
  });

  it("pseudo-elements are absolutely positioned decorations", () => {
    const base = rules.find((r) => r.selector === "[data-en-layer][data-en-fx]::after")!;
    expect(Object.fromEntries(base.decls)).toMatchObject({ position: "absolute", "pointer-events": "none" });
  });

  it("the actor badge is an absolutely positioned decoration inside its host", () => {
    const badge = rules.find((r) => r.selector === '[data-en-badge][data-en-actor][data-en-state="confirm"]::before')!;
    expect(Object.fromEntries(badge.decls)).toMatchObject({
      position: "absolute",
      inset: "4px 4px auto auto",
      "pointer-events": "none",
      "max-width": "calc(100% - 8px)",
    });
  });

  it("origin rules only redefine color tokens", () => {
    const origin = rules.filter((r) => r.selector.startsWith("[data-en-fx][data-en-origin="));
    expect(origin).toHaveLength(3);
    for (const r of origin) for (const [prop] of r.decls) expect(prop).toMatch(/^--en-fx-color(-2)?$/);
  });

  it("the source preset applies only during a reverse query and never replaces the focus ring", () => {
    const source = rules.filter((r) => r.selector.includes("[data-en-query]"));
    expect(source.length).toBeGreaterThan(0);
    for (const r of source) {
      expect(r.selector).toMatch(/^:root\[data-en-query\] \[data-en-affects\]\[data-en-fx\]:not\(:focus-visible\)$/);
    }
  });

  it("the inset preset stays inside its host and never replaces the focus ring", () => {
    const inset = rules.filter((r) => !r.keyframes && r.selector.startsWith('[data-en-fx="inset"]') && r.decls.some(([p]) => p === "outline"));
    expect(inset.length).toBeGreaterThan(0);
    for (const r of inset) {
      expect(r.selector).toMatch(/:not\(:focus-visible[,)]/);
      expect(Object.fromEntries(r.decls)["outline-offset"]).toBe("-2px");
    }
    const frames = rules.filter((r) => r.keyframes === "en-inset-confirm");
    for (const r of frames) expect(Number.parseFloat(Object.fromEntries(r.decls)["outline-offset"]!)).toBeLessThan(0);
  });

  it("exposes its transitions as --en-transition for hosts with their own", () => {
    const root = rules.find((r) => r.selector === ":root" && r.decls.some(([p]) => p === "--en-transition"))!;
    const host = rules.find((r) => r.selector === "[data-en-fx]" && r.decls.some(([p]) => p === "transition"))!;
    expect(Object.fromEntries(host.decls).transition).toBe("var(--en-transition)");
    expect(Object.fromEntries(host.decls)["--en-transition"]).toBe(Object.fromEntries(root.decls)["--en-transition"]);
    expect(Object.fromEntries(root.decls)["--en-transition"]).toMatch(/^--en-preview /);
  });

  it("a preview fades in with the enter timing and out with the exit timing", () => {
    const decls = (selector: string) => Object.fromEntries(rules.find((r) => r.selector === selector && !r.keyframes)!.decls);
    const root = Object.fromEntries(rules.filter((r) => r.selector === ":root").flatMap((r) => r.decls));
    expect(Number.parseFloat(root["--en-duration-preview-out"]!)).toBeGreaterThan(Number.parseFloat(root["--en-duration-preview"]!));
    // Idle (what a preview fades out to) takes the exit timing; salient (what it fades in to) the
    // enter timing.
    expect(decls("[data-en-fx]")["--_en-preview-duration"]).toBe("var(--en-duration-preview-out)");
    expect(decls("[data-en-fx][data-en-state]")["--_en-preview-duration"]).toBe("var(--en-duration-preview)");
    expect(decls("[data-en-fx][data-en-state]")["--_en-preview-ease"]).toBe("var(--en-ease-preview)");
    expect(root["--en-transition"]).toMatch(/^--en-preview var\(--_en-preview-duration, var\(--en-duration-preview-out\)\)/);
    // The intensity is held through the fade out, and changes at once on the way in.
    expect(root["--en-transition"]).toContain("--en-intensity var(--_en-intensity-timing, var(--en-duration-preview-out) step-end)");
    expect(decls("[data-en-fx]")["--_en-intensity-timing"]).toBe("var(--en-duration-preview-out) step-end");
    expect(decls("[data-en-fx][data-en-state]")["--_en-intensity-timing"]).toBe("0s");
  });

  it("the overlay is fixed and never intercepts input", () => {
    const base = rules.find((r) => r.selector === "[data-en-overlay]" && r.decls.some(([p]) => p === "position"))!;
    expect(Object.fromEntries(base.decls)).toMatchObject({ position: "fixed", "pointer-events": "none" });
  });

  it("animations only use compositor/paint properties appropriate to their target", () => {
    const kfProps = new Map<string, Set<string>>();
    for (const r of rules) {
      if (!r.keyframes) continue;
      const set = kfProps.get(r.keyframes) ?? new Set();
      for (const [p] of r.decls) set.add(p);
      kfProps.set(r.keyframes, set);
    }
    let checked = 0;
    for (const r of rules) {
      if (r.keyframes) continue;
      const anim = r.decls.find(([p]) => p === "animation")?.[1];
      if (!anim || anim === "none") continue;
      const allowed = isPseudo(r.selector)
        ? PSEUDO_KF_PROPS
        : isOverlay(r.selector)
          ? new Set(["opacity"])
          : isMediaOnly(r.selector)
            ? MEDIA_KF_PROPS
            : isSvgOnly(r.selector)
              ? SVG_KF_PROPS
              : ELEMENT_KF_PROPS;
      for (const raw of splitTopLevel(anim).map((a) => a.trim().split(/\s+/)[0]!)) {
        if (raw === "none") continue;
        const name = raw === "var(--_en-orient)" ? "en-orient" : raw;
        const props = kfProps.get(name);
        expect(props, `keyframes ${name}`).toBeDefined();
        // Outlines are paint on any box: the orienting stage runs on every target.
        for (const p of props!) expect(name === "en-orient" ? ORIENT_KF_PROPS : allowed, `${r.selector} → @keyframes ${name} { ${p} }`).toContain(p);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(8);
    for (const p of kfProps.get("en-orient")!) expect(ORIENT_KF_PROPS).toContain(p);
  });

  it("form rules (channels, far, kinds) only set outlines, animations and private variables", () => {
    expect(formRules.filter((r) => !r.keyframes).length).toBeGreaterThan(3);
    for (const r of formRules) {
      for (const [prop] of r.decls) {
        expect(prop.startsWith("--_en-") || prop === "animation" || prop.startsWith("outline"), `${r.selector} { ${prop} }`).toBe(true);
      }
    }
  });

  it("surface presets: block floods on a decoration, stroke paints only SVG, hue moves by --en-preview only", () => {
    for (const fx of ["row", "block", "stroke", "glyph", "cell"]) {
      expect(rules.some((r) => !r.keyframes && r.selector.endsWith(`[data-en-fx="${fx}"]`)), fx).toBe(true);
    }
    const flood = rules.find((r) => r.selector === '[data-en-layer][data-en-fx="block"]::before')!;
    expect(Object.fromEntries(flood.decls)).toMatchObject({ position: "absolute", inset: "0", "pointer-events": "none" });
    for (const r of rules) {
      if (r.keyframes || isMediaOnly(r.selector)) continue;
      for (const [prop, value] of r.decls) {
        if (SVG_PROPS.has(prop) && value !== "none") expect(isSvgOnly(r.selector), `${r.selector} { ${prop} }`).toBe(true);
      }
    }
    // Mixing the cue colour toward another opaque colour must follow --en-preview, never the
    // intensity.
    const mixes = [...presetsCss.matchAll(/color-mix\(in oklab, var\(--en-fx-color\) calc\(([^)]*\)?[^)]*)\), ([^)]+?)\)/g)];
    expect(mixes.length).toBeGreaterThan(5);
    for (const [, expr, other] of mixes) {
      if (other!.trim() === "transparent") continue;
      expect(expr, `${expr} → ${other}`).not.toMatch(/--en-intensity|--_en-a/);
    }
  });

  it("everything is inside @layer entangled", () => {
    const outside = presetsCss
      .replace(/@property[^{]+\{[^}]*\}/g, "")
      .replace(/@layer [^{;]+;/g, "")
      .trim();
    // After stripping @property and the layer order statement, every top-level block is an @layer
    // entangled.* block.
    let depth = 0;
    let top = "";
    for (const ch of outside) {
      if (ch === "{") {
        if (depth === 0) expect(top.trim()).toMatch(/^@layer entangled\.\w+$/);
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0) top = "";
      } else if (depth === 0) top += ch;
    }
  });
});
