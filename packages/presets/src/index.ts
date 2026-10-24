/**
 * Effect presets for Entangled.
 *
 * Contract (identical in CSS and JS runtime modes):
 * - `--en-preview` (0-1, registered, transitions): preview strength. It fades
 *   in with `--en-duration-preview` / `--en-ease-preview` and out with
 *   `--en-duration-preview-out` / `--en-ease-preview-out`: a salient element
 *   (`[data-en-state]`, or a compiled preview rule) sets the private
 *   `--_en-preview-duration` / `--_en-preview-ease` to the enter timing, and
 *   CSS takes a transition's timing from the style it changes to.
 * - `--en-intensity` (0-1, registered) changes at once on the way in and is
 *   held through the fade out (`--_en-intensity-timing`), so an effect
 *   habituation weakened never brightens as it leaves. It is the attention-budget weight.
 * - `[data-en-state="confirm"]`: confirm animation is running
 * - `[data-en-fx="<preset>"]`: resolved preset, set at registration time
 * - `--en-fx-color` / `--en-fx-color-2`: the colors to paint with, which are
 *   `--en-color` / `--en-color-2` except during a peer or system confirm
 * - `[data-en-origin="self|peer|system"]`: who caused a running confirm
 * - `--en-peek` (0-1, registered, transitions after the dwell): Token Peek blend
 * - `[data-en-delta]`: Value Peek text, drawn as a chip on `::after`
 * - `--en-source` (0-1, registered) under `:root[data-en-query]`: reverse query source
 * - `[data-en-channel~="hue|outline|shadow"]`: visual channels the host already
 *   uses, which effects avoid; `[data-en-far]`: a confirm or preview far from its cause
 *
 * The full contract (Cue Contract v1) is in `docs/api/css.md`.
 *
 * Layout invariance: presets only touch box-shadow, outline, color and
 * text-shadow, opacity/transform/background on decorative pseudo-elements of
 * opt-in `[data-en-layer]` hosts, `filter` on replaced elements and SVG
 * graphics (which have no CSS boxes inside whose containing block could
 * change), and stroke/fill/stroke-width on SVG graphics with `data-en-paint`.
 * Everything lives in `@layer entangled`, so any unlayered author CSS wins.
 *
 * To keep an element's own box-shadow alongside effects, set it through
 * `--en-base-shadow` instead of `box-shadow`. To keep its own transitions,
 * append `var(--en-transition)` to its `transition` list.
 */

import { tokenDeclarations } from "./tokens.js";

export { type TokenSpec, type TokenType, dtcgTokens, tokenDeclarations, tokens } from "./tokens.js";

/** A named stylesheet the runtime injects. */
export interface StyleSheetSpec {
  /** Unique sheet name, e.g. `"base"` or `"effect:ring"`. */
  name: string;
  /** The sheet's CSS. */
  css: string;
}

/** Built-in effect presets. */
export type PresetName =
  | "sweep"
  | "ring"
  | "inset"
  | "tint"
  | "veil"
  | "pulse"
  | "outline"
  | "row"
  | "block"
  | "stroke"
  | "glyph"
  | "cell";
/** All built-in preset names, in injection order. */
export const presetNames: readonly PresetName[] = [
  "sweep",
  "ring",
  "inset",
  "tint",
  "veil",
  "pulse",
  "outline",
  "row",
  "block",
  "stroke",
  "glyph",
  "cell",
];

/** `color-mix` of a token with transparent at a calc()'d percentage. */
const mix = (color: string, pct: string) => `color-mix(in oklab, ${color} calc(${pct}), transparent)`;
const A = "var(--_en-a)";
const I = "var(--en-intensity)";
const BASE_SHADOW = "var(--en-base-shadow, 0 0 #0000)";
const EASE = "cubic-bezier(0.2, 0, 0, 1)";
/** Leaving: lingers a moment, then fades, so the eye sees where the preview was. */
const EASE_OUT = "cubic-bezier(0.4, 0, 0.6, 1)";
/** The preview's timing: enter while salient, exit otherwise (see the contract above). */
const PREVIEW_TIMING =
  "var(--_en-preview-duration, var(--en-duration-preview-out)) var(--_en-preview-ease, var(--en-ease-preview-out))";
const MEDIA = ":is(img, video, canvas, picture, svg, iframe)";
/**
 * The transitions effects rely on. Exposed as `--en-transition` so a host that
 * declares its own `transition` (which replaces this one) can append it.
 */
const TRANSITION = `--en-preview ${PREVIEW_TIMING}, --en-intensity var(--_en-intensity-timing, var(--en-duration-preview-out) step-end), --en-peek var(--en-duration-preview) ${EASE} var(--en-dwell), --en-source var(--en-duration-preview) ${EASE}`;
const LAYER_AFTER = (fx: string) => `[data-en-layer][data-en-fx="${fx}"]::after`;
const LAYER_BEFORE = (fx: string) => `[data-en-layer][data-en-fx="${fx}"]::before`;
/**
 * SVG graphics elements: no CSS boxes inside, so `filter` and SVG paint properties are layout-safe.
 */
const SVG = ":is(svg, g, path, circle, ellipse, line, polygon, polyline, rect, text, use)";
/** The wash colour (lighter on `hue` channel hosts) and its alpha scale. */
const WASH = "var(--_en-wash)";
const WS = "var(--_en-wash-scale)";
const CONFIRM = (fx: string) => `[data-en-fx="${fx}"][data-en-state="confirm"]`;
/**
 * The orienting stage: appended to every host confirm animation (see `baseCss`), except on SVG
 * graphics, which draw no outline.
 */
const ORIENT = "var(--_en-orient)";

/**
 * `@property` registrations, cascade layers, default tokens, origin colors, the actor badge and
 * the overlay.
 *
 * In the CSS:
 * - Design tokens (see tokens.ts). Self confirms use --en-color unless --en-color-self is set.
 *   Fading out takes longer than fading in, so a preview never just vanishes. Peek blends at most
 *   0.35.
 * - A host with a transition of its own replaces the one set here, so it appends the effect
 *   transitions: `transition: background 120ms, var(--en-transition);`.
 * - Every target resets the effect properties so nested targets never inherit an ancestor's
 *   preview.
 * - The intensity a preview had is held until it has faded out.
 * - Orienting stage: a settling outline, noticed in the periphery where a glow isn't.
 * - The chip's +/- prefix is set per kind and never inherited from an outer target.
 * - JS (or the compiled rules) times the preview's dwell; peek waits for it itself.
 *   `--en-transition` is redeclared on each target so durations set on the element itself apply.
 * - Salient targets fade the preview in with the enter timing (compiled rules set it too).
 * - Surfaces that encode meaning in their own hue get a light, high-luminance wash instead.
 * - Previews of destructive changes use the caution colors.
 * - Remote and interrupting confirms, and confirms far from their cause, start with the orienting
 *   stage.
 */
export const baseCss = /* css */ `@property --en-preview {
  syntax: "<number>";
  inherits: true;
  initial-value: 0;
}

@property --en-peek {
  syntax: "<number>";
  inherits: true;
  initial-value: 0;
}

@property --en-intensity {
  syntax: "<number>";
  inherits: true;
  initial-value: 1;
}

@property --en-source {
  syntax: "<number>";
  inherits: true;
  initial-value: 0;
}

@layer entangled.base, entangled.effects, entangled.state, entangled.form, entangled.peek, entangled.a11y;

@layer entangled.base {
  :root {
    ${tokenDeclarations()}
    --en-transition: ${TRANSITION};
  }

  [data-en-fx] {
    --en-preview: 0;
    --en-peek: 0;
    --en-source: 0;
    --en-fx-color: var(--en-color);
    --en-fx-color-2: var(--en-color-2);
    --_en-a: calc(var(--en-preview) * var(--en-intensity));
    --_en-preview-duration: var(--en-duration-preview-out);
    --_en-preview-ease: var(--en-ease-preview-out);
    --_en-intensity-timing: var(--en-duration-preview-out) step-end;
    --_en-orient: none;
    --_en-orient-offset: 3px;
    --_en-wash: var(--en-fx-color);
    --_en-wash-scale: 1;
    --_en-kind-glyph: "";
    --en-transition: ${TRANSITION};
    transition: var(--en-transition);
  }
  [data-en-fx][data-en-state] {
    --_en-preview-duration: var(--en-duration-preview);
    --_en-preview-ease: var(--en-ease-preview);
    --_en-intensity-timing: 0s;
  }

  [data-en-fx][data-en-channel~="hue"] {
    --_en-wash: color-mix(in oklab, var(--en-fx-color) 25%, var(--en-wash-light));
    --_en-wash-scale: 2.5;
  }
  [data-en-fx][data-en-tone="caution"] {
    --en-fx-color: var(--en-color-caution);
    --en-fx-color-2: color-mix(in oklab, var(--en-color-caution) 55%, white);
  }

  [data-en-fx][data-en-state="confirm"]:is([data-en-notify="interrupt"], [data-en-far], [data-en-origin="peer"], [data-en-origin="system"]):not([data-en-notify="quiet"], [data-en-channel~="outline"], :focus-visible) {
    --_en-orient: en-orient 420ms ${EASE};
  }
  @keyframes en-orient {
    0% { outline-style: solid; outline-width: 0px; outline-color: transparent; outline-offset: calc(var(--_en-orient-offset) + 6px); }
    35% { outline-style: solid; outline-width: 3px; outline-color: var(--en-fx-color); outline-offset: var(--_en-orient-offset); }
    100% { outline-style: solid; outline-width: 0px; outline-color: transparent; outline-offset: var(--_en-orient-offset); }
  }

  [data-en-fx][data-en-origin="self"] {
    --en-fx-color: var(--en-color-self, var(--en-color));
  }
  [data-en-fx][data-en-origin="peer"] {
    --en-fx-color: var(--en-actor-color, var(--en-color-peer));
    --en-fx-color-2: color-mix(in oklab, var(--en-fx-color) 55%, white);
  }
  [data-en-fx][data-en-origin="system"] {
    --en-fx-color: var(--en-color-system);
    --en-fx-color-2: color-mix(in oklab, var(--en-fx-color) 55%, white);
  }

  [data-en-layer][data-en-fx]::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    opacity: 0;
  }

  [data-en-overlay] {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 2147483646;
    contain: strict;
  }
}
`;

// Layered hosts get a true gradient ring on a decorative pseudo-element.
const ring = /* css */ `@layer entangled.effects {
  [data-en-fx="ring"] {
    --en-active-preset: ring;
    box-shadow:
      0 0 0 2px ${mix("var(--en-fx-color)", `${A} * 100%`)},
      0 0 0 5px ${mix("var(--en-fx-color-2)", `${A} * 35%`)},
      ${BASE_SHADOW};
  }
  ${CONFIRM("ring")} {
    animation: en-ring-confirm var(--en-duration-confirm) ${EASE}, ${ORIENT};
  }
  @keyframes en-ring-confirm {
    0% {
      box-shadow: 0 0 0 0 ${mix("var(--en-fx-color)", `${I} * 90%`)}, 0 0 0 0 ${mix("var(--en-fx-color-2)", `${I} * 50%`)}, ${BASE_SHADOW};
    }
    30% {
      box-shadow: 0 0 0 2px ${mix("var(--en-fx-color)", `${I} * 100%`)}, 0 0 0 6px ${mix("var(--en-fx-color-2)", `${I} * 45%`)}, ${BASE_SHADOW};
    }
    100% {
      box-shadow: 0 0 0 2px transparent, 0 0 0 10px transparent, ${BASE_SHADOW};
    }
  }

  [data-en-layer][data-en-fx="ring"] {
    box-shadow: 0 0 0 4px ${mix("var(--en-fx-color-2)", `${A} * 22%`)}, ${BASE_SHADOW};
  }
  ${LAYER_AFTER("ring")} {
    inset: -3px;
    padding: 2px;
    border-radius: calc(var(--en-radius) + 3px);
    background: linear-gradient(135deg, var(--en-fx-color), var(--en-fx-color-2));
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
    mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
    opacity: ${A};
  }
  [data-en-layer]${CONFIRM("ring")} {
    animation: ${ORIENT};
  }
  [data-en-layer]${CONFIRM("ring")}::after {
    animation: en-layer-ring var(--en-duration-confirm) ${EASE};
  }
  @keyframes en-layer-ring {
    0% { opacity: 0; transform: scale(1.08); }
    25% { opacity: ${I}; transform: scale(1); }
    70% { opacity: ${I}; }
    100% { opacity: 0; transform: scale(1); }
  }
}
`;

// Replaced elements have no descendants: filter is layout-safe here.
// Layered hosts get a spatial sweep. The band occupies the middle 30% of a host-sized pseudo-
// element and travels +/-35%, so it never leaves the host's box: no clipping (and no overflow
// change) needed. transform/opacity only.
const sweep = /* css */ `@layer entangled.effects {
  [data-en-fx="sweep"] {
    --en-active-preset: sweep;
    box-shadow:
      0 0 0 2px ${mix("var(--en-fx-color)", `${A} * 70%`)},
      0 10px 28px -8px ${mix("var(--en-fx-color-2)", `${A} * 55%`)},
      ${BASE_SHADOW};
  }
  ${CONFIRM("sweep")} {
    animation: en-sweep-glow var(--en-duration-confirm) ${EASE}, ${ORIENT};
  }
  ${MEDIA}${CONFIRM("sweep")} {
    animation: en-sweep-glow var(--en-duration-confirm) ${EASE}, en-sweep-light var(--en-duration-confirm) ${EASE}, ${ORIENT};
  }
  @keyframes en-sweep-glow {
    0% { box-shadow: 0 0 0 0 ${mix("var(--en-fx-color)", `${I} * 80%`)}, 0 0 0 0 transparent, ${BASE_SHADOW}; }
    35% { box-shadow: 0 0 0 3px ${mix("var(--en-fx-color)", `${I} * 80%`)}, 0 12px 36px -6px ${mix("var(--en-fx-color-2)", `${I} * 60%`)}, ${BASE_SHADOW}; }
    100% { box-shadow: 0 0 0 3px transparent, 0 12px 36px -6px transparent, ${BASE_SHADOW}; }
  }
  @keyframes en-sweep-light {
    0%, 100% { filter: none; }
    35% { filter: brightness(calc(1 + ${I} * 0.12)) saturate(calc(1 + ${I} * 0.1)); }
  }

  ${LAYER_AFTER("sweep")} {
    background: linear-gradient(
      105deg,
      transparent 35%,
      color-mix(in oklab, white 55%, var(--en-fx-color-2)) 50%,
      transparent 65%
    );
  }
  [data-en-layer]${CONFIRM("sweep")}::after {
    animation: en-sweep var(--en-duration-confirm) cubic-bezier(0.3, 0, 0.2, 1);
  }
  @keyframes en-sweep {
    0% { transform: translateX(-35%); opacity: 0; }
    20% { opacity: calc(${I} * 0.75); }
    80% { opacity: calc(${I} * 0.75); }
    100% { transform: translateX(35%); opacity: 0; }
  }
}
`;

/**
 * Inside the box, above the content: for hosts that clip their overflow or sit
 * flush against their neighbours (timelines, tables, grids), where an outer
 * ring is cut off or lands on the next element. An outline with a negative
 * offset paints over the host's children and never leaves its box. Focused
 * hosts keep the browser's focus ring instead.
 *
 * In the CSS:
 * - Hosts that use outline for their own states (selection): the ring is an inset box-shadow.
 */
const inset = /* css */ `@layer entangled.effects {
  [data-en-fx="inset"] {
    --en-active-preset: inset;
    --_en-orient-offset: -2px;
  }
  [data-en-fx="inset"]:not(:focus-visible, [data-en-channel~="outline"]) {
    outline: 2px solid ${mix("var(--en-fx-color)", `${A} * 100%`)};
    outline-offset: -2px;
    box-shadow: inset 0 0 0 100vmax ${mix(WASH, `${A} * 8% * ${WS}`)}, ${BASE_SHADOW};
  }
  ${CONFIRM("inset")}:not(:focus-visible, [data-en-channel~="outline"]) {
    animation: en-inset-confirm var(--en-duration-confirm) ${EASE}, ${ORIENT};
  }
  [data-en-fx="inset"][data-en-channel~="outline"]:not(:focus-visible) {
    box-shadow: inset 0 0 0 2px ${mix("var(--en-fx-color)", `${A} * 100%`)}, inset 0 0 0 100vmax ${mix(WASH, `${A} * 8% * ${WS}`)}, ${BASE_SHADOW};
  }
  [data-en-fx="inset"][data-en-channel~="outline"][data-en-state="confirm"]:not(:focus-visible) {
    animation: en-inset-shadow-confirm var(--en-duration-confirm) ${EASE};
  }
  @keyframes en-inset-shadow-confirm {
    0%, 30% { box-shadow: inset 0 0 0 2px ${mix("var(--en-fx-color)", `${I} * 100%`)}, ${BASE_SHADOW}; }
    100% { box-shadow: inset 0 0 0 2px transparent, ${BASE_SHADOW}; }
  }
  @keyframes en-inset-confirm {
    0% { outline-color: ${mix("var(--en-fx-color)", `${I} * 100%`)}; outline-offset: -6px; }
    30% { outline-color: ${mix("var(--en-fx-color)", `${I} * 100%`)}; outline-offset: -2px; }
    100% { outline-color: transparent; outline-offset: -2px; }
  }
}
`;

// Inset shadows paint above the background and below content.
const tint = /* css */ `@layer entangled.effects {
  [data-en-fx="tint"] {
    --en-active-preset: tint;
    box-shadow:
      inset 0 0 0 100vmax ${mix(WASH, `${A} * 9% * ${WS}`)},
      0 0 0 1px ${mix("var(--en-fx-color)", `${A} * 40%`)},
      ${BASE_SHADOW};
  }
  ${CONFIRM("tint")} {
    animation: en-tint var(--en-duration-confirm) ${EASE}, ${ORIENT};
  }
  @keyframes en-tint {
    0% { box-shadow: inset 0 0 0 100vmax ${mix(WASH, `${I} * 16% * ${WS}`)}, 0 0 0 1px ${mix("var(--en-fx-color)", `${I} * 60%`)}, ${BASE_SHADOW}; }
    100% { box-shadow: inset 0 0 0 100vmax transparent, 0 0 0 1px transparent, ${BASE_SHADOW}; }
  }
}
`;

// Global impact: drawn once by the fixed overlay; opacity-only (compositor).
const veil = /* css */ `@layer entangled.effects {
  [data-en-overlay] {
    --en-active-preset: veil;
    background:
      radial-gradient(130% 90% at 50% 0%, ${mix("var(--en-fx-color)", "22%")}, transparent 65%),
      ${mix("var(--en-fx-color)", "4%")};
    opacity: calc(var(--en-preview) * ${I} * 0.6);
    transition: opacity ${PREVIEW_TIMING};
  }
  [data-en-overlay][data-en-state="confirm"] {
    animation: en-veil var(--en-duration-confirm) ${EASE};
  }
  @keyframes en-veil {
    0% { opacity: 0; }
    25% { opacity: calc(${I} * 0.9); }
    100% { opacity: 0; }
  }
}
`;

const pulse = /* css */ `@layer entangled.effects {
  [data-en-fx="pulse"] {
    --en-active-preset: pulse;
    box-shadow: 0 0 0 2px ${mix("var(--en-fx-color)", `${A} * 80%`)}, ${BASE_SHADOW};
  }
  ${CONFIRM("pulse")} {
    animation: en-pulse calc(var(--en-duration-confirm) * 0.7) ${EASE}, ${ORIENT};
  }
  @keyframes en-pulse {
    0% { box-shadow: 0 0 0 0 ${mix("var(--en-fx-color)", `${I} * 70%`)}, ${BASE_SHADOW}; }
    100% { box-shadow: 0 0 0 12px transparent, ${BASE_SHADOW}; }
  }
  ${LAYER_AFTER("pulse")} {
    box-shadow: 0 0 0 2px var(--en-fx-color);
  }
  [data-en-layer]${CONFIRM("pulse")} {
    animation: ${ORIENT};
  }
  [data-en-layer]${CONFIRM("pulse")}::after {
    animation: en-layer-pulse calc(var(--en-duration-confirm) * 0.7) ${EASE};
  }
  @keyframes en-layer-pulse {
    0% { opacity: ${I}; transform: scale(1); }
    100% { opacity: 0; transform: scale(1.12); }
  }
}
`;

const outlineDecl = (strength: string) =>
  `box-shadow: 0 0 0 2px ${mix("var(--en-fx-color)", `${strength} * 100%`)}, ${BASE_SHADOW};`;

// Static: no transition, no animation. Also the reduced-motion fallback.
// transition-duration: 0s keeps transition-delay, which is the dwell.
const outline = /* css */ `@layer entangled.effects {
  [data-en-fx="outline"] {
    --en-active-preset: outline;
    transition-duration: 0s;
    ${outlineDecl("var(--en-preview)")}
  }
  ${CONFIRM("outline")} {
    ${outlineDecl("1")}
  }
}
`;

/**
 * List rows, inspector rows, menu items: a wash across the row that bleeds 6px into the gutters.
 */
const rowWash = (a: string, pct: string) => mix(WASH, `${a} * ${pct} * ${WS}`);
// A host that colours its label itself moves that colour to --en-label-base.
const row = /* css */ `@layer entangled.effects {
  [data-en-fx="row"] {
    --en-active-preset: row;
    --_en-row: ${rowWash(A, "9%")};
    box-shadow: -6px 0 0 0 var(--_en-row), 6px 0 0 0 var(--_en-row), inset 0 0 0 100vmax var(--_en-row), ${BASE_SHADOW};
  }
  [data-en-fx="row"] [data-en-part~="label"] {
    color: color-mix(in oklab, var(--en-fx-color) calc(var(--en-preview) * 100%), var(--en-label-base, currentColor));
  }
  ${CONFIRM("row")} {
    animation: en-row-confirm var(--en-duration-confirm) ${EASE}, ${ORIENT};
  }
  @keyframes en-row-confirm {
    0%, 30% { box-shadow: -6px 0 0 0 ${rowWash(I, "12%")}, 6px 0 0 0 ${rowWash(I, "12%")}, inset 0 0 0 100vmax ${rowWash(I, "12%")}, ${BASE_SHADOW}; }
    100% { box-shadow: -6px 0 0 0 transparent, 6px 0 0 0 transparent, inset 0 0 0 100vmax transparent, ${BASE_SHADOW}; }
  }
}
`;

/**
 * Timeline clips, kanban cards, tiles: a flood over the content on `::before`
 * for layered hosts, an inset wash under the content otherwise.
 * `--en-block-z` lifts the flood above positioned children.
 */
const block = /* css */ `@layer entangled.effects {
  [data-en-fx="block"] {
    --en-active-preset: block;
    box-shadow: inset 0 0 0 100vmax ${mix(WASH, `${A} * 14% * ${WS}`)}, ${BASE_SHADOW};
  }
  [data-en-layer][data-en-fx="block"] {
    box-shadow: ${BASE_SHADOW};
  }
  ${LAYER_BEFORE("block")} {
    content: "";
    position: absolute;
    inset: 0;
    z-index: var(--en-block-z, auto);
    border-radius: inherit;
    pointer-events: none;
    background: ${mix(WASH, `${A} * 24% * ${WS}`)};
  }
  ${CONFIRM("block")} {
    animation: en-block-confirm var(--en-duration-confirm) ${EASE}, ${ORIENT};
  }
  [data-en-layer]${CONFIRM("block")} {
    animation: ${ORIENT};
  }
  [data-en-layer]${CONFIRM("block")}::before {
    animation: en-block-flood var(--en-duration-confirm) ease-out;
  }
  @keyframes en-block-confirm {
    0%, 20% { box-shadow: inset 0 0 0 100vmax ${mix(WASH, `${I} * 22% * ${WS}`)}, ${BASE_SHADOW}; }
    100% { box-shadow: inset 0 0 0 100vmax transparent, ${BASE_SHADOW}; }
  }
  @keyframes en-block-flood {
    0%, 20% { background: ${mix(WASH, `${I} * 38% * ${WS}`)}; }
    100% { background: transparent; }
  }
}
`;

/**
 * SVG handles, chart marks, diagram edges: a glow, plus colour and width
 * opted in per paint (`data-en-paint="stroke fill"`), because author CSS
 * `stroke`/`fill` overrides SVG presentation attributes. The host moves its
 * colours to `--en-stroke-base` / `--en-fill-base` / `--en-stroke-width-base`.
 */
const stroke = /* css */ `@layer entangled.effects {
  ${SVG}[data-en-fx="stroke"] {
    --en-active-preset: stroke;
    filter: drop-shadow(0 0 calc(${A} * 4px) ${mix("var(--en-fx-color)", `${A} * 100%`)});
  }
  ${SVG}[data-en-fx="stroke"][data-en-paint~="stroke"] {
    stroke: color-mix(in oklab, var(--en-fx-color) calc(var(--en-preview) * 100%), var(--en-stroke-base, currentColor));
    stroke-width: calc(var(--en-stroke-width-base, 1px) + var(--en-preview) * 1px);
  }
  ${SVG}[data-en-fx="stroke"][data-en-paint~="fill"] {
    fill: color-mix(in oklab, var(--en-fx-color) calc(var(--en-preview) * 100%), var(--en-fill-base, currentColor));
  }
  ${SVG}${CONFIRM("stroke")} {
    animation: en-stroke-confirm var(--en-duration-confirm) ${EASE};
  }
  @keyframes en-stroke-confirm {
    30% { filter: drop-shadow(0 0 4px ${mix("var(--en-fx-color)", `${I} * 100%`)}) drop-shadow(0 0 2px ${mix("var(--en-fx-color)", `${I} * 100%`)}); }
  }
}
`;

/**
 * Icons, keyframe diamonds, status dots, inline text: the glyph takes the cue
 * colour. For elements that inherit their colour (`currentColor` icons, text),
 * or that set `--en-glyph-base` to their own.
 */
const glyph = /* css */ `@layer entangled.effects {
  [data-en-fx="glyph"] {
    --en-active-preset: glyph;
    color: color-mix(in oklab, var(--en-fx-color) calc(var(--en-preview) * 100%), var(--en-glyph-base, currentColor));
    text-shadow: 0 0 calc(${A} * 6px) ${mix("var(--en-fx-color)", `${A} * 80%`)};
  }
  ${CONFIRM("glyph")} {
    animation: en-glyph-confirm var(--en-duration-confirm) ${EASE}, ${ORIENT};
  }
  @keyframes en-glyph-confirm {
    0%, 30% { color: var(--en-fx-color); text-shadow: 0 0 6px ${mix("var(--en-fx-color)", `${I} * 80%`)}; }
  }
}
`;

/** Dense grids and tables, where an outer ring is noise: a wash and a hairline inside the cell. */
const cell = /* css */ `@layer entangled.effects {
  [data-en-fx="cell"] {
    --en-active-preset: cell;
    box-shadow: inset 0 0 0 100vmax ${mix(WASH, `${A} * 14% * ${WS}`)}, inset 0 0 0 1px ${mix("var(--en-fx-color)", `${A} * 60%`)}, ${BASE_SHADOW};
  }
  ${CONFIRM("cell")} {
    animation: en-cell-confirm var(--en-duration-confirm) ${EASE}, ${ORIENT};
  }
  @keyframes en-cell-confirm {
    0%, 20% { box-shadow: inset 0 0 0 100vmax ${mix(WASH, `${I} * 22% * ${WS}`)}, inset 0 0 0 1px ${mix("var(--en-fx-color)", `${I} * 80%`)}, ${BASE_SHADOW}; }
    100% { box-shadow: inset 0 0 0 100vmax transparent, inset 0 0 0 1px transparent, ${BASE_SHADOW}; }
  }
}
`;

/**
 * Reverse query (`source`): while the modifier is held, the writers that
 * affect the inspected element get a dashed outline, unlike any preview or
 * confirm, drawing in as its offset closes. Outline only: paint, no layout.
 * The browser's own focus ring is never replaced.
 */
export const sourceCss = /* css */ `@layer entangled.effects {
  :root[data-en-query] [data-en-affects][data-en-fx]:not(:focus-visible) {
    --en-active-source: dashed;
    outline: calc(var(--en-source) * 2px) dashed var(--en-color-source);
    outline-offset: calc(2px + (1 - var(--en-source)) * 6px);
  }
}
`;

/**
 * Forms: what a cue says beyond "this" (`entangled.form`). Channel fallbacks
 * for hosts that already use box-shadow for themselves; the far channel, an
 * outline that closes in on readers in another region than their cause; and
 * change kinds. Later rules win, so a kind's dashed or dotted outline beats a
 * solid one. Outline only; focused elements keep the browser's focus ring.
 *
 * In the CSS:
 * - Change kinds, distinguishable without colour: removals dashed, disabling dotted.
 * - "may": weaker, never solid.
 */
export const formCss = /* css */ `@layer entangled.form {
  [data-en-fx][data-en-channel~="shadow"]:not(:focus-visible, [data-en-fx="inset"], [data-en-channel~="outline"]) {
    outline: 2px solid color-mix(in oklab, var(--en-fx-color) calc(var(--_en-a) * 100%), transparent);
    outline-offset: var(--_en-orient-offset);
  }
  [data-en-fx][data-en-channel~="shadow"][data-en-state="confirm"]:not(:focus-visible, [data-en-fx="inset"], [data-en-channel~="outline"]) {
    animation: en-outline-confirm var(--en-duration-confirm) ${EASE}, ${ORIENT};
  }
  @keyframes en-outline-confirm {
    0%, 30% { outline-color: color-mix(in oklab, var(--en-fx-color) calc(var(--en-intensity) * 100%), transparent); }
    100% { outline-color: transparent; }
  }

  [data-en-fx][data-en-far]:not(:focus-visible, [data-en-fx="inset"], [data-en-channel~="outline"]) {
    outline: 2px solid color-mix(in oklab, var(--en-fx-color) calc(var(--_en-a) * 100%), transparent);
    outline-offset: var(--_en-orient-offset);
  }
  [data-en-fx][data-en-far][data-en-state="preview"]:not(:focus-visible, [data-en-channel~="outline"]) {
    animation: en-far 520ms ${EASE};
  }
  @keyframes en-far {
    from { outline-offset: calc(var(--_en-orient-offset) + 8px); }
    to { outline-offset: var(--_en-orient-offset); }
  }

  [data-en-fx][data-en-kind="remove"]:not(:focus-visible, [data-en-fx="inset"], [data-en-channel~="outline"]) {
    outline: 2px dashed color-mix(in oklab, var(--en-fx-color) calc(var(--_en-a) * 100%), transparent);
    outline-offset: var(--_en-orient-offset);
  }
  [data-en-fx]:is([data-en-kind="disable"], [data-en-kind="invalidate"]):not(:focus-visible, [data-en-fx="inset"], [data-en-channel~="outline"]) {
    outline: 2px dotted color-mix(in oklab, var(--en-fx-color) calc(var(--_en-a) * 100%), transparent);
    outline-offset: var(--_en-orient-offset);
  }
  [data-en-fx="inset"][data-en-kind="remove"]:not([data-en-channel~="outline"]) {
    outline-style: dashed;
  }
  [data-en-fx="inset"]:is([data-en-kind="disable"], [data-en-kind="invalidate"]):not([data-en-channel~="outline"]) {
    outline-style: dotted;
  }
  [data-en-fx][data-en-certainty="may"] {
    --_en-a: calc(var(--en-preview) * var(--en-intensity) * 0.6);
  }
}
`;

/**
 * Value Peek chip: the change a reader would see (e.g. "-$12"). Drawn on the
 * reader's `::after`, so the reader must be positioned with no `::after` of
 * its own. It sits above the reader's top-right corner and grows up and to
 * the left, where it can't create scrollable overflow. Its own layer comes
 * after the effects, so it replaces a layered effect's pseudo-element while
 * shown. The actor badge lives here too: information beats decoration.
 *
 * In the CSS:
 * - Actor badge: opt-in hosts (positioned, no own ::before) name who made a peer change.
 * - Uncertain: an outlined chip.
 * - Value afterglow: the chip says what changed while the confirm runs, then fades.
 */
export const deltaCss = /* css */ `@layer entangled.peek {
  [data-en-fx][data-en-kind="add"] {
    --_en-kind-glyph: "+\\00a0";
  }
  [data-en-fx][data-en-kind="remove"] {
    --_en-kind-glyph: "\\2212\\00a0";
  }
  [data-en-badge][data-en-actor][data-en-state="confirm"]::before {
    content: attr(data-en-actor);
    position: absolute;
    inset: 4px 4px auto auto;
    z-index: 1;
    max-width: calc(100% - 8px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--en-fx-color);
    color: white;
    font: 600 10px/1.5 system-ui, sans-serif;
    pointer-events: none;
    animation: en-badge var(--en-duration-confirm) ${EASE} both;
  }
  @keyframes en-badge {
    0% { opacity: 0; transform: translateY(2px); }
    12%, 80% { opacity: 1; transform: none; }
    100% { opacity: 0; transform: none; }
  }

  [data-en-delta]::after {
    content: var(--_en-kind-glyph, "") attr(data-en-delta);
    position: absolute;
    inset: auto 0 calc(100% + 4px) auto;
    z-index: 1;
    width: max-content;
    padding: 2px 7px;
    border-radius: 999px;
    background: var(--en-fx-color);
    color: white;
    font: 600 11px/1.4 system-ui, sans-serif;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    pointer-events: none;
    opacity: 1;
    transform: none;
    mask: none;
    -webkit-mask: none;
    animation: en-delta var(--en-duration-preview) ${EASE} both;
  }
  @keyframes en-delta {
    from { opacity: 0; transform: translateY(3px); }
    to { opacity: 1; transform: none; }
  }
  [data-en-certainty="may"][data-en-delta]::after {
    background: transparent;
    color: var(--en-fx-color);
    box-shadow: inset 0 0 0 1px currentColor;
  }
  [data-en-state="confirm"][data-en-delta]::after {
    animation: en-delta-confirm var(--en-duration-confirm) ${EASE} both;
  }
  @keyframes en-delta-confirm {
    0% { opacity: 0; transform: translateY(3px); }
    12%, 75% { opacity: 1; transform: none; }
    100% { opacity: 0; transform: none; }
  }
}
`;

const NOT_OPTED_OUT = `:not([data-en-motion="full"] *)`;
/** Presets whose look is a still wash or colour change: no reduced-motion ring. */
const STATIC_FX = ["row", "block", "cell", "glyph", "stroke"].map((n) => `[data-en-fx="${n}"]`).join(", ");
const RING_FALLBACK = `[data-en-fx]:not(${STATIC_FX}, [data-en-fx="inset"])`;

/**
 * Reduced-motion fallback (static outline, or the still look of washes) and forced-colors support.
 *
 * In the CSS:
 * - transition-duration: 0s keeps transition-delay, which is the dwell.
 * - Washes and colour changes are static already; other effects fall back to a still ring.
 * - A wash's confirm shows as its still preview look, at full strength.
 * - Inset hosts clip or touch their neighbours: their own outline is the static ring.
 * - The delta chip and the badge carry information: keep them, without motion.
 * - box-shadow is dropped in forced colors; use a system-color outline. Driven by --en-preview so
 *   it works in both runtime modes. Focused elements are skipped so the UA focus ring is never
 *   replaced.
 */
export const a11yCss = /* css */ `@layer entangled.a11y {
  @media (prefers-reduced-motion: reduce) {
    [data-en-fx]${NOT_OPTED_OUT} {
      transition-duration: 0s;
      animation: none;
    }
    ${RING_FALLBACK}${NOT_OPTED_OUT} {
      --en-active-preset: outline;
      ${outlineDecl("var(--en-preview)")}
    }
    ${RING_FALLBACK}[data-en-state="confirm"]${NOT_OPTED_OUT} {
      ${outlineDecl("1")}
    }
    [data-en-fx]:is(${STATIC_FX})[data-en-state="confirm"]${NOT_OPTED_OUT} {
      --_en-a: var(--en-intensity);
    }
    [data-en-fx="inset"]${NOT_OPTED_OUT} {
      box-shadow: ${BASE_SHADOW};
    }
    [data-en-fx="inset"][data-en-state="confirm"]:not(:focus-visible)${NOT_OPTED_OUT} {
      outline-color: var(--en-fx-color);
    }
    [data-en-layer][data-en-fx]${NOT_OPTED_OUT}::after {
      display: none;
    }
    [data-en-layer][data-en-fx="block"]${NOT_OPTED_OUT}::before {
      animation: none;
    }
    [data-en-delta][data-en-fx]${NOT_OPTED_OUT}::after {
      display: block;
      animation: none;
    }
    [data-en-badge][data-en-actor][data-en-state="confirm"]${NOT_OPTED_OUT}::before {
      animation: none;
    }
    [data-en-overlay]${NOT_OPTED_OUT} {
      background: none;
      opacity: 1;
      box-shadow: inset 0 0 0 3px ${mix("var(--en-fx-color)", "var(--en-preview) * 100%")};
    }
    [data-en-overlay][data-en-state="confirm"]${NOT_OPTED_OUT} {
      box-shadow: inset 0 0 0 3px var(--en-fx-color);
    }
  }

  @media (forced-colors: active) {
    [data-en-fx]:not(:focus-visible) {
      outline: calc(var(--en-preview) * 2px) solid Highlight;
      outline-offset: 2px;
    }
    [data-en-fx][data-en-state="confirm"] {
      outline: 2px solid Highlight;
      outline-offset: 2px;
    }
    [data-en-fx="inset"] {
      outline-offset: -2px;
    }
    [data-en-overlay] {
      background: none;
      box-shadow: none;
      opacity: 1;
      animation: none;
      outline-offset: -4px;
    }
    [data-en-layer][data-en-fx]::after,
    ${LAYER_BEFORE("block")} {
      display: none;
    }
    ${SVG}[data-en-fx="stroke"] {
      filter: none;
    }
    [data-en-badge][data-en-actor][data-en-state="confirm"]::before,
    [data-en-delta][data-en-fx]::after {
      display: block;
      outline: 1px solid CanvasText;
    }
    [data-en-fx][data-en-kind="remove"] {
      outline-style: dashed;
    }
    [data-en-fx]:is([data-en-kind="disable"], [data-en-kind="invalidate"]) {
      outline-style: dotted;
    }
    :root[data-en-query] [data-en-affects][data-en-fx]:not(:focus-visible) {
      outline-style: dashed;
      outline-width: calc(max(var(--en-preview), var(--en-source)) * 2px);
    }
  }
}
`;

/** CSS for each built-in preset. */
export const effectsCss: Readonly<Record<PresetName, string>> = {
  sweep,
  ring,
  inset,
  tint,
  veil,
  pulse,
  outline,
  row,
  block,
  stroke,
  glyph,
  cell,
};

/** Named sheets in injection order. `registerEffect(name)` replaces `effect:<name>`. */
export const presetStyles: readonly StyleSheetSpec[] = [
  { name: "base", css: baseCss },
  ...presetNames.map((n) => ({ name: `effect:${n}`, css: effectsCss[n] })),
  { name: "source", css: sourceCss },
  { name: "form", css: formCss },
  { name: "delta", css: deltaCss },
  { name: "a11y", css: a11yCss },
];

/** Everything as one stylesheet (what `@entangled-ui/presets/entangled.css` contains). */
export const presetsCss: string = presetStyles.map((s) => s.css).join("\n");
