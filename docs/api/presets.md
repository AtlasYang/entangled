# `@entangled-ui/presets`

The effect presets and design tokens: the CSS that draws previews and
confirms. Every preset follows the [Cue Contract](css.md) and is paint-only,
so layout never moves.

```ts
import { presetStyles } from "entangled-ui/presets"; // or "@entangled-ui/presets"
```

`autoStart` and `<EntangledProvider>` inject `presetStyles` for you. With
`createEntangled`, pass them as `styles`, or load the static stylesheet
through your bundler:

```js
import "entangled-ui/entangled.css"; // or "@entangled-ui/presets/entangled.css"
```

## Contents

- [Presets](#presets)
- [Stylesheets](#stylesheets)
- [Tokens](#tokens)
- [Files](#files)

---

## Presets

The runtime picks a preset per element (see
[`resolveEffect`](core.md#resolveeffect)); `data-en-effect` overrides it.

| Preset | Look | Default for | Notes |
|---|---|---|---|
| `ring` | A two-tone ring outside the box. | Controls and writer-only elements. | With `data-en-layer`: a gradient ring on `::after`. |
| `sweep` | A ring with a soft drop glow. On media, the confirm also brightens the image. | Media: `img`, `video`, `picture`, `canvas`, `svg`, `iframe`. | With `data-en-layer`: a band of light sweeps across on confirm. |
| `tint` | A faint wash inside the box and a hairline around it. | Every other reader. | |
| `veil` | A faint full-screen overlay. | `<html>`, `<body>` and the global key `*`. | Drawn once, by one fixed overlay element. |
| `inset` | An outline inside the box, over the content, and a faint wash. | | For hosts that clip their overflow or sit flush against neighbours: timelines, tables, grids. With `data-en-channel="outline"`, the outline becomes an inset box-shadow. |
| `pulse` | A ring that expands and fades on confirm. | | With `data-en-layer`: the pulse is drawn on `::after`. |
| `outline` | A static ring, without motion. | | Also the reduced-motion fallback for ring-like presets. |
| `row` | A wash across the row that bleeds 6px into the gutters. | | For list, inspector and menu rows. Colours descendants marked `data-en-part="label"`. |
| `block` | A wash under the content. | | For clips, cards and tiles. With `data-en-layer`: a flood over the content on `::before`, lifted by `--en-block-z`. |
| `stroke` | A glow around an SVG graphic. | SVG graphics inside an `<svg>`. | With `data-en-paint`: the stroke and fill take the cue colour, and the stroke widens by 1px. |
| `glyph` | The glyph takes the cue colour, with a soft text glow. | | For icons, status dots and inline text that inherit their colour. |
| `cell` | A wash and a hairline inside the cell. | | For dense grids and tables, where an outer ring is noise. |

Hosts that set their own colours for the presets to blend from use the
`--en-*-base` properties (`--en-base-shadow`, `--en-label-base`,
`--en-glyph-base`, `--en-stroke-base`, `--en-fill-base`,
`--en-stroke-width-base`). See [Host hooks](css.md#host-hooks).

### `PresetName`

```ts sig
type PresetName = "sweep" | "ring" | "inset" | "tint" | "veil" | "pulse" | "outline" | "row" | "block" | "stroke" | "glyph" | "cell";
```

### `presetNames`

Every built-in preset, in injection order.

```ts sig
const presetNames: readonly PresetName[];
```

### `effectsCss`

The CSS of each built-in preset, wrapped in `@layer entangled.effects`.

```ts sig
const effectsCss: Readonly<Record<PresetName, string>>;
```

---

## Stylesheets

### `presetStyles`

Every sheet, named, in injection order: `base`, `effect:<name>` for each
preset, `source`, `form`, `delta`, `a11y`. Pass it as the `styles` option.
`registerEffect(name, css)` replaces `effect:<name>`.

```ts sig
const presetStyles: readonly StyleSheetSpec[];
```

```ts
import { createEntangled } from "entangled-ui";
import { presetStyles } from "entangled-ui/presets";

createEntangled({ styles: presetStyles.filter((s) => s.name !== "effect:sweep") });
```

### `presetsCss`

Every sheet joined into one string: the contents of `entangled.css`.

```ts sig
const presetsCss: string;
```

### `baseCss`

The `@property` registrations, the layer order, the tokens on `:root`, the
per-element resets, origin and caution colours, the orienting stage, and the
overlay. Every other sheet depends on it.

```ts sig
const baseCss: string;
```

### `sourceCss`

The reverse-query look: a dashed outline in `--en-color-source` on the
writers that affect the inspected element. Never replaces the focus ring.

```ts sig
const sourceCss: string;
```

### `formCss`

What a cue says beyond "this", in `@layer entangled.form`: change kinds
(removals dashed, disabling and invalidation dotted, uncertain changes
weaker), the far channel, and the outline fallback for hosts that use
box-shadow themselves (`data-en-channel="shadow"`).

```ts sig
const formCss: string;
```

### `deltaCss`

The chip (`data-en-delta`) and the actor badge, in `@layer entangled.peek`.
The chip sits above the reader's top-right corner, grows up and to the left,
and is prefixed with `+` or `−` for additions and removals.

```ts sig
const deltaCss: string;
```

### `a11yCss`

The reduced-motion fallback (static rings, still washes) and forced-colours
support (system-colour outlines), in `@layer entangled.a11y`. Chips and
badges stay, without motion.

```ts sig
const a11yCss: string;
```

### `StyleSheetSpec`

A named stylesheet: `{ name: string; css: string }`. The same shape as
[`StyleSheetSpec`](core.md#stylesheetspec) in core.

---

## Tokens

The design tokens, defined once and emitted both as the `:root`
declarations in `baseCss` and as a [DTCG 2025.10](https://www.designtokens.org/)
file. The values are listed in [css.md](css.md#tokens).

### `tokens`

Every public token, in `:root` order.

```ts sig
const tokens: readonly TokenSpec[];
```

```ts
import { tokens } from "entangled-ui/presets";

const durations = tokens.filter((t) => t.type === "duration").map((t) => t.cssVar);
```

### `TokenSpec`

| Field | Type | Description |
|---|---|---|
| `cssVar` | `` `--en-${string}` `` | The custom property. |
| `path` | `readonly string[]` | Path under the `entangled` group in the DTCG file, such as `["color", "base"]`. |
| `type` | `TokenType` | The DTCG type. |
| `css` | `string` | The value as written on `:root`. |
| `value` | `unknown` | The DTCG `$value`. |
| `description` | `string` | One sentence, emitted as `$description`. |

### `TokenType`

```ts sig
type TokenType = "color" | "duration" | "cubicBezier" | "number" | "dimension";
```

### `tokenDeclarations`

The `:root` declarations, one `--en-*: value;` per token.

```ts sig
function tokenDeclarations(): string;
```

### `dtcgTokens`

The DTCG token file as an object: the contents of `tokens.json`. Each token
carries its custom property under `$extensions["dev.entangled"].cssVar`.

```ts sig
function dtcgTokens(): Record<string, unknown>;
```

---

## Files

| File | Contents |
|---|---|
| `@entangled-ui/presets/entangled.css` (`entangled-ui/entangled.css`) | `presetsCss`: every sheet as one static stylesheet. |
| `@entangled-ui/presets/tokens.json` (`entangled-ui/tokens.json`) | `dtcgTokens()`: the tokens in DTCG 2025.10 format, for design tools and token pipelines. |

Both are generated from the module at build time, so they always match
`presetStyles`.
