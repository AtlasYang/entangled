# Changelog

All notable changes to the Entangled packages (`entangled-ui`, `@entangled-ui/core`, `@entangled-ui/react`,
`@entangled-ui/presets`, `@entangled-ui/devtools`). The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow semver.

## 0.1.0

First release.

### Added

- **`entangled-ui`:** one install for every package, re-exported under `entangled-ui`, `entangled-ui/auto`,
  `entangled-ui/react`, `entangled-ui/presets`, `entangled-ui/devtools`, `entangled-ui/entangled.css` and
  `entangled-ui/tokens.json`.
- **Core:** the writer/reader graph and key matching, the JS and CSS-compiled runtimes with the `auto` mode, sensors,
  origin-aware afterglow, Peek, habituation and the reverse query (also from code, `showSources(el)`).
- **Profiles.** `profile: "site" | "app"` picks defaults for `mode`, `includeWriters`, auto-confirm on activation,
  `reverseQuery` and `habituation` (`PROFILE_DEFAULTS`).
- **Attention levels** `off | minimal | standard | guided` (`attention.level`, `runtime.setLevel()`, persisted in
  localStorage) and **notify levels** `ignore | quiet | aware | interrupt` per key pattern and origin.
- **Change grammar:** `Change`, `ChangeKind`, `ChangeSet`, `ChangeInput`; writers declare kinds with
  `data-en-change` and destructive changes with `data-en-severity`. Kinds are drawn as forms that survive forced
  colours, labels as chips.
- **Foresight:** `runtime.foresee(el, plan, options)` with a revision memo, an 8 ms budget and plan-vs-actual
  `deviation` events (experimental).
- **Presets and tokens:** effect presets including the surface presets `row`, `block`, `stroke`, `glyph` and `cell`;
  regions and the far channel; channel declarations; a typed tokens module and a DTCG 2025.10 file,
  `@entangled-ui/presets/tokens.json`; the Cue Contract v1.
- **React:** Provider, hooks and `EntangledNode` for React 18 and 19.
- **DevTools:** a development-only overlay with keys, connection lines, the confirm log, habituation and lint.
- **Docs:** a feature guide, usage guidelines and a complete API reference in `docs/`.
