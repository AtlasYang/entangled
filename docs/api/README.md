# API reference

Every public export, attribute, custom property and token, one entry each.
[Features](../features.md) explains how the pieces fit together; this is
where you look things up.

| Page | Covers |
|---|---|
| [core.md](core.md) | `@entangled-ui/core` and `@entangled-ui/core/auto` |
| [react.md](react.md) | `@entangled-ui/react` |
| [presets.md](presets.md) | `@entangled-ui/presets`, `entangled.css` and `tokens.json` |
| [devtools.md](devtools.md) | `@entangled-ui/devtools` and `@entangled-ui/devtools/always` |
| [html.md](html.md) | Every `data-en-*` attribute |
| [css.md](css.md) | The Cue Contract: tokens, variables, layers, selectors and the rules for writing an effect |

## Packages

`entangled-ui` installs every package and re-exports each one unchanged, so
an entry for `@entangled-ui/core` applies equally to `entangled-ui`.

| Import | Same as |
|---|---|
| `entangled-ui` | `@entangled-ui/core` |
| `entangled-ui/auto` | `@entangled-ui/core/auto` |
| `entangled-ui/react` | `@entangled-ui/react` |
| `entangled-ui/presets` | `@entangled-ui/presets` |
| `entangled-ui/devtools` | `@entangled-ui/devtools` |
| `entangled-ui/devtools/always` | `@entangled-ui/devtools/always` |
| `entangled-ui/entangled.css` | `@entangled-ui/presets/entangled.css` |
| `entangled-ui/tokens.json` | `@entangled-ui/presets/tokens.json` |

## Reading an entry

- The heading is the exported name. Runtime methods are listed under
  [`EntangledRuntime`](core.md#entangledruntime) as `runtime.confirm()` and
  so on.
- Signatures are in `ts sig` blocks. They are summaries, not compiled code.
- Tables list every field of an interface. A blank default means the field
  is unset unless you set it.
- **Throws** appears only when a function can throw.
- Examples are complete and type-checked against the sources.

## Stability

Everything follows semver, except what is marked *experimental*, which may
change in a minor version: the per-origin form of `NotifyOptions.keys`,
`foresightProps`, and `deviation` events.

## Checks

`pnpm typecheck` runs two scripts against these pages:

- `scripts/check-api-docs.mjs` fails when an export, attribute or public
  custom property has no entry, or an entry names something that no longer
  exists.
- `scripts/check-readme.mjs` type-checks every `ts` and `tsx` block in the
  README and in `docs/`.
