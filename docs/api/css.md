# Cue Contract v1

The CSS side of Entangled: the tokens effects read, the variables and
attributes the runtime writes, the cascade layers, and the rules an effect
follows. The built-in [presets](presets.md) are written against this
contract, and so should effects you add with `registerEffect`. It holds in
both runtime modes unless an entry says otherwise.

## Contents

- [Version](#version)
- [Layers](#layers)
- [Tokens](#tokens)
- [Runtime variables](#runtime-variables)
- [Host hooks](#host-hooks)
- [Generated variables](#generated-variables)
- [Inspection variables](#inspection-variables)
- [State selectors](#state-selectors)
- [Lifecycle](#lifecycle)
- [Pseudo-elements](#pseudo-elements)
- [Writing an effect](#writing-an-effect)

---

## Version

`--en-contract` on `:root` is the contract version the loaded presets
follow. It changes only for a breaking change to this document: a token,
variable, attribute or selector renamed or removed, a change in who writes
something or when, a reordered layer, a pseudo-element changing owner, or a
stricter rule for effects.

## Layers

```css
@layer entangled.base, entangled.effects, entangled.state, entangled.form, entangled.peek, entangled.a11y;
```

Declared first in `baseCss`. Later layers win over earlier ones.

| Layer | Contents |
|---|---|
| `entangled.base` | Tokens, `--en-transition`, the per-element reset on `[data-en-fx]`, origin and caution colours, the orienting stage, the overlay box. |
| `entangled.effects` | Every preset, `sourceCss`, and every `registerEffect` sheet. |
| `entangled.state` | What the runtime compiles: CSS-mode previews, CSS-mode reverse-query rules, Token Peek. |
| `entangled.form` | `formCss`: change kinds, the far channel, channel fallbacks, uncertain changes. |
| `entangled.peek` | `deltaCss`: the chip and the actor badge. |
| `entangled.a11y` | `a11yCss`: reduced motion and forced colours. |

Unlayered author CSS wins over every layer, whatever its specificity, and
the inline styles the runtime writes win over all of them. So
`:root { --en-color: teal; }` in your stylesheet overrides the token, and an
element's own `box-shadow` hides box-shadow effects (put it in
`--en-base-shadow` instead).

---

## Tokens

Declared on `:root` in `entangled.base`. Override any of them on `:root` or
on a subtree. Each is also in `tokens.json`, under the DTCG path given.

### `--en-color`

`oklch(0.62 0.2 276)` · `color.base`. The cue colour: previews, and your own
confirms.

### `--en-color-2`

`oklch(0.76 0.14 200)` · `color.secondary`. The secondary cue colour, for
gradients and outer rings.

### `--en-color-peer`

`oklch(0.68 0.19 35)` · `color.peer`. Confirms a collaborator caused, unless
the actor has a colour.

### `--en-color-system`

`oklch(0.64 0.11 195)` · `color.system`. Confirms the system caused.

### `--en-color-source`

`oklch(0.74 0.16 80)` · `color.source`. The reverse-query outline on source
writers.

### `--en-color-caution`

`oklch(0.62 0.21 27)` · `color.caution`. Previews of destructive changes.

### `--en-wash-light`

`oklch(1 0 0)` · `color.wash-light`. On `data-en-channel="hue"` hosts,
washes mix 25% of the cue colour into this colour, at 2.5 times the alpha.

### `--en-intensity`

`1` · `number.intensity`. Effect strength, 0-1. Registered as a `<number>`.
The runtime sets it per element, after the attention budget and
habituation; compiled rules set it in CSS mode. It changes at once on the
way in and is held while a preview fades out.

### `--en-duration-preview`

`180ms` · `duration.preview`. How long a preview takes to fade in.

### `--en-ease-preview`

`cubic-bezier(0.2, 0, 0, 1)` · `easing.preview`. The easing of a preview
fading in.

### `--en-duration-preview-out`

`280ms` · `duration.preview-out`. How long a preview takes to fade out:
longer than in, so it never just vanishes.

### `--en-ease-preview-out`

`cubic-bezier(0.4, 0, 0.6, 1)` · `easing.preview-out`. The easing of a
preview fading out.

### `--en-duration-confirm`

`900ms` · `duration.confirm`. How long an afterglow lasts for your own
changes. Read at `start()` unless `confirmMs` is given, in which case the
runtime writes `confirmMs` on `<html>`. Also written inline on confirming
elements with a longer duration (remote, `interrupt`, or `durationMs`).

### `--en-dwell`

`120ms` · `duration.dwell`. Hover time before a preview starts. Compiled
previews and Token Peek use it as their `transition-delay`. The runtime
writes it on `<html>` when `dwellMs` is given, and halves it at the
`guided` level.

### `--en-radius`

`10px` · `dimension.radius`. The corner radius layered effects follow.

### `--en-peek-amount`

`0.15` · `number.peek-amount`. How far Token Peek blends toward the next
state, capped by `peek.maxAmount` and never above `0.35`. The runtime writes
`peek.amount` on `<html>`, and `0` at the `minimal` and `off` levels.

### `--en-contract`

`1` · `number.contract`. The contract version.

---

## Runtime variables

Written by the runtime or by `baseCss`. Read them; don't set them.

### `--en-preview`

Preview strength, 0-1. Registered as a `<number>` (initial `0`) and reset to
`0` on every `[data-en-fx]`, so nested elements never inherit an ancestor's
preview. The runtime sets `1` inline on JS-drawn previews; compiled rules set
it in CSS mode. Transitions in with the preview tokens and out with the
`-out` tokens.

### `--en-fx-color`

The colour to paint with, declared on every `[data-en-fx]`: `--en-color`
normally; `--en-color-self` (or `--en-color`) on self confirms;
`--en-actor-color` (or `--en-color-peer`) on peer confirms;
`--en-color-system` on system confirms; `--en-color-caution` under
`data-en-tone="caution"`.

### `--en-fx-color-2`

The secondary colour to paint with: `--en-color-2` normally, or
`--en-fx-color` mixed 55% with white on remote confirms and in the caution
tone.

### `--en-peek`

Token Peek blend, 0-1. Registered as a `<number>` (initial `0`) and reset to
`0` on every `[data-en-fx]`. Set to `1` by the compiled peek rules while a
writer with `data-en-next` is hovered or focused, after the dwell.

### `--en-source`

Reverse-query source strength, 0-1. Registered as a `<number>` (initial
`0`) and reset on every `[data-en-fx]`. Written inline on source writers in
JS mode, by compiled rules in CSS mode. Drawn under `:root[data-en-query]`.

### `--en-actor-color`

An actor's `color`, written inline during a peer confirm. Wins over
`--en-color-peer`.

### `--en-transition`

The transitions effects rely on (`--en-preview`, `--en-intensity`,
`--en-peek`, `--en-source`), declared on `:root` and on every
`[data-en-fx]`. An element with its own `transition` replaces it, so append
it: `transition: background 120ms, var(--en-transition);`.

The four registered properties are registered both with `@property` and with
`CSS.registerProperty()` at `start()`, because `@property` in constructed
stylesheets isn't honoured by every engine.

---

## Host hooks

Set by you, on your own elements, so effects and your styles coexist. All
are unset by default.

### `--en-color-self`

The colour of your own confirms. Falls back to `--en-color`.

### `--en-base-shadow`

The element's own `box-shadow`. Every preset box-shadow appends it. Falls
back to `0 0 #0000`.

```css
.card {
  --en-base-shadow: 0 1px 2px rgb(0 0 0 / 0.2);
  transition: background 120ms, var(--en-transition);
}
```

### `--en-label-base`

The own `color` of a `[data-en-part~="label"]` inside a `row` reader.
Falls back to `currentColor`.

### `--en-glyph-base`

The own `color` of a `glyph` element. Falls back to `currentColor`.

### `--en-stroke-base`

The own `stroke` of a `stroke` element with `data-en-paint~="stroke"`.
Falls back to `currentColor`.

### `--en-stroke-width-base`

The own `stroke-width` of a `stroke` element with `data-en-paint~="stroke"`.
The preview adds up to 1px. Falls back to `1px`.

### `--en-fill-base`

The own `fill` of a `stroke` element with `data-en-paint~="fill"`. Falls
back to `currentColor`.

### `--en-block-z`

The `z-index` of the layered `block` flood on `::before`, to lift it above
positioned children. Falls back to `auto`.

### `--en-peek-duration`

A fade for global Token Peek. A global peek restyles the whole document, so
by default it steps in after the dwell (`0s`); set a duration to fade it
instead.

---

## Generated variables

Names derived from keys and tokens.

### `--en-int-<key>`

A key's habituation multiplier (0-1) for previews, read by compiled rules as
`var(--en-int-<key>, 1)`. Written on `<html>` only while it is below `1`,
and never on hover. Characters other than `A-Z a-z 0-9 -` are escaped as
`_<hex>_`: `media:42` becomes `--en-int-media_3a_42`.

### `--en-pint-<key>`

The same for a key's Token Peek blend. Written only for keys with peek
tokens.

### `--en-base-<token>`

Token Peek: the current state's value of a token, on the token's scope. The
token loses its `--`: `--bg` becomes `--en-base-bg`.

### `--en-next-<token>`

Token Peek: the next state's value of a token, set while a writer that
switches to that state is hovered or focused.

---

## Inspection variables

Nothing reads these; they exist for tests and tooling.

### `--en-active-preset`

The preset drawing an element (`ring`, `sweep`, ..., `veil` on the
overlay), or `outline` under the reduced-motion fallback.

### `--en-active-source`

`dashed` on writers drawing the reverse-query look.

---

## State selectors

| Selector | Matches |
|---|---|
| `[data-en-fx]`, `[data-en-fx="<name>"]` | Every registered element; those drawn by preset `<name>`. |
| `[data-en-state="preview"]` | A JS-drawn preview. |
| `[data-en-state="confirm"]` | A running afterglow. |
| `[data-en-origin="self\|peer\|system"]` | Who caused the running afterglow. |
| `[data-en-notify="quiet\|interrupt"]` | An afterglow at that notify level. |
| `[data-en-kind="<kind>"]` | The change kind drawn, when not `modify`. |
| `[data-en-certainty="may"]` | An uncertain change. |
| `[data-en-tone="caution"]` | A preview of a destructive change. |
| `[data-en-far]` | A cue in another region than its cause. |
| `[data-en-delta]` | A reader showing a chip; the text is the attribute value. |
| `[data-en-overlay]` | The global overlay. |
| `:root[data-en-query]` | A reverse query is active. |
| `:root[data-en-level="<level>"]` | The attention level. |

`data-en-kind`, `data-en-certainty`, `data-en-tone` and `data-en-far` are
**sticky**: they stay after the element goes idle, so their CSS fades out
with the effect instead of being cut short, and are replaced on its next
preview or confirm. Style them only together with something that is zero at
idle (`--en-preview`, a confirm animation), never on their own.

Every attribute is described in [html.md](html.md).

---

## Lifecycle

What the runtime writes for JS-drawn salience. "Clear" removes
`data-en-state`, `data-en-origin`, `data-en-actor`, `data-en-notify` and the
inline `--en-preview`, `--en-intensity`, `--en-duration-confirm` and
`--en-actor-color`, and keeps the sticky attributes.

| Step | The runtime writes | CSS |
|---|---|---|
| idle → preview | `data-en-state="preview"`, `--en-preview: 1`, `--en-intensity`; the sticky attributes; `data-en-delta` when there is chip text. | `--en-preview` fades in with the enter timing. |
| preview → idle | Clear; `data-en-delta` removed. | `--en-preview` fades out with the exit timing; `--en-intensity` is held until it has. |
| idle → confirm | `data-en-state="confirm"`, `data-en-origin`, `--en-intensity`; `data-en-actor` and `--en-actor-color` for an actor; `--en-duration-confirm` for a longer duration; `data-en-notify`; the sticky attributes; `data-en-delta` with a label. | The confirm animation runs for `--en-duration-confirm`. |
| confirm → idle | Clear, when the afterglow's time is up. | The animation has ended transparent. |
| replay | A lit element confirmed again by another origin, or after `coalesceMs`, is cleared for one frame, then confirmed again. | Leaving the confirm state for a frame restarts the animation. |

An element that is previewed while it confirms keeps `--en-preview: 1`
under `data-en-state="confirm"`. Confirms of the same origin within
`coalesceMs` merge: the afterglow is extended, the stronger intensity kept,
and nothing replays.

In CSS mode, hover and focus previews are compiled rules in
`entangled.state`: under `:root:has([data-en-affects~="<key>"]:hover)` they
set `--en-preview`, `--en-intensity` and the enter timing on the readers,
with `transition-delay: var(--en-dwell)`, and write no attributes. Confirms,
chips, and previews of writers with `data-en-change` or `data-en-severity`
are still drawn by the runtime as above.

---

## Pseudo-elements

A host has one `::before` and one `::after`. Where several features want
one, the later layer wins.

| Pseudo-element | Used by (later wins) | Needs |
|---|---|---|
| `::after` | Layered `ring`, `sweep`, `pulse` (`entangled.effects`), then the chip (`entangled.peek`). | `data-en-layer` for the effects; a positioned reader for the chip. |
| `::before` | The layered `block` flood (`entangled.effects`), then the actor badge (`entangled.peek`). | `data-en-layer` for the flood; `data-en-badge` for the badge. |

A host that uses `::before` or `::after` itself must not opt in to the
features that use the same one.

---

## Writing an effect

An effect is CSS for `[data-en-fx="<name>"]`, registered with
`runtime.registerEffect(name, css)`, which wraps it in
`@layer entangled.effects`. Elements use it through
`data-en-effect="<name>"`.

1. **Paint only.** On the host, change only `box-shadow`, `outline` and its
   longhands, `color` and `text-shadow`. Use `opacity`, `transform` and
   `background` only on pseudo-elements of `[data-en-layer]` hosts;
   `filter` only on media and SVG graphics; `stroke`, `fill` and
   `stroke-width` only on SVG graphics with `data-en-paint`. Nothing that
   affects layout.
2. **Paint with `--en-fx-color` and `--en-fx-color-2`**, so origin colours
   and the caution tone apply, and keep `var(--en-base-shadow, 0 0 #0000)`
   at the end of every `box-shadow`.
3. **Fade toward transparent, not toward another colour.** Scale alpha,
   width, blur or offset by `--en-intensity`, but mix the cue colour toward
   another opaque colour only by `--en-preview`. Otherwise a budgeted
   effect turns muddy instead of fainter.
4. **Append `var(--_en-orient)` to confirm animations on the host**, so
   remote, far and interrupting confirms get the orienting stage. It is
   `none` otherwise.
5. **Idle is a no-op.** With `--en-preview: 0` and no `data-en-state`, the
   element must look exactly as it did without Entangled.
6. **Reduced motion and forced colours.** With the presets loaded,
   `a11yCss` already gives custom effects a still ring under
   `prefers-reduced-motion` and a `Highlight` outline under forced colours.
   Without them, provide both, and skip the reduced-motion rules inside
   `[data-en-motion="full"]`.

```ts
import { autoStart } from "entangled-ui/auto";

const runtime = autoStart();
runtime.registerEffect(
  "glow",
  `[data-en-fx="glow"] {
    box-shadow:
      0 0 calc(var(--en-preview) * 12px)
        color-mix(in oklab, var(--en-fx-color) calc(var(--en-preview) * var(--en-intensity) * 100%), transparent),
      var(--en-base-shadow, 0 0 #0000);
  }
  [data-en-fx="glow"][data-en-state="confirm"] {
    animation: glow-confirm var(--en-duration-confirm) cubic-bezier(0.2, 0, 0, 1), var(--_en-orient);
  }
  @keyframes glow-confirm {
    30% {
      box-shadow:
        0 0 16px color-mix(in oklab, var(--en-fx-color) calc(var(--en-intensity) * 100%), transparent),
        var(--en-base-shadow, 0 0 #0000);
    }
  }`,
);
```
