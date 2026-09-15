# Production Release Checklist

## Required
- [ ] Set `GROQ_API_KEY` in the hosting provider.
- [ ] Run `schema.sql` on PostgreSQL/Supabase if SQL persistence is required.
- [ ] Set `DATABASE_URL` in the hosting provider for SQL persistence.
- [ ] Confirm `/api/health` returns `ok: true` and `database: ok`.

## Before launch
- [ ] Test normal Groq chat.
- [ ] Test a long conversation to confirm the previous 413 request-size bug is fixed.
- [ ] Test a supported file upload and a >5 MB upload rejection.
- [ ] Test Codex → Debug an error → Type the code.
- [ ] Test messaging with SQL enabled and verify rows are written to `messages`.
- [ ] Test messaging with SQL disabled and verify local fallback still works.
- [ ] Review API rate limits for the expected traffic level.
- [ ] Add real authentication/authorization before using the messaging prototype for real users. The current SQL layer is persistence, not an identity system.
