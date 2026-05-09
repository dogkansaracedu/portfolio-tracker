# Post-Deploy Gaps

**Snapshot date:** 2026-05-09 (end of Phase D session)

Production is live: frontend on Vercel, backend on Supabase Cloud. This doc lists what's *not* yet finished — pickups for a fresh session.

The deploy spec is `docs/superpowers/specs/2026-05-07-free-deploy-design.md` and most of it is done. The items below are the residue.

---

## 1. Disable signup once both accounts exist

**Status:** signup is still **open** on production.

The dev account is created. The spouse account is not yet. Plan when she has time:

1. Open `https://portfolio-tracker-theta-seven.vercel.app/signup` from her device.
2. Sign up with her email and a 10+ character password.
3. Verify she lands on the dashboard with seeded platforms/assets.
4. In the Supabase dashboard: **Authentication → Providers → Email → "Allow new users to sign up" → off**. Save.
5. Verify: from a new browser, visiting `/signup` and submitting should be rejected.

Audit reference: M3.

---

## 2. Audit items still open

These are deferred from `docs/security-audit-2026-05-04.md`. None block the current usage but should be revisited.

| ID | Item | Notes |
|---|---|---|
| M4 | Edge function input validation | Add zod-style schema to `backfill-snapshots` POST body. Defensive; not a current attack surface. |
| L1 | Network restrictions | Single-user app on Supabase Cloud free tier; CIDR allowlist not applicable yet. Revisit if going multi-user. |
| L2 | Edge function rate limiting | Same as L1 — not pressing while we're the only callers. |
| L3 | Service-role key in every function | Convention. Split out a read-only function only if a third-party caller is ever added. |
| L4 | Auth email rate limit (`2/hour`) | UX nit, not security. Note for future. |

---

## 3. Custom domain (optional)

Today the URL is `portfolio-tracker-theta-seven.vercel.app`. If we want a real domain:

1. Buy a domain (Cloudflare Registrar, Namecheap — ~$10/yr).
2. **Vercel → Project → Settings → Domains → Add** and follow the DNS records prompt.
3. Once the domain serves the app:
   - Update `ALLOWED_ORIGINS` to include both:
     ```
     supabase secrets set ALLOWED_ORIGINS="https://yourdomain.com,https://portfolio-tracker-theta-seven.vercel.app"
     ```
   - Redeploy all 7 edge functions so they pick up the new env.

Out of scope until/unless we want it.

---

## 4. Cron monitoring

A `daily-portfolio-snapshot` job runs at 23:55 UTC every day. We have **not** yet observed a real cron firing in production.

Tomorrow morning (or whenever), check **Supabase Dashboard → Edge Functions → take-snapshots → Logs**. There should be a log line around 23:55 UTC the previous day with `200`. If not:

- Verify Vault secrets: `SELECT name FROM vault.secrets;` in SQL Editor — should list `cron_token` and `functions_url`.
- Verify cron job exists: `SELECT jobid, jobname FROM cron.job;` — should show `daily-portfolio-snapshot`.
- Manually trigger to confirm the wiring (worked once during Phase D — see Phase D step 7 in the deploy spec):
  ```sql
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'functions_url') || '/take-snapshots',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Token', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_token')
    ),
    body := '{}'::jsonb
  );
  -- then check:
  SELECT id, status_code FROM net._http_response ORDER BY id DESC LIMIT 1;
  ```

---

## 5. Token rotation policy

`CRON_TOKEN` is currently the same hex value in two places:
- Edge Function env: `supabase secrets set CRON_TOKEN=...`
- Postgres Vault: `cron_token` row

If you ever want to rotate (good hygiene every 6 months):

1. Generate: `openssl rand -hex 32`.
2. Update Edge Function: `supabase secrets set CRON_TOKEN=<new>`.
3. Update Vault: in SQL Editor:
   ```sql
   UPDATE vault.secrets
   SET secret = '<new>'
   WHERE name = 'cron_token';
   ```
4. Redeploy `take-snapshots` so the function instance picks up the new env: `supabase functions deploy take-snapshots`.
5. Manually trigger the cron query above to verify.

---

## 6. PRD update

`PRD.md` is from the pre-deploy era. Things that need refreshing:

- §5 Snapshots: the density model changed (daily-30 + weekly-older, no monthly tier) in commit `b359a22`.
- §9 Settings: the backfill UI is the production interface; "Run backfill" wording should match.
- §16 Status matrix: items closed by the pre-deploy stabilization branch should be marked Done.
- Add a "Cash flow" line as a planned feature (see `docs/cash-flow-feature-discussion.md`).

Small docs commit, not a session of work.

---

## 7. Known limitations (not bugs, but documented gaps)

### CoinGecko free tier — 365-day price history limit

The `backfill-snapshots` edge function fetches CoinGecko price history with `days=365`. Crypto positions older than ~12 months will fail to be priced and will be silently skipped (the `hasUnpriced` guard at `supabase/functions/backfill-snapshots/index.ts:546`).

For a user with crypto bought in early 2024, the chart may have visible gaps in older crypto periods until those dates fall within the rolling 365-day window. Workarounds:

- Pay for CoinGecko Pro tier (~$129/mo) and remove the cap. Overkill.
- Mirror price data from another source (CryptoCompare, Yahoo `BTC-USD`). Code change.
- Accept the limitation; for shorter holding histories it doesn't manifest.

### Form date timezone

Fixed in `f2f9cda` — the buy/sell form was submitting `Date.toISOString()`, which converts the local-day pick to UTC and could shift the calendar day backward in TR (UTC+3). Now the form submits `YYYY-MM-DDT00:00:00Z` from the picker's local Y/M/D. Behaviour confirmed correct for the dev account.

If a transaction was entered before this fix, run the migration query from the Phase D session:

```sql
UPDATE transactions
SET date = (date AT TIME ZONE 'Europe/Istanbul')::date::timestamptz;
DELETE FROM snapshots;
```

Then re-run backfill from Settings.

### Missing snapshots after a "sell all"

Fixed in `c9b69c8` — backfill now writes a 0-valued snapshot for periods when the portfolio is empty (between selling everything and the next buy). Before this fix, the chart showed an interpolated gap that looked like missing data. If you see this on an old snapshot set, delete and re-backfill.

---

## 8. Production smoke flow (still owed)

The Phase D smoke flow was partially done — login, hesap açma, basic transaction add. The full list from the deploy spec §4:

- [x] Login as dev → Dashboard renders with seeded data
- [x] Add a buy transaction → Portfolio + Dashboard update
- [ ] Edit a transaction → Numbers update
- [ ] Delete a transaction → Portfolio updates
- [x] Performance page → Chart loads (recharts chunk arrives in Network tab)
- [x] Settings → Backfill works
- [ ] Logout → Login → state clean

The unchecked items are quick clicks; do them in one sitting next time you open the app.

---

## 9. Quick links

- Production frontend: https://portfolio-tracker-theta-seven.vercel.app
- Supabase project: `hhqwxygrtqcugaxamrtu` (Frankfurt, free tier)
- Spec: `docs/superpowers/specs/2026-05-07-free-deploy-design.md`
- Audit: `docs/security-audit-2026-05-04.md`
- Project review: `docs/project-review-2026-05-04.md`
- Cash flow design (next big feature): `docs/cash-flow-feature-discussion.md`
