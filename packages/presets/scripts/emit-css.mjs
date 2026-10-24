// Writes dist/entangled.css and dist/entangled.tokens.json from the compiled
// module so the static files and the injected sheets can never drift apart.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dtcgTokens, presetsCss } from "../dist/index.js";

const dist = (name) => fileURLToPath(new URL(`../dist/${name}`, import.meta.url));
writeFileSync(dist("entangled.css"), presetsCss);
writeFileSync(dist("entangled.tokens.json"), JSON.stringify(dtcgTokens(), null, 2) + "\n");
