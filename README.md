# Setup

1) **Install Node.js (LTS)** and ensure `npm` is available.
2) Create a local `.env` with your Supabase connection details:
   - `DATABASE_URL` (use the Supabase PgBouncer URL on port 6543, includes `pgbouncer=true&sslmode=require&connection_limit=1&pool_timeout=0`)
   - `DIRECT_URL` (Supabase writer URL on port 5432 for Prisma migrations)
3) Install deps and prep Prisma:

```bash
npm install
npx prisma generate
npx prisma db push   # or prisma migrate deploy if you maintain migrations
npm run dev
```

# Deployment notes (Vercel + Supabase)
- Set `DATABASE_URL` in Vercel to the PgBouncer URL (Supabase “pooler” host, port 6543).
- Set `DIRECT_URL` to the writer URL (Supabase “postgres” host, port 5432) so Prisma migrations work without PgBouncer.
- Re-run `prisma generate` after changing the env values in CI/CD if needed.
