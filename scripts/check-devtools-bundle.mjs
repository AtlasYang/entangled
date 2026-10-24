// Bundle-size check: an app importing @entangled-ui/devtools must not ship it
// in production. Builds a tiny consumer with Vite in production and
// development mode (resolving the package's export conditions exactly like an
// app would) and checks what ends up in the bundle. Needs packages built.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const dir = `${root}.devtools-check`;
const MARKER = "entangled-devtools"; // the panel's custom element name
const PROD_MAX_BYTES = 200;

rmSync(dir, { recursive: true, force: true });
mkdirSync(dir);
writeFileSync(
  `${dir}/entry.js`,
  `import { mountDevtools } from "@entangled-ui/devtools";\nexport const boot = (runtime) => mountDevtools(runtime, { open: true });\n`,
);

async function bundle(mode) {
  process.env.NODE_ENV = mode;
  const out = await build({
    configFile: false,
    root: dir,
    mode,
    logLevel: "silent",
    build: { write: false, minify: true, lib: { entry: `${dir}/entry.js`, formats: ["es"], fileName: "out" } },
  });
  const code = (Array.isArray(out) ? out : [out]).flatMap((o) => o.output).map((c) => c.code ?? "").join("");
  return { code, bytes: Buffer.byteLength(code), gzip: gzipSync(code).length };
}

const prod = await bundle("production");
const dev = await bundle("development");
rmSync(dir, { recursive: true, force: true });

const failures = [];
if (prod.code.includes(MARKER)) failures.push("production bundle contains the DevTools panel");
if (prod.bytes > PROD_MAX_BYTES) failures.push(`production bundle is ${prod.bytes} B (max ${PROD_MAX_BYTES} B)`);
if (!dev.code.includes(MARKER)) failures.push("development bundle is missing the DevTools panel");
if (failures.length) {
  console.error(`DevTools bundle check failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`DevTools bundle: production ${prod.bytes} B (no-op), development ${(dev.bytes / 1024).toFixed(1)} KB (${(dev.gzip / 1024).toFixed(1)} KB gzip).`);
