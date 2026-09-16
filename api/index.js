// Vercel serverless entry point.
// Vercel routes every request matching the /api/(.*) rewrite (see vercel.json)
// to this function. It reuses the same Express app used for local dev and
// traditional hosts (Render) — see server/app.js.
//
// Neon’s Vercel integration provides POSTGRES_URL. The existing backend
// expects DATABASE_URL, so map it here without exposing or copying secrets.
if (!process.env.DATABASE_URL && process.env.POSTGRES_URL) {
  process.env.DATABASE_URL = process.env.POSTGRES_URL;
}

const { default: app } = await import('../server/app.js');

export default app;
