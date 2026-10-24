// Copies the static files of @entangled-ui/presets into dist so the facade can
// export them under its own name.
import { copyFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const dist = (name) => fileURLToPath(new URL(`../dist/${name}`, import.meta.url));
copyFileSync(require.resolve("@entangled-ui/presets/entangled.css"), dist("entangled.css"));
copyFileSync(require.resolve("@entangled-ui/presets/tokens.json"), dist("entangled.tokens.json"));
