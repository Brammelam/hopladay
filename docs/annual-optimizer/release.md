# Annual leave optimizer release notes

## Behavior

The homepage now previews a real balanced annual plan from country, year and allowance without creating an account. Optional settings follow the main action. Results distinguish new leave from calendar days in breaks, show a twelve-month keyboard-accessible calendar, and support accept, reject, lock, adjust, regenerate and reset. Basic edits remain free. Maximum-time and longest-break strategies, custom working calendars and other advanced controls require verified Premium access.

The original planner remains at `/:lang/plans`; payment callbacks, authentication routes and `/api/v1/plan-preview` remain available. Existing saved `HolidayPlan` documents are neither migrated nor recalculated. New saves use versioned `OptimizerPlan` snapshots. Expired or pre-session sign-ins must verify again for protected version 2 actions. Existing email owners must verify ownership before adding a passkey; the form switches to the existing email verification path rather than automatically sending mail.

New calendar exports distinguish individual leave requests from complete vacation intervals. They use all-day dates, exclusive end dates, folded UTF-8 content lines and stable event IDs. Calendar events are tentative planning information; they do not request or approve employer leave. Export is checked server-side against current Premium entitlement and snapshot ownership.

Regional holidays are applied only when the corresponding provider subdivision is selected. Nationwide dates are the default. Company holidays and worked public holidays are separate classifications. Provider granularity and employer entitlement remain explicit limitations; see ../holiday-reliability.md.

Three useful country/year pages are generated from official snapshots and the same engine, with exact leave dates and complete calendars. Regenerate them with `node backend/scripts/generate-landings.js` after refreshing their public fixtures or changing the engine. Backend tests catch generated content drift. Static hosts must serve the generated landing directories, locale pages and new contract files before any catch-all rewrite. The Node SSR server handles the route manifest directly, including optional trailing slashes.

Analytics are optional and off by default. The client sends only an allowed action name after opt-in; the server stores UTC day/action counters without vacation dates, allowance, account or plan identifiers. These are client-reported funnel counts, not an authoritative payment ledger. Checkout remains the entitlement authority. No new external analytics service or paid dependency was added.

## Review units

1. `ccf378f`: canonical date/work-calendar model and fixtures.
2. `fa13e61`: exact interval optimizer, exhaustive examples and reproducible benchmark.
3. `a752c68`: version 2 API, protected sessions and exports, regional data, snapshot persistence, compatibility and public contracts.
4. `043086d`: interactive result experience, progressive anonymous homepage, all eight existing locales, and regression tests.
5. Engine-generated landing pages, static serving, screenshots and release checks.

These are local reviewable increments. No pull request, push, deployment, payment configuration or production data change is part of this implementation.

## Checks

```sh
npm --prefix backend test
npm --prefix frontend test -- --watch=false --browsers=ChromeHeadless
npm --prefix frontend run build-prod
npm --prefix frontend run verify:ssr
cd frontend && ./node_modules/.bin/tsc --noEmit -p tsconfig.app.json
```

No lint script is configured in the repository. Angular production builds also check templates and types. Older component smoke tests emit missing-translation warnings because they do not initialize locale files; production HTML assertions check rendered localized content.

Performance scripts:

```sh
node backend/scripts/benchmark-optimizer.js
node backend/scripts/benchmark-optimizer-api.js
```

The pure benchmark times calendar generation, candidate enumeration, optimization and explanations, verifies actual results, warms each case and reports five samples. The HTTP benchmark includes local network roundtrip, fixture holiday cache, engine execution, serialization and JSON parsing; authentication is a fixture and real provider/Mongo/production latency is excluded. A separate CPU profile identifies the interval DP as the dominant CPU cost. Worst-case memory for the bounded DP arrays is about 112 MB; seven-day workweeks, 366-day budgets, 12 breaks and both requirement flags are intentionally included in stress measurements. Typical local runs with 25 days are substantially smaller, but these measurements are not production service-level budgets. Calibrate latency, memory and concurrency limits on the deployment host before raising traffic limits.

## Remaining operational verification

Verify real Mongo collection/index permissions, hardware passkey registration/login, magic-link delivery and real checkout against the deployment environment. Automated tests use injected persistence/provider boundaries and do not send email or charge cards. New source catalogs use an upstream timeout of 8 seconds and a bounded cache of 24 hours. All v2 routes have fixed-window request limits; proxy and fleet-wide limits must match the actual hosting topology.

Browser checks use live public Norway 2027 holiday data on localhost, plus desktop at 1440px and mobile at 390px layouts. The screenshots contain an anonymous sample, not a private saved calendar. Real funnel conversion, search indexing and legal completeness in every jurisdiction require post-deployment evidence; no improvement is claimed from synthetic counts.

Collaborative planning remains a separately scoped proposal in collaboration-proposal.md.

Final verification: backend 68/68, frontend 36/36, standalone TypeScript check, 49-route production prerender/HTML checks and production HTTP smoke test passed. No new runtime dependencies.
