# `@entangled-ui/devtools`

A development-only overlay that shows the graph, the confirm log,
habituation counters and lint warnings for a runtime.

```ts
import { mountDevtools } from "entangled-ui/devtools"; // or "@entangled-ui/devtools"
```

## Production builds

The package resolves through the `development` export condition. Bundlers
set it in development builds only; every other build gets a no-op module
with the same API and no dependency on the panel, so DevTools is removed
from production bundles without any configuration.

| Import | Development build | Other builds |
|---|---|---|
| `@entangled-ui/devtools` | The panel | No-op |
| `@entangled-ui/devtools/always` | The panel | The panel |

`entangled-ui/devtools` and `entangled-ui/devtools/always` behave the same.
Use `/always` to include DevTools on purpose, for example on a staging site.

In the no-op build, `mountDevtools` returns a no-op unmount function,
`collectBudget` and `collectForesight` do nothing, and `lint` returns `[]`.

---

## Panel

### `mountDevtools`

Mounts the overlay for `runtime` and returns an unmount function. Does
nothing without a DOM.

```ts sig
function mountDevtools(runtime: EntangledRuntime, options?: DevtoolsOptions): () => void;
```

```ts
import { autoStart } from "entangled-ui/auto";
import { mountDevtools } from "entangled-ui/devtools";

const runtime = autoStart();
const unmount = mountDevtools(runtime, { open: true });
```

The panel lives in one fixed element with a shadow root, so it never takes
part in the app's layout and the app's CSS can't reach it. Its tabs:

| Tab | Shows |
|---|---|
| Keys | Every key with its writer and reader counts. Selecting a key draws a box around each writer and reader and a line from every writer to every reader. |
| Log | Recent confirms with their origin, actor, keys and how many elements lit; attention level changes, slow foresight plans and deviations. |
| Habituation | Each counter's key, kind, count and multiplier, with a reset per key and for everything. |
| Lint | The warnings of [`lint`](#lint), with a count on the tab. |

The header shows the runtime mode and whether a reverse query is active.
Unlike the runtime, DevTools reads layout to draw connection lines.

### `DevtoolsOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `open` | `boolean` | `false` | Open the panel at once. Otherwise only a small toggle button shows. |
| `position` | `"bottom-right" \| "bottom-left"` | `"bottom-right"` | Where the toggle sits. |
| `logSize` | `number` | `50` | Entries kept in the log. |

---

## Lint

### `lint`

Graph and runtime hygiene checks. Pure and deterministic.

```ts sig
function lint(input: LintInput): LintWarning[];
```

```ts
import { createEntangled } from "entangled-ui";
import { lint } from "entangled-ui/devtools";

const runtime = createEntangled();
runtime.start();

for (const w of lint({ snapshot: runtime.graph.snapshot(), rejections: runtime.peekRejections })) {
  console.warn(`${w.code}: ${w.message}`);
}
```

### `LintCode`

```ts sig
type LintCode = "writer-without-readers" | "reader-without-writers" | "over-budget" | "peek-rejected" | "foresight-slow";
```

| Code | Meaning |
|---|---|
| `writer-without-readers` | A writer key nothing reads: hovering its writers shows nothing. `*` is exempt. |
| `reader-without-writers` | A reader key no writer affects: its readers can never light up. Writers of `*` don't count. |
| `over-budget` | A key went over the attention budget at least `routinely` times. Narrow the key or set `data-en-priority`. |
| `peek-rejected` | A Token Peek token was rejected at registration. |
| `foresight-slow` | A foresight plan ran over its budget at least `routinely` times. Give it a `revision` or simplify it. |

### `LintWarning`

| Field | Type | Description |
|---|---|---|
| `code` | `LintCode` | The kind of warning. |
| `key` | `Key` | The key it concerns. |
| `message` | `string` | A readable explanation. |

### `LintInput`

| Field | Type | Default | Description |
|---|---|---|---|
| `snapshot` | `GraphSnapshot` | | `runtime.graph.snapshot()`. |
| `budget` | `ReadonlyMap<string, BudgetStat & { key: Key }>` | | Built with `collectBudget`. |
| `rejections` | `readonly PeekRejection[]` | `[]` | `runtime.peekRejections`. |
| `foresight` | `ReadonlyMap<Key, ForesightStat>` | | Built with `collectForesight`. |
| `routinely` | `number` | `3` | Occurrences before `over-budget` and `foresight-slow` warn. |

### `collectBudget`

Folds a `budget` [runtime event](core.md#runtimeevent) into per-key
statistics, keyed by `"<kind> <key>"`. Ignores other events.

```ts sig
function collectBudget(stats: Map<string, BudgetStat & { key: Key }>, event: RuntimeEvent): void;
```

### `collectForesight`

Folds a slow `foresight` event into per-writer statistics, keyed by the
writer's `data-en-affects`. Ignores other events.

```ts sig
function collectForesight(stats: Map<Key, ForesightStat>, event: RuntimeEvent): void;
```

```ts
import type { Key } from "entangled-ui";
import { createEntangled } from "entangled-ui";
import { type BudgetStat, type ForesightStat, collectBudget, collectForesight, lint } from "entangled-ui/devtools";

const runtime = createEntangled();
const budget = new Map<string, BudgetStat & { key: Key }>();
const foresight = new Map<Key, ForesightStat>();
runtime.onEvent((e) => {
  collectBudget(budget, e);
  collectForesight(foresight, e);
});

const report = () => lint({ snapshot: runtime.graph.snapshot(), budget, foresight });
```

### `BudgetStat`

| Field | Type | Description |
|---|---|---|
| `kind` | `"preview" \| "confirm"` | Which effect went over budget. |
| `count` | `number` | How many times the key went over. |
| `candidates` | `number` | The most candidates seen at once. |
| `shown` | `number` | How many of those could be shown. |

### `ForesightStat`

| Field | Type | Description |
|---|---|---|
| `key` | `Key` | The writer's `data-en-affects`. |
| `slow` | `number` | How many of its plans ran over budget. |
| `maxMs` | `number` | The slowest plan seen, in ms. |
