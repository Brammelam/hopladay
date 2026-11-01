# 2026-11-01 correction verification

Baseline: `426ca280e85b83b774db71f5c39dbf92c3fbd8c7`. Verification ran in a separate Hopladay checkout on Node 24.19.0 with Chromium; no production account data or hosting configuration was modified.

## Corrected behavior

- Anonymous/default v2 maximizes distinct covered calendar days, then used allowance, then preferred days and fewer breaks. No default four/twelve-break or ninety-day cap. Explicit user constraints remain effective; balanced remains an explicit alternative.
- Independent leave-subset enumeration covers 203 small-calendar configurations, including the changed maximum-time tie objective and unrestricted defaults. Norway's nationwide Public-only 2027 fixture yields 66 unique off-days with 20 unique eligible leave days; allowance 366 yields 365 unique off-days, 255 used leave days and 111 unusable remaining days. Twenty locked breaks survive regeneration and frontend reload.
- Legacy user and plan routes require verified session/ownership. Anonymous initialization creates fresh session-backed ownership; arbitrary emails/browser IDs cannot recover accounts. Auth responses use a safe allowlist. Magic-link/passkey flows and anonymous upgrade/expiry recovery have regressions.
- Year changes reconcile dated inputs; Reset keeps the last successful baseline. Regions load before calculation. Old automatic balanced defaults migrate without discarding date constraints or custom limits.
- v2 leads discovery. All three regenerated guides use explicit `index.html` canonical/sitemap/link URLs for current static-host compatibility. Clean aliases recover in the browser; Node serves direct HTML for both forms. Clean aliases still require host rewrites for direct crawler HTML on a static host with a SPA catch-all. No Render settings were changed.

## Final checks

- Backend `npm test`: **88 passed, 0 failed**.
- Frontend `npm test -- --watch=false --browsers=ChromeHeadless`: **58 passed, 0 failed**.
- Production `npm run build`: passed, 49 prerendered routes and public HTML verification.
- `npm run verify:ssr`: passed, including generated guides, explicit canonicals and clean aliases.
- TypeScript `tsc --noEmit` for app and spec projects: passed.
- Changed backend JavaScript syntax checks and `git diff --check`: passed.
- Independent optimizer/API review and auth/frontend review: all blocking findings addressed and re-reviewed.
- No lint command is configured. No production write tests, provider-independent legal/holiday entitlement audit, or Render deployment verification was performed here.

Dependencies were installed with `npm install --no-package-lock` because neither project tracks a lockfile; initial `npm ci` attempts therefore failed. A concurrent frontend installation collision was resolved with one clean install. These setup failures are not passing test claims.

## Resource measurements and operational limits

The local pure-engine benchmark measured median 85.12 ms for unrestricted full-year allowance 366, 77.45 ms with a nonbinding 182-break cap, and 10.28 ms for a binding 182-singleton-break case. Maximum-time-off 25-day planning measured 10.58 ms. Fixture-backed local HTTP maximum-time-off measured 15.79 ms median. These are local measurements, not production latency guarantees.

The solver omits nonbinding dimensions and rejects over 4,000,000 DP states before allocating buffers. Such complex custom requests return HTTP 503 `OPTIMIZATION_CAPACITY_EXCEEDED` with no partial plan and an actionable explanation. The approximately 61 MiB bound is per solve, not a process/concurrency guarantee. Free unrestricted defaults stay below it.

Old browser-ID-only anonymous identities cannot safely be recovered; existing email owners must sign in. Anonymous upgrades require verified email before returning to checkout. Existing saved plan snapshots are not recalculated.
