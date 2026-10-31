# Annual optimizer architecture and delivery

Baseline (2026-10-31): Angular 20, Express 5, MongoDB. Existing suites: 12 backend and 13 frontend tests pass; production prerenders 41 routes. No lint script exists. Production Angular build includes template/type checking. Legacy saved-plan routes call a greedy planner and persist Date timestamps; public v1 previews are explicitly free one-day bridges. Calendar/export/account UI already exists and is retained.

Use a new pure calendar model (ISO local-date strings and integer ordinals) and a deterministic interval optimizer. Keep legacy routes, planner and stored records unchanged. Version new contracts at /api/v2. New optimizer records carry version2 and never silently replace version1 plans. Calendar/export UI consumes explicit leaveDates rather than inferring PTO from weekdays. New advanced API access uses server-issued bearer sessions; existing public userId fields are not credentials.

Objectives and bounds:
- maximum_time_off: maximize distinct days in qualifying nonadjacent breaks, then preferred-month days, then minimize leave used, then break count; deterministic chronological tie-breaking.
- longest_vacation: first maximize the longest break, then maximize distinct covered days, preferred-month days, and minimize leave use/break count. A feasibility scan identifies the longest feasible principal break accounting for locks and the required summer interval; the interval DP then requires a break of that length.
- balanced: maximize a documented additive utility: 10*min(length,preferredLength) - 3*abs(length-preferredLength) + 2*preferredMonthDays + seasonalWeight*proximityToQuarterMidpoint. Minimum separation and number/length bounds are hard; seasonal utility is a preference, never a promise of one break each season.
- Candidate intervals cover all starts/ends in the configured horizon, maxLength <=90 days, maxBreaks <=12, allowance <=366, year2024..2100. A recommended interval must require new leave or contain existing approved leave. Pure weekends are not recommended as newly earned vacation. Adjacent intervals are incompatible: choose their combined interval if feasible. Exclusions remove whole intervals containing an excluded date.
- Dynamic programming over end boundary, exact new-leave cost, break count and at most two requirement flags. Stable first-seen ties; no stochastic or LLM calls. No exponential search. Output reports exactness only for the declared finite model. Locked intervals are validated and charged once, then remain fixed.

Delivery ledger (local reviewable commits; no remote publication authorized by this request):
1. Calendar model, fixtures and reference tests.
2. Exact interval engine, brute-force and generated property tests, reproducible benchmark.
3. Versioned API, explanations, server entitlement and versioned persistence.
4–6. Accessible year calendar, accept/reject/lock/edit/regenerate/reset, progressive configuration and anonymous homepage flow.
7. Regional holiday provider, locale-aware dates and all-day exports with preserved Premium gates.
8. Small useful country/year landing-page set generated from the engine, public contracts and opt-in aggregate analytics. Collaborative planning stays a separate proposal.

No new runtime dependencies, no framework/database replacement, no recalculation or migration of existing saved plans. Performance results are local observations, not claims about an unmeasured production deployment. Production funnel outcomes need real traffic after deployment.
