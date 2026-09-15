// Vercel serverless entry point.
// Vercel routes every request matching the /api/(.*) rewrite (see vercel.json)
// to this function. It reuses the same Express app used for local dev and
// traditional hosts (Render) — see server/app.js.
import app from '../server/app.js';

export default app;
