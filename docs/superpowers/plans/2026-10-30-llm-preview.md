# Hopladay readable HTML and public previews

Goal: serve readable public HTML and anonymous, free-tier calculations with reproducible links and public documentation.

Approved scope: the six-step roadmap in this chat; implement HTML, preview API, links and docs. Premium restrictions remain unchanged. No deployment or publication requested.

Architecture: preserve Angular prerendering and Express. A separate preview route reuses generateHolidayPlan with isPremium:false, never imports account/plan models, and fetches validated nationwide Public holidays from Nager.Date. A dedicated Angular preview screen avoids all dashboard account initialization and saved-plan mutations. Use www.hopladay.com consistently.

- [x] HTML: preserve readable English root fallback; verify all localized pages after production builds. Keep SSR-safe metadata and private route exclusions. Document hosting rules.
- [x] API: GET /api/v1/plan-preview; strict scalar inputs (country, year 2024–2030, availableDays 0–365, balanced preference, lang). Reject premium inputs; return exact leave dates, totals, source/freshness, assumptions and preview URL. Bounded per-IP and global limits, bounded cache, single-flight holiday requests, timeout and 503 errors. No user/plan writes.
- [x] Links: separate read-only localized preview route with editable inputs, loading/error/empty states, keyboard-accessible controls, and noindex for query permutations. Existing dashboard links to it.
- [x] Docs: public API reference, OpenAPI schema and llms.txt, linked from homepage. Explain national-only coverage and Monday–Friday assumptions, free-tier heuristics and incomplete budget use.
- [x] Verify: real HTTP route tests, premium rejection, malformed inputs, caching/throttling/upstream failure, zero budget and calendar invariants; build artifact assertions; frontend tests and production build; desktop/mobile inspection.

Rulings: work on codex/llm-preview in the supplied checkout; original tracked tree was clean. Leave unrelated untracked files untouched and add specific secret-file exclusions. Existing frontend suite fails to compile (obsolete component imports and obsolete src/prerender.ts); repair its setup to enable meaningful verification, without changing existing product behavior. Current backend starts only after Mongo/Stripe initialization; test preview router in an isolated Express server and document this runtime dependency rather than refactoring startup.


Verification (2026-10-30): 12 backend tests pass; 13 frontend tests pass; production build prerenders 41 routes and passes HTML assertions for readable content, canonical host, language, noindex and docs. Production HTTP smoke test passes for localized content, query preview noindex, mutable documentation revalidation and immutable hashed assets. Browser inspection at desktop and 390px width verified real Norway 2027 results, editable allowance and zero-budget state, with no horizontal overflow. A live Nager.Date request produced the documentation example. Legacy smoke specs emit missing-translation warnings because they do not load locale files; production prerendered translations pass artifact checks.

Final review: independent reviewer found malformed upstream localName acceptance and long caching of mutable docs; both fixed and verified. Static noindex and server document language were also fixed. Runtime smoke exposed a pre-existing Angular build-mode mismatch: moved to outputMode:server with explicit public prerender routes and client rendering for private flows, then verified the real server over HTTP. No new runtime dependencies. No deployment, push or production configuration changes performed.
