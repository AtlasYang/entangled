/**
 * Design tokens: the one source for the `:root` declarations of `baseCss`
 * and for the DTCG 2025.10 token file (`@entangled-ui/presets/tokens.json`).
 */

/** DTCG token types used by Entangled. */
export type TokenType = "color" | "duration" | "cubicBezier" | "number" | "dimension";

/** One public design token. */
export interface TokenSpec {
  /** The CSS custom property, e.g. `--en-color`. */
  readonly cssVar: `--en-${string}`;
  /** Path under the `entangled` group in the DTCG file, e.g. `["color", "base"]`. */
  readonly path: readonly string[];
  readonly type: TokenType;
  /** The value as written on `:root`. */
  readonly css: string;
  /** The DTCG `$value`. */
  readonly value: unknown;
  /** One-sentence description, emitted as the DTCG `$description`. */
  readonly description: string;
}

const oklch = (l: number, c: number, h: number) => ({
  css: `oklch(${l} ${c} ${h})`,
  value: { colorSpace: "oklch", components: [l, c, h], alpha: 1 },
});
const ms = (n: number) => ({ css: `${n}ms`, value: { value: n, unit: "ms" } });
const bezier = (a: number, b: number, c: number, d: number) => ({ css: `cubic-bezier(${a}, ${b}, ${c}, ${d})`, value: [a, b, c, d] });
const num = (n: number) => ({ css: String(n), value: n });

const token = (
  cssVar: TokenSpec["cssVar"],
  path: string,
  type: TokenType,
  v: { css: string; value: unknown },
  description: string,
): TokenSpec => Object.freeze({ cssVar, path: Object.freeze(path.split(".")), type, ...v, description });

/** Every public design token, in `:root` order. */
export const tokens: readonly TokenSpec[] = Object.freeze([
  token("--en-color", "color.base", "color", oklch(0.62, 0.2, 276), "The cue colour: previews, and your own confirms."),
  token("--en-color-2", "color.secondary", "color", oklch(0.76, 0.14, 200), "The secondary cue colour, for gradients and outer rings."),
  token("--en-color-peer", "color.peer", "color", oklch(0.68, 0.19, 35), "Confirms a collaborator caused (unless the actor has a colour)."),
  token("--en-color-system", "color.system", "color", oklch(0.64, 0.11, 195), "Confirms the system caused: timers, server pushes."),
  token("--en-color-source", "color.source", "color", oklch(0.74, 0.16, 80), "Reverse query: the controls that affect what is inspected."),
  token("--en-color-caution", "color.caution", "color", oklch(0.62, 0.21, 27), "Previews of destructive changes."),
  token("--en-wash-light", "color.wash-light", "color", oklch(1, 0, 0), "What washes mix toward on surfaces that encode meaning in their own hue."),
  token("--en-intensity", "number.intensity", "number", num(1), "Effect strength (0-1); the runtime sets it per element after the attention budget."),
  token("--en-duration-preview", "duration.preview", "duration", ms(180), "How long a preview takes to fade in."),
  token("--en-ease-preview", "easing.preview", "cubicBezier", bezier(0.2, 0, 0, 1), "The easing of a preview fading in."),
  token("--en-duration-preview-out", "duration.preview-out", "duration", ms(280), "How long a preview takes to fade out: longer than in, so it never just vanishes."),
  token("--en-ease-preview-out", "easing.preview-out", "cubicBezier", bezier(0.4, 0, 0.6, 1), "The easing of a preview fading out: lingers, then fades."),
  token("--en-duration-confirm", "duration.confirm", "duration", ms(900), "How long an afterglow lasts for your own changes."),
  token("--en-dwell", "duration.dwell", "duration", ms(120), "Hover time before a preview starts."),
  token("--en-radius", "dimension.radius", "dimension", { css: "10px", value: { value: 10, unit: "px" } }, "Corner radius layered effects follow."),
  token("--en-peek-amount", "number.peek-amount", "number", num(0.15), "How much of the future state Token Peek blends in (hard cap 0.35)."),
  token("--en-contract", "number.contract", "number", num(1), "The Cue Contract version these tokens and effects follow."),
]);

/** `:root` declarations for `baseCss`. */
export function tokenDeclarations(): string {
  return tokens.map((t) => `${t.cssVar}: ${t.css};`).join("\n    ");
}

/** The DTCG 2025.10 token file (`dist/entangled.tokens.json`). */
export function dtcgTokens(): Record<string, unknown> {
  const group: Record<string, unknown> = { $description: "Entangled cue tokens (Cue Contract v1)." };
  for (const t of tokens) {
    let node = group;
    for (const seg of t.path.slice(0, -1)) node = (node[seg] ??= {}) as Record<string, unknown>;
    node[t.path[t.path.length - 1]!] = {
      $type: t.type,
      $value: t.value,
      $description: t.description,
      $extensions: { "dev.entangled": { cssVar: t.cssVar } },
    };
  }
  return { entangled: group };
}
