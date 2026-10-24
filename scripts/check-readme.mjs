// Type-checks every ```ts / ```tsx block in README.md, docs/*.md and
// docs/api/*.md against the package sources, so documented examples can't
// drift from the API. Signature fences (```ts sig) are skipped.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dir = `${root}.readme-check`;
const mds = (d) => (existsSync(`${root}${d}`) ? readdirSync(`${root}${d}`).filter((f) => f.endsWith(".md")).sort().map((f) => `${d}/${f}`) : []);
const docs = ["README.md", ...mds("docs"), ...mds("docs/api")];

const blocks = docs.flatMap((file) =>
  [...readFileSync(`${root}${file}`, "utf8").matchAll(/```(tsx?)\n([\s\S]*?)```/g)].map((m) => ({ file, lang: m[1], code: m[2] })),
);
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir);
blocks.forEach((b, i) => {
  // `export {}` makes every block a module so blocks don't collide.
  const name = `${b.file.replace(/\W+/g, "-").replace(/-md$/, "")}-${String(i + 1).padStart(2, "0")}`;
  writeFileSync(`${dir}/${name}.${b.lang}`, `// ${b.file}\n${b.code}\nexport {};\n`);
});
writeFileSync(
  `${dir}/tsconfig.json`,
  JSON.stringify(
    {
      extends: "../tsconfig.base.json",
      compilerOptions: {
        noEmit: true,
        composite: false,
        declaration: false,
        declarationMap: false,
        jsx: "react-jsx",
        noUnusedLocals: false,
        types: [],
        paths: {
          "@entangled-ui/core": ["../packages/core/src/index.ts"],
          "@entangled-ui/core/auto": ["../packages/core/src/auto.ts"],
          "@entangled-ui/presets": ["../packages/presets/src/index.ts"],
          "@entangled-ui/react": ["../packages/react/src/index.ts"],
          "@entangled-ui/devtools": ["../packages/devtools/src/index.ts"],
          "@entangled-ui/devtools/always": ["../packages/devtools/src/index.ts"],
          "entangled-ui": ["../packages/entangled-ui/src/index.ts"],
          "entangled-ui/auto": ["../packages/entangled-ui/src/auto.ts"],
          "entangled-ui/react": ["../packages/entangled-ui/src/react.ts"],
          "entangled-ui/presets": ["../packages/entangled-ui/src/presets.ts"],
          "entangled-ui/devtools": ["../packages/entangled-ui/src/devtools.ts"],
          "entangled-ui/devtools/always": ["../packages/entangled-ui/src/devtools-always.ts"],
          "@/components/ui/*": ["../registry/registry/entangled/*"],
          "@/lib/utils": ["../registry/lib/utils.ts"],
        },
      },
      include: ["*.ts", "*.tsx"],
    },
    null,
    2,
  ),
);

try {
  execFileSync("pnpm", ["exec", "tsc", "-p", dir], { cwd: root, stdio: "inherit" });
  rmSync(dir, { recursive: true, force: true });
  console.log(`README + docs: ${blocks.length} code blocks type-check.`);
} catch {
  console.error(`README + docs: type errors above (sources in ${dir}).`);
  process.exit(1);
}
