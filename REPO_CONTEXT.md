# Repository context (for AI assistants)

Read this file first when working in this repo. Update it when the project’s purpose, layout, or tooling changes.

## Summary

Full-stack product: **Angular** frontend (`frontend/`) with SSR/prerender scripts, and **Express** backend (`backend/`) using MongoDB, Stripe, Resend/Nodemailer, WebAuthn (`@simplewebauthn/server`), etc.

## Stack

- `frontend/` — Angular 20 application builder: production `ng build` emits browser + Node server + static prerender (render modes and public routes in `frontend/src/app/app.routes.server.ts`). Scripts: `build` / `build:ssr` / `build:prerender` (production build), `serve:ssr` → `node dist/frontend/server/server.mjs`
- `backend/` — Express 5, ESM (`src/app.js`), `npm run dev` via nodemon
- `hopladay.code-workspace` — multi-root workspace file for editors

## Layout

- `frontend/` — UI and SSR bundle output under `dist/` when built
- `backend/` — API and server logic

## Entry / run

- Backend: `cd backend && npm install && npm run dev`
- Frontend: `cd frontend && npm install && npm start` (or SSR flows per scripts)

## Related docs

- `frontend/README.md` if present; add root README when available.

## Public previews and discovery

- Production frontend build aliases run `npm run build`: preserve the prerendered English root and verify public HTML via `frontend/scripts/verify-public-html.mjs`. Do not replace it with `index.csr.html`.
- Anonymous GET `/api/v1/plan-preview`: `backend/src/routes/preview.js` + `services/previewService.js`; uses the existing planner with `isPremium:false`, nationwide Public holidays only, and no database writes.
- `/:lang/preview` is separate from the account dashboard and cannot replace saved plans.
- Public reference: `frontend/public/api-docs.html`, `openapi.json`, `llms.txt`. Release checks and hosting rules: `docs/llm-preview-release.md`.
- Tests: `npm --prefix backend test`; `npm --prefix frontend test -- --watch=false --browsers=ChromeHeadless`.

## Annual optimizer (version2)

- Pure engine: `backend/src/services/annualOptimizer.js` and `calendarModel.js`; exact budgeted interval DP with three declared objectives. Legacy planner remains unchanged.
- `/api/v2` routes: anonymous balanced optimization; verified bearer sessions for saves, current Premium checks for advanced inputs/strategies and saved exports. New `Session` and `OptimizerPlan` collections; old `HolidayPlan` data is not recalculated.
- New homepage and `/:lang/optimize`: `frontend/src/app/annual-planner`; original dashboard remains at `/:lang/plans`. All eight locales use existing TranslationService.
- Region-aware source: `holidayCatalog.js`; immutable export snapshots use all-day dates and never submit employer requests.
- Country/year pages: `backend/scripts/generate-landings.js`, audited public fixtures, and `frontend/public/landing-routes.json`. Node host disables directory redirects before serving these routes.
- Public v2 reference: `frontend/public/optimizer-api.html`, `openapi-v2.json`; release/migration/limits under `docs/annual-optimizer/`.
- Opt-in funnel counts store only UTC day/event totals. No external analytics service.
