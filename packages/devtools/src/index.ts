/**
 * @entangled-ui/devtools: a development-only overlay.
 *
 * Bundlers resolve the `development` export condition in dev builds only;
 * every other build gets `noop.js`, so DevTools is tree-shaken out of
 * production by default. Import `@entangled-ui/devtools/always` to include
 * it anyway (e.g. on a staging site).
 */
export { type DevtoolsOptions, mountDevtools } from "./panel.js";
export {
  type BudgetStat,
  type ForesightStat,
  type LintCode,
  type LintInput,
  type LintWarning,
  collectBudget,
  collectForesight,
  lint,
} from "./lint.js";
