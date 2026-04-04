# Repository context (for AI assistants)

Read this file first when working in this repo. Update it when the project’s purpose, layout, or tooling changes.

## Summary

Full-stack product: **Angular** frontend (`frontend/`) with SSR/prerender scripts, and **Express** backend (`backend/`) using MongoDB, Stripe, Resend/Nodemailer, WebAuthn (`@simplewebauthn/server`), etc.

## Stack

- `frontend/` — Angular (see `package.json` scripts: `ng serve`, `build:ssr`, `serve:ssr`)
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
