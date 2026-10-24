import { describe, expect, it } from "vitest";
import { dtcgTokens, presetsCss, tokens } from "../src/index.js";

/** Declarations of the `:root` rule(s) of the shipped CSS. */
function rootDecls(): Map<string, string> {
  const out = new Map<string, string>();
  const src = presetsCss.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of src.matchAll(/(?:^|[\s}]):root\s*\{([^}]*)\}/g)) {
    for (const d of m[1]!.split(";")) {
      const i = d.indexOf(":");
      if (i > 0) out.set(d.slice(0, i).trim(), d.slice(i + 1).trim());
    }
  }
  return out;
}

type Leaf = { $type: string; $value: unknown; $description: string; $extensions: unknown };
function leaves(node: Record<string, unknown>, path: string[] = []): Array<[string, Leaf]> {
  if ("$value" in node) return [[path.join("."), node as unknown as Leaf]];
  return Object.entries(node)
    .filter(([k]) => !k.startsWith("$"))
    .flatMap(([k, v]) => leaves(v as Record<string, unknown>, [...path, k]));
}

describe("tokens", () => {
  it("every token is declared verbatim on :root, and every :root --en-* is a token", () => {
    const root = rootDecls();
    for (const t of tokens) expect(root.get(t.cssVar), t.cssVar).toBe(t.css);
    const names = new Set(tokens.map((t) => t.cssVar as string));
    for (const name of root.keys()) if (name !== "--en-transition") expect(names, name).toContain(name);
  });

  it("the DTCG file has a $type and $value on every leaf, in the documented shapes", () => {
    const all = leaves((dtcgTokens() as { entangled: Record<string, unknown> }).entangled);
    expect(all).toHaveLength(tokens.length);
    for (const [path, leaf] of all) {
      expect(leaf.$type, path).toBeTruthy();
      expect(leaf.$value, path).toBeDefined();
      if (leaf.$type === "color") {
        const v = leaf.$value as { colorSpace: string; components: number[]; alpha: number };
        expect(v.components, path).toHaveLength(3);
        expect(v.alpha, path).toBe(1);
      }
      if (leaf.$type === "duration") expect((leaf.$value as { unit: string }).unit, path).toBe("ms");
    }
  });

  it("matches the snapshot", () => {
    expect(JSON.stringify(dtcgTokens(), null, 2)).toMatchSnapshot();
  });
});
