// Size check: production library builds (esbuild minify) of what an app
// imports, gzipped, against fixed limits. Resolves the built packages (dist),
// like check-devtools-bundle.mjs, so it needs them built first.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const dir = `${root}.size-check`;
const dist = (pkg) => `${root}packages/${pkg}/dist/index.js`;

const ENTRIES = [
  {
    name: "runtime (createEntangled)",
    code: `import { createEntangled } from "@entangled-ui/core";\nexport const en = () => createEntangled();\n`,
    limitKb: 24,
  },
  {
    name: "runtime + presetStyles",
    code: `import { createEntangled } from "@entangled-ui/core";\nimport { presetStyles } from "@entangled-ui/presets";\nexport const en = () => createEntangled({ styles: presetStyles });\n`,
    limitKb: 30,
  },
  {
    name: "keyMatches + parseKey",
    code: `export { keyMatches, parseKey } from "@entangled-ui/core";\n`,
    limitKb: 1,
  },
  {
    name: "presetsCss",
    code: `export { presetsCss } from "@entangled-ui/presets";\n`,
    limitKb: 6,
  },
];

async function measure(code, i) {
  const entry = `${dir}/entry-${i}.js`;
  writeFileSync(entry, code);
  const out = await build({
    configFile: false,
    root: dir,
    mode: "production",
    logLevel: "silent",
    resolve: { alias: { "@entangled-ui/core": dist("core"), "@entangled-ui/presets": dist("presets") } },
    build: { write: false, minify: "esbuild", lib: { entry, formats: ["es"], fileName: `out-${i}` } },
  });
  const js = (Array.isArray(out) ? out : [out]).flatMap((o) => o.output).map((c) => c.code ?? "").join("");
  return gzipSync(js).length / 1024;
}

process.env.NODE_ENV = "production";
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir);
const results = [];
for (const [i, e] of ENTRIES.entries()) results.push({ ...e, kb: await measure(e.code, i) });
rmSync(dir, { recursive: true, force: true });

const over = results.filter((r) => r.kb > r.limitKb);
const line = results.map((r) => `${r.name} ${r.kb.toFixed(1)} KB (≤ ${r.limitKb})`).join(", ");
if (over.length) {
  console.error(`Size check failed (gzip): ${line}`);
  process.exit(1);
}
console.log(`Size (gzip): ${line}.`);
