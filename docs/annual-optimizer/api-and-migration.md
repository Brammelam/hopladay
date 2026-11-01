# Version 2 API and plan migration

The annual optimizer is exposed under `/api/v2`. The original `/api/v1/plan-preview` retains its calculation behavior. Legacy `/api/plans` documents remain stored, but their routes now require authorized sessions. The new engine does not silently recalculate old saved plans. Its new `OptimizerPlan` collection stores version 2 input/result snapshots, while the original `HolidayPlan` schema remains readable.

The public contract is `frontend/public/openapi-v2.json`; the human reference is `frontend/public/optimizer-api.html`. The v1 reference and `llms.txt` link to the new version without replacing the old contract. Keep the two versions separate: v1 accepts years 2024–2030 and a 0–365 allowance with the legacy free bridge strategy; v2 accepts years 2024–2100 and allowance 0–366 with the free maximum-time-off default, explicit free balanced objective and verified Premium longest-vacation strategy.

## Endpoint reference

- `GET /session`: inspect current verified identity and Premium state. An absent token is anonymous; an invalid supplied token is 401.
- `GET /holidays/:year?country=…&region=…`: read applicable Public holidays, available provider regions and source metadata.
- `POST /optimize`: calculate a nonpersistent result. Anonymous callers may use maximum-time-off (default) or balanced planning, region, approved leave, excluded dates and locked intervals.
- `POST /plans`: generate and create a new owner-scoped snapshot from `{ input, title? }`. Requires authentication; permitted basic plans can be saved by free accounts. Title length is at most 120 characters. Infeasible plans cannot be saved.
- `GET /plans`: return up to 30 snapshots owned by the caller, newest first, without regeneration.
- `POST /plans/:id/export`: export an owned saved snapshot as iCalendar, with `{ mode: 'leave' | 'breaks' }`. Requires verified Premium ownership. There is no new arbitrary-ID public-read endpoint or unauthenticated export.
- `POST /events`: after opt-in, accept exactly `{ event }` and increment a UTC day/event aggregate. It does not accept planning dates or other personal settings.

The supported analytics event identifiers are `opened`, `generated`, `strategy_selected`, `recommendation_accepted`, `regenerated`, `saved`, `export_requested`, `upgrade_initiated` and `purchase_completed`. These are counts of client-reported actions, not authoritative evidence of payment or account entitlement. Actual purchase entitlement remains owned by checkout/payment handling.

## Authentication and entitlements

Successful verified passkey registration/login or magic-link verification add an opaque `sessionToken` to the existing response. Protected v2 clients supply `Authorization: Bearer <sessionToken>`. Sessions last 14 days and are stored as hashes. Requests read the current database account and require `isPremium === true` for paid capabilities. Sending a user ID, plan ID, email or `isPremium` flag does not authenticate a caller. Existing signed-in browser state without a session token must sign in again for protected v2 actions. See `docs/optimizer-auth.md` for issuance and registration ownership checks.

`POST /api/users/init` and `POST /api/users` without a bearer create a new anonymous account and return a secure `sessionToken`; they do not recover accounts by browser ID or email. An existing valid bearer returns the current safe profile. An unauthenticated email request returns 401, and an identity mismatch returns 403. `GET /api/users/:id` and all `/api/plans` operations require the owning session. A caller-supplied old `browserId` cannot recover an existing account or its plans; access requires verified account login. The unverified `/api/users/claim` endpoint is retired (HTTP 410). Verified passkey or magic-link flows can claim the authenticated anonymous account, not an account identified solely by browser ID. User responses omit browser IDs, credentials and authentication challenges.

The `longest_vacation` strategy requires Premium; `maximum_time_off` and `balanced` are free. The following fields also require Premium whenever supplied: `horizon`, `workingDays`, `companyHolidays`, `holidayWorkingDates`, `preferredMonths`, `minBreakLength`, `maxBreakLength`, `preferredBreakLength`, `maxBreaks`, `minSeparationDays`, `seasonalWeight`, `requiredSummerBreak`. Omit fields unavailable to the caller, including when their value would equal the default. Basic approved/excluded/locked edits remain usable without a paid account.

The iCalendar download is gated at the backend and reads the caller's saved snapshot. Public calculation data does not grant access to the paid export. The longest-vacation strategy, advanced settings and exports remain paid; maximum-time-off is now free. Checkout contracts remain in place. Version 2 does not introduce collaborative planning; that remains a separate feature proposal.

## Result semantics

All dates are `YYYY-MM-DD` calendar dates, with inclusive break endpoints. `usedDays` is new leave only; `remainingDays` is the unused allowance. `totalDaysOff` is the union of calendar dates in selected breaks, including their applicable public holidays and regular non-working days. It is not all annual weekends or an amount of newly earned leave. `longestVacation` and `breakCount` describe selected breaks.

`unusedAllowanceReason` is null when all allowance is used. Otherwise it is `infeasible_constraints`, `balanced_objective`, or `no_additional_leave_within_optimal_plan_and_constraints`. The maximum-time-off and longest-vacation defaults are minimum length 1, maximum length 366, maximum count 366 and separation 1. Explicit balanced retains defaults 3, 21, 4 and 21 respectively.

The calendar can mark a date as public holiday, company holiday, approved leave, excluded or regular non-working simultaneously. `requiresLeave` incorporates the configured workweek and all applicable off-day categories. A public holiday explicitly configured as worked does not remove leave cost by itself. `recommendedLeave` identifies newly selected dates. The suggestions expose exact new `leaveDates`, public holidays, approved leave, locks and localized descriptions/reasons.

A feasible calculation with no candidate breaks returns a valid empty result. An infeasible hard requirement returns HTTP 200, `status: 'infeasible'`, `constraintsSatisfied: false` and violation identifiers; saving such a result returns 400. Never treat infeasibility as implicit relaxation. Invalid fields or malformed date boundaries are input errors. Refer to the architecture document for the exact balanced score, tie-breaking and bounded dynamic-programming objective.

`previewUrl` includes country, year, allowance, strategy and optional region. Personal approved/excluded dates, locks, company holidays and other constraints are deliberately omitted. `linkScope: 'basic-inputs-only'` makes this limitation machine-readable. It is a ready-filled entry point, not a full private-plan sharing URL. The current frontend date state and saved snapshot are separate.

## Holidays, localization and export

Nationwide Public holidays are the default. A selected provider region adds only rows applicable to that exact subdivision. Unknown regions fail with 400; fallback must be an explicit choice. Source metadata identifies region, scope and retrieval time. A source retrieval timestamp is not the last legal change. Provider regional granularity can be coarser than municipal or employer entitlement; see `docs/holiday-reliability.md`.

Suggestion descriptions/reasons and general API errors support `en`, `no`, `nl`, `de`, `fr`, `es`, `sv`, `da`. Stable identifiers, objective metadata, validation details and provider names can remain English or provider-local. Localized display never changes the underlying calendar date.

Exports use all-day `VALUE=DATE` events and an exclusive `DTEND`. `leave` emits newly requested leave dates individually; `breaks` emits entire suggested ranges. Events are tentative planning information and neither submit nor approve an employer leave request. Reading/exporting a snapshot preserves the calculation saved at creation.

## Operational behavior

All v2 endpoints share 30 requests per client and 300 per process in each fixed 60-second window. A 429 currently includes `Retry-After: 60`; process-local quotas do not substitute for fleet-wide edge limits. Reverse proxies can cause clients to share an IP quota unless the actual topology is configured safely. Responses are `no-store` and `noindex`.

The provider has an eight-second timeout, coalesced country-year requests and a 24-hour validated cache of at most 128 entries per process. Expired data is not silently reused on failure. The response envelope is `{ error: { code, message, details? } }`. Codes include `INVALID_INPUT` (400), `AUTH_REQUIRED` (401), `PREMIUM_REQUIRED` (403), `NOT_FOUND` (404 for an unowned/missing export), `RATE_LIMITED` (429), `HOLIDAY_DATA_UNAVAILABLE` and `SERVICE_UNAVAILABLE` (503). Error messages should not contain internal secrets.

## Deployment and compatibility checks

Deploy the new routes together with the new Session, OptimizerPlan and PlanningMetric models; allow their indexes to be created by the existing Mongo setup. No existing HolidayPlan documents are rewritten or deleted. No new paid dependency or signing-secret configuration is required. Existing authentication responses are extended additively, but a client must acquire a verified bearer token before v2 saving, Premium settings or export.

Verify old v1 responses and legacy saved plans, anonymous maximum-time-off and balanced planning, rejected advanced fields, valid Premium calculations, owner-only listing/export and old-token reauthentication. Validate `/openapi-v2.json` and `/optimizer-api.html` as actual public files with short/revalidation caching. Test on the deployed proxy topology; local tests do not verify email delivery, hardware passkeys, production indexes, provider legislation or purchase completion.
