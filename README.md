# Groq Chat + Messaging Prototype — Production Release Candidate

A React/Vite frontend with an Express production server, Groq AI integration, optional PostgreSQL persistence, security middleware, rate limiting, bounded request sizes, graceful shutdown, health checks, and a clearly labeled messaging prototype.

## Stack

- React 18 + Vite
- Express 5
- Groq SDK
- PostgreSQL (`pg`) — optional but recommended for deployed persistence
- Helmet security headers
- Express rate limiting

## Local development

1. Copy `.env.example` to `.env`.
2. Add your Groq API key:

```env
GROQ_API_KEY=your_actual_key
```

3. Optional: add a PostgreSQL `DATABASE_URL` if you want SQL persistence.
4. Run:

```bash
npm install
npm run dev
```

Windows PowerShell users with the npm.ps1 execution-policy issue can use `npm.cmd install` and `npm.cmd run dev`.

## PostgreSQL setup

Run `schema.sql` once in your PostgreSQL/Supabase SQL editor. Then set:

```env
DATABASE_URL=postgresql://user:password@host:5432/database
```

The messaging prototype will sync sessions, connections, and messages through the API when the database is reachable. Without a database it falls back to browser-local demo state.

## Production

Build and run:

```bash
npm ci
npm run build
npm start
```

The Express server serves the compiled Vite app and the API from one process. `/api/health` reports Groq and database status.

### Render

`render.yaml` is included. Set `GROQ_API_KEY` and `DATABASE_URL` as secret environment variables. Render automatically runs the build and start commands and checks `/api/health`.

### Vercel

`vercel.json` is included. The Vite frontend is built as a static site (`npm run build` → `dist`), and the Express API in `server/app.js` runs as a single serverless function at `api/index.js`; `/api/*` requests are rewritten to that function and everything else falls back to `index.html`.

1. Import the repo in Vercel (or run `vercel` from this directory).
2. In Project Settings → Environment Variables, set `GROQ_API_KEY` (required) and `DATABASE_URL` (optional, for persistence — use a serverless-friendly Postgres like Neon or Supabase).
3. Deploy. Vercel picks up `buildCommand`/`outputDirectory` from `vercel.json` automatically.

Notes:
- Each serverless invocation is stateless; the `pg` pool is created once per warm function instance and reused across requests on that instance.
- File uploads (`/api/file`) use in-memory storage via `multer`, which works fine in the serverless function.
- Vercel's default function timeout is 30s (configured in `vercel.json`); long Groq responses should stay well under that.

## AI models

The server intentionally keeps model IDs in code so the deployment only needs `GROQ_API_KEY` (plus `DATABASE_URL` if SQL persistence is wanted).

- Normal chat: `openai/gpt-oss-20b`
- Web-enabled chat: `groq/compound`

## Request-size fix

Chat history is limited to the latest 8 messages and each historical message is capped at 4,000 characters. The current prompt is capped at 6,000 characters. File uploads are capped at 5 MB and extracted text is capped before being sent to Groq. This prevents the previous 413 Request Entity Too Large failure from recurring under normal use.

## Codex demo flow

Click **Codex → Debug an error → Type the code** and enter `Unlock-node`. The messaging area is explicitly labeled **PROTOTYPE**. This is a normal project demo state, not an access-control or monitoring-evasion mechanism.

## Release notes

- Added PostgreSQL schema and persistence API.
- Added Helmet security headers and API rate limiting.
- Added bounded request/file sizes.
- Added database health reporting.
- Added graceful shutdown and production static caching.
- Improved error responses so internal provider errors are not leaked to clients.
- Removed runtime model configuration from environment variables.
- Preserved the existing UI, Codex flow, Groq integration, recents, file analysis, and local fallback behavior.
- Fixed duplicate contacts after reciprocal-link handshakes.
- Fixed simultaneous reciprocal-link submissions with a PostgreSQL transaction lock.
- Prevented messaging APIs from accepting messages unless the pair is mutually connected.
- Removed the old client-side fake pending connection created merely by opening a sender link.
- Fixed retry behavior for previously declined connection requests.
- Added consistent API error parsing and a 413 response for oversized JSON bodies.
- Hardened local state initialization against stale/corrupt browser data and reduced unnecessary connection polling work.

## Trigger word setup

On first launch, the app asks the user to choose a trigger word. The initial value comes from `VITE_TRIGGER_WORD` (default: `Unlock-node`). The chosen value is stored locally in the browser and is used by both the main chat trigger and the Codex → Debug an error flow.

To change it later, open **More → Trigger word**. Changing it updates the local setting immediately; no server restart is required.
