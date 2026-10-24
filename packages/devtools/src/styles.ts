/** Shadow-root styles: nothing here can leak into, or be overridden by, the app. */
export const devtoolsCss = /* css */ `
:host { all: initial; }
.lines { position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
.lines .link { stroke: #f5b14c; stroke-width: 1.5; stroke-dasharray: 4 3; opacity: 0.85; }
.lines rect { fill: none; stroke-width: 2; }
.lines .writer { stroke: #f5b14c; }
.lines .reader { stroke: #7cc4ff; stroke-dasharray: 3 3; }

.root {
  position: fixed;
  bottom: 16px;
  display: grid;
  justify-items: end;
  gap: 8px;
  font: 12px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #e9eaee;
  pointer-events: none;
}
.root.bottom-right { right: 16px; }
.root.bottom-left { left: 16px; justify-items: start; }
.root > * { pointer-events: auto; }
button { font: inherit; color: inherit; cursor: pointer; }
.toggle {
  order: 2;
  width: 36px;
  height: 36px;
  border: 1px solid #3a3d47;
  border-radius: 50%;
  background: #1b1d23;
  font-weight: 700;
  letter-spacing: -0.02em;
  box-shadow: 0 6px 18px rgb(0 0 0 / 0.3);
}
.toggle[aria-expanded="true"] { background: #2b2e37; }
.panel {
  order: 1;
  width: min(380px, calc(100vw - 32px));
  max-height: min(70vh, 560px);
  display: grid;
  grid-template-rows: auto auto 1fr;
  border: 1px solid #3a3d47;
  border-radius: 12px;
  background: #1b1d23;
  box-shadow: 0 18px 50px rgb(0 0 0 / 0.4);
  overflow: hidden;
}
.panel[hidden] { display: none; }
header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #2c2f38; }
header .mode { color: #9aa0ad; }
header .close { margin-left: auto; border: 0; background: none; font-size: 18px; line-height: 1; padding: 0 4px; }
.query { padding: 1px 6px; border-radius: 999px; background: #f5b14c; color: #1b1d23; font-weight: 600; }
.query[hidden] { display: none; }
.tabs { display: flex; gap: 2px; padding: 6px 8px; border-bottom: 1px solid #2c2f38; }
.tabs button { border: 0; border-radius: 6px; padding: 4px 8px; background: none; color: #9aa0ad; }
.tabs button[aria-selected="true"] { background: #2b2e37; color: #e9eaee; }
.tabs .count { margin-left: 5px; padding: 0 5px; border-radius: 999px; background: #f5b14c; color: #1b1d23; font-weight: 700; }
.body { overflow: auto; padding: 6px 4px 10px; }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; font-weight: 500; color: #9aa0ad; padding: 4px 8px; }
td { padding: 2px 8px; border-top: 1px solid #262931; vertical-align: middle; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
tr.selected td { background: #2b2e37; }
.key { border: 0; background: none; padding: 3px 0; font-family: ui-monospace, "SF Mono", Menlo, monospace; text-align: left; }
.key[aria-pressed="true"] { color: #f5b14c; }
code { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 11.5px; }
.empty { margin: 10px 8px; color: #9aa0ad; }
.empty.ok { color: #8fd694; }
.log, .lint { list-style: none; margin: 0; padding: 0; }
.log li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; padding: 5px 8px; border-top: 1px solid #262931; }
.log li:first-child, .lint li:first-child { border-top: 0; }
.log time { color: #9aa0ad; font-variant-numeric: tabular-nums; }
.origin { padding: 0 6px; border-radius: 999px; font-weight: 600; background: #3a3d47; }
.origin.self { background: #3b3d8f; }
.origin.peer { background: #8f3b2b; }
.origin.system { background: #1f5f63; }
.actor { font-weight: 600; }
.muted { color: #9aa0ad; }
.lint li { padding: 6px 8px; border-top: 1px solid #262931; }
.lint li code { color: #f5b14c; }
.small { border: 1px solid #3a3d47; border-radius: 6px; padding: 1px 8px; background: #22252c; }
.reset-all { margin: 8px; }
`;
