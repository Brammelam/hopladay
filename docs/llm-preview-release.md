# Deploy and verify public previews

## Build and run

Use Node 22 or 24 LTS and the existing installed dependencies. No new runtime dependencies were added.

Frontend (repository root):

```sh
npm --prefix frontend run build-prod
npm --prefix frontend run serve:ssr
```

Public render modes are defined in `frontend/src/app/app.routes.server.ts`; `frontend/src/prerender-routes.txt` lists the corresponding static host paths. Account and payment callback routes render on the client.

The build verifies readable HTML for the root and every localized homepage, FAQ and preview page. It also verifies canonical URLs and public documentation. The Node SSR server can serve the generated routes without a catch-all static rewrite.

For an existing Render static frontend, keep `frontend/dist/frontend/browser` as the publish directory and use `npm --prefix frontend run build-prod` from the repository root (or `npm run build-prod` with `frontend` as root directory). Existing catch-all rewrites must not shadow the generated localized documents. Add exact rewrites for each path in `frontend/src/prerender-routes.txt`, e.g. `/en` → `/en/index.html`, `/no/faq` → `/no/faq/index.html`, and `/en/preview` → `/en/preview/index.html`, ahead of the final wildcard fallback. Serve `/api-docs.html`, `/openapi.json`, `/llms.txt`, `/robots.txt` and `/sitemap.xml` as actual static files. A root fallback now contains readable English content, but it does not substitute for correctly serving localized routes.

Backend: deploy the existing Express app with its existing MongoDB, payment and email configuration. Its normal startup dependencies are unchanged. The preview route itself never imports user, plan or holiday-cache database models, and performs no database writes. It fetches nationwide Public holidays separately so regional filtering cannot change saved-plan calculations. Deploy the backend before enabling frontend links.

The preview API is hosted at `https://hopladay-backend.onrender.com/api/v1/plan-preview`; the public contract and human documentation are hosted at `https://www.hopladay.com/openapi.json` and `/api-docs.html`. The API intentionally shares the existing backend origin. No new reverse proxy is required.

Keep the existing non-www → www redirect. All site canonicals, language alternatives, sitemap URLs and generated preview links now use `www.hopladay.com`. Do not redirect www back to the bare hostname.

## Request controls

The preview router allows 30 requests per client and 300 globally in a fixed 60-second window per process, including invalid requests. It uses Express `req.ip` and does not trust user-supplied forwarded headers. If the host puts all traffic behind the same proxy address, clients share that quota. Configure verified proxy trust or per-client edge limits for the actual deployment topology before increasing volume; never set unconditional `trust proxy: true` on an internet-facing service. Multi-instance deployments need edge limits to enforce a fleet-wide budget.

Provider requests time out after 8 seconds, are coalesced for identical country/year requests, and cache validated data for 24 hours (128 entries maximum per process). No stale fallback is returned after expiry. Preview HTTP responses use `no-store`; website query variants use `noindex`. No account identity is needed or returned. The existing free planner remains authoritative; advanced strategies and exports remain restricted.

## Verify before and after release

```sh
npm --prefix backend test
npm --prefix frontend test -- --watch=false --browsers=ChromeHeadless
npm --prefix frontend run build-prod
npm --prefix frontend run verify:ssr
curl -fsSL https://www.hopladay.com/en
curl -fsSL https://www.hopladay.com/no/faq
curl -fsSL 'https://hopladay-backend.onrender.com/api/v1/plan-preview?country=NO&year=2027&availableDays=20'
```

Inspect the fetched HTML for readable headings and content inside `app-root`, the matching www canonical and correct page language; an empty `app-root` is a failed release. Open the returned `previewUrl`, verify that exact leave dates and totals match the JSON, and confirm that existing saved plans are unaffected. Request `preference=summer_vacation` and `isPremium=true`: both must return 400. Verify zero allowance, invalid inputs, provider failures and 429 retry headers.

Confirm public documentation returns its intended content type and no CDN challenge. Fetch with ordinary, OAI-SearchBot and Googlebot user agents; user-agent spoofing is a smoke check only, not proof that verified crawler IPs can pass the CDN. Check the hosting/CDN rules and Search Console separately. Sitemap changes and valid HTML do not guarantee indexing or assistant citations.

## Deliberate limits

The new human preview screen and API reference are English, including on localized return paths; the preview's `main` element declares English. Preview inputs support the current UI year range, 2024–2030, and the documented country list. Regional holidays, custom workweeks, private saved plans, Premium calculations and Premium exports are outside the public endpoint. Links reproduce inputs using current data, not immutable historical outputs. Search rankings, analytics and production deployment have not been changed by this implementation.
