// API reference coverage: every public export, every data-en-* attribute and
// every public --en-* custom property has an entry in docs/api/*, and no entry
// names something that no longer exists.
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const ts = createRequire(`${root}package.json`)("typescript");
const read = (p) => readFileSync(`${root}${p}`, "utf8");

const ENTRIES = {
  core: "packages/core/src/index.ts",
  auto: "packages/core/src/auto.ts",
  react: "packages/react/src/index.ts",
  presets: "packages/presets/src/index.ts",
  devtools: "packages/devtools/src/index.ts",
};
const DOC_OF = { core: "core.md", auto: "core.md", react: "react.md", presets: "presets.md", devtools: "devtools.md" };

const program = ts.createProgram(
  Object.values(ENTRIES).map((e) => `${root}${e}`),
  {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
    baseUrl: root,
    paths: {
      "@entangled-ui/core": ["packages/core/src/index.ts"],
      "@entangled-ui/core/auto": ["packages/core/src/auto.ts"],
      "@entangled-ui/presets": ["packages/presets/src/index.ts"],
      "@entangled-ui/react": ["packages/react/src/index.ts"],
      "@entangled-ui/devtools": ["packages/devtools/src/index.ts"],
    },
    skipLibCheck: true,
    noEmit: true,
  },
);
const checker = program.getTypeChecker();
const exportsOf = (entry) => {
  const sf = program.getSourceFile(`${root}${entry}`);
  return checker.getExportsOfModule(checker.getSymbolAtLocation(sf)).map((s) => s.getName());
};
const exported = Object.fromEntries(Object.entries(ENTRIES).map(([k, e]) => [k, exportsOf(e)]));
exported.auto = exported.auto.filter((n) => !exported.core.includes(n));

/** Backticked names in `##`-`####` headings, plus `## Re-exports` list items in react.md. */
function covered(file) {
  const path = `docs/api/${file}`;
  if (!existsSync(`${root}${path}`)) return new Set();
  const md = read(path);
  const names = new Set([...md.matchAll(/^#{2,4} `([^`]+)`/gm)].map((m) => m[1]));
  const re = md.split(/^## Re-exports\s*$/m)[1];
  if (re) for (const m of re.split(/^## /m)[0].matchAll(/^- \[?`([^`]+)`/gm)) names.add(m[1]);
  return names;
}

const problems = [];
let exportsCount = 0;
for (const [pkg, names] of Object.entries(exported)) {
  const docs = covered(DOC_OF[pkg]);
  for (const n of names) {
    exportsCount++;
    if (!docs.has(n)) problems.push(`missing: ${DOC_OF[pkg]} has no entry for ${pkg === "auto" ? "@entangled-ui/core/auto " : ""}\`${n}\``);
  }
}
// Stale entries: headings naming something that isn't exported (methods, attributes and variables
// aside).
const byDoc = {};
for (const [pkg, names] of Object.entries(exported)) for (const n of names) (byDoc[DOC_OF[pkg]] ??= new Set()).add(n);
for (const [file, names] of Object.entries(byDoc)) {
  for (const n of covered(file)) {
    if (n.includes(".") || n.includes("(") || n.startsWith("@") || n.startsWith("data-en") || n.startsWith("--en")) continue;
    if (!names.has(n)) problems.push(`stale: ${file} documents \`${n}\`, which is not exported`);
  }
}

// Attributes.
const dom = read("packages/core/src/dom.ts");
const attrBlock = /export const ATTR = \{([\s\S]*?)\} as const;/.exec(dom)[1];
const attrs = [...new Set([...attrBlock.matchAll(/"(data-en-[a-z-]+)"/g)].map((m) => m[1])), "data-en-sheet", "data-en-announcer"];
const htmlDocs = covered("html.md");
for (const a of attrs) if (!htmlDocs.has(a)) problems.push(`missing: html.md has no \`### \`${a}\`\` entry`);

// Custom properties.
const presetsSrc = ["packages/presets/src/index.ts", "packages/presets/src/tokens.ts"].map(read).join("\n");
const varsBlock = /export const VARS = \{([\s\S]*?)\} as const;/.exec(dom)[1];
const vars = new Set([...`${presetsSrc}\n${varsBlock}`.matchAll(/--en-[a-z0-9-]+/g)].map((m) => m[0]));
// Generated names are documented by pattern.
for (const v of [...vars]) if (/^--en-(int|pint|base|next)-$/.test(v)) vars.delete(v);
const cssDocs = covered("css.md");
for (const v of vars) if (!cssDocs.has(v)) problems.push(`missing: css.md has no \`### \`${v}\`\` entry`);
for (const p of ["--en-int-<key>", "--en-pint-<key>", "--en-base-<token>", "--en-next-<token>"]) {
  if (!cssDocs.has(p)) problems.push(`missing: css.md has no \`### \`${p}\`\` entry`);
}

if (problems.length) {
  console.error(`API docs: ${problems.length} problems:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(`API docs: ${exportsCount} exports, ${attrs.length} attributes, ${vars.size} variables documented.`);
