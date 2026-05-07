# Free Deploy — Design

**Date:** 2026-05-07
**Status:** Approved (interactive step-by-step run)
**Scope:** Deploy frontend (Vercel) + backend (Supabase Cloud) for two-user personal use. No GitHub repo. No CI. After this, sen + eşin canlı ortamda hesap açar ve uygulamayı kullanır.

---

## 1. Goal & non-goals

**Goal:** Pre-deploy stabilization branch'in (master'a merge sonrası) production'da çalışır halde. URL'lere browser'dan erişilince login → dashboard → transactions tam çalışıyor. Cron daily snapshot atıyor.

**Non-goals:**
- GitHub repo (yok — şirket bilgisayarındaki ayrım için)
- CI / auto-deploy (yok — manuel `npm run deploy`)
- Custom domain (sonra eklenebilir; başta `*.vercel.app` subdomain)
- Multi-environment (sadece prod)

---

## 2. Architecture

```
┌─────────────────────┐         ┌──────────────────────────┐
│  Vercel             │         │  Supabase Cloud          │
│  (frontend)         │         │  (db + auth + edge fns + │
│  React SPA static   │ ──────> │   pg_cron)               │
│  build = dist/      │  HTTPS  │                          │
└─────────────────────┘         └──────────────────────────┘
        ▲                                  ▲
        │                                  │
        │ npm run build && vercel --prod   │ supabase db push
        │                                  │ supabase functions deploy
        │                                  │ supabase secrets set
        └──────── you (manual) ────────────┘
```

**Frontend:** Vite production build, static `dist/` upload to Vercel via `vercel --prod`. Vercel hosts; CDN; free TLS. No GitHub integration.

**Backend:** New Supabase Cloud project (Frankfurt region, free tier). Migrations push from local CLI. Edge functions deploy from local CLI. Secrets (`CRON_TOKEN`, `ALLOWED_ORIGINS`) set via `supabase secrets set`. Postgres GUC `app.cron_token` set via SQL Editor.

**No code changes** required for deploy beyond `.env.production.local` for frontend env vars.

---

## 3. Step-by-step phases

### Phase A: Pre-flight (local repo prep)

1. Merge `chore/pre-deploy-stabilization` → `master` locally (no PR ceremony per user pref).
2. Add `.env.production.local` to project root (gitignored automatically) with `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` placeholders to be filled after Phase B.
3. Add `npm run deploy` script to `package.json`: `"deploy": "npm run build && vercel --prod"`.

### Phase B: Supabase Cloud (backend first)

1. Sign up / login `app.supabase.com` with personal email.
2. Create new project: name `portfolio-tracker`, region Frankfurt, free tier, strong DB password.
3. Note **Project Ref** (URL fragment) and **anon public key** (Settings → API).
4. Local CLI: `supabase login` (browser auth).
5. `supabase link --project-ref <ref>`.
6. `supabase db push` — applies all local migrations to Cloud.
7. Generate cron token: `openssl rand -hex 32`. Save to scratch.
8. Set Edge Function secrets:
   ```
   supabase secrets set CRON_TOKEN=<token>
   supabase secrets set ALLOWED_ORIGINS="*"   # TEMP — narrowed in Phase D
   ```
9. Set Postgres GUC via Dashboard SQL Editor:
   ```sql
   ALTER DATABASE postgres SET app.cron_token = '<same-token>';
   ```
10. Deploy Edge Functions: `supabase functions deploy <name>` for each of: backfill-snapshots, fetch-coingecko, fetch-historical-rate, fetch-prices, fetch-tcmb, fetch-yahoo, take-snapshots. (Or `--all` if CLI version supports.)
11. Verify cron job exists: Dashboard → Database → Cron Jobs → `daily-portfolio-snapshot` listed.

### Phase C: Frontend deploy (Vercel)

1. Fill `.env.production.local` with values from Phase B (URL = `https://<ref>.supabase.co`, anon key from Settings → API).
2. `npm i -g vercel`.
3. `vercel login` (personal email; use a personal browser profile if mixed with company SSO).
4. From repo root: `vercel --prod`.
5. CLI prompts answered:
   - Set up and deploy: yes
   - Scope: personal account
   - Link to existing: no
   - Project name: `portfolio-tracker`
   - Directory: `./` (default)
   - Framework: Vite (auto-detected)
   - Build command: `npm run build` (default OK)
   - Output directory: `dist` (default OK)
   - Override settings: no
6. Note the production URL Vercel returns (e.g. `portfolio-tracker-xyz.vercel.app`).

### Phase D: CORS narrow + signup flip + smoke

1. Update `ALLOWED_ORIGINS` to the real Vercel URL:
   ```
   supabase secrets set ALLOWED_ORIGINS="https://<vercel-url>"
   ```
2. Re-deploy all 7 Edge Functions so they pick up the new env. (Function instances cache env at boot.)
3. Sign up dev account at `https://<vercel-url>/signup` (10+ char password).
4. Sign up spouse account same way.
5. Disable signup: in Supabase Dashboard → Auth → Providers → Email → toggle "Enable Sign Ups" off. (CLI `supabase config push` may not exist on every CLI version; dashboard toggle is the simplest path.)
6. Smoke flow (~5 min) — see Section 4.
7. Trigger cron manually to confirm token wiring (SQL Editor):
   ```sql
   SELECT net.http_post(
     url := 'https://<ref>.functions.supabase.co/take-snapshots',
     headers := jsonb_build_object(
       'Content-Type', 'application/json',
       'X-Cron-Token', current_setting('app.cron_token')
     ),
     body := '{}'::jsonb
   );
   ```
   Then check `SELECT id, status_code FROM net._http_response ORDER BY id DESC LIMIT 1;` — expect 200.

### Phase E: (Optional, deferred) Custom domain

If/when a custom domain is desired:
1. Buy via Cloudflare Registrar (~$10/yr) or any registrar.
2. Add domain in Vercel → Domains; follow DNS instructions.
3. Add domain to `ALLOWED_ORIGINS` (comma-separated) and re-deploy functions.

---

## 4. Smoke test (Phase D step 6)

1. Login as dev → Dashboard renders with empty state (or seeded data if seed runs on first signup).
2. Add a buy transaction (e.g., 0.001 BTC at `Binance`).
3. Portfolio + Dashboard reflect the holding.
4. Edit transaction (change amount).
5. Delete transaction.
6. Navigate to Performance → chart loads (Recharts chunk arrives in Network tab on this navigation, not on Dashboard).
7. Navigate to Settings → Snapshots Backfill → click backfill (will JWT-auth via session).
8. Logout → Login again → state clean.
9. (After cron fires next day, or after manual trigger) Confirm a snapshot row in `snapshots` table for today.

---

## 5. Verification checklist

- [ ] H1: `rpc('seed_user_data', { p_user_id: '<random-uuid>' })` from browser console throws `cannot seed for another user`.
- [ ] H2: `curl -X POST https://<ref>.functions.supabase.co/backfill-snapshots` (no auth) returns 401; UI Backfill works.
- [ ] M1: `curl -X POST https://<ref>.functions.supabase.co/take-snapshots` (no token) returns 401; with `-H "X-Cron-Token: <token>"` returns 200; cron run visible in Edge Function logs.
- [ ] M2: OPTIONS preflight from non-allowlisted origin doesn't reflect that origin.
- [ ] M3: signup with 6-char password rejected (test before disabling signup in Phase D step 5).
- [ ] B2 verified locally already (lazy chunks visible in Vercel deployment too).
- [ ] B4 verified locally already (single transactions fetch on Dashboard mount).
- [ ] After Phase D step 5: signup attempt at `/signup` is rejected by Supabase (auth disabled).

---

## 6. Risks & rollback

| Risk | Mitigation |
|---|---|
| Cron job calls `kong:8000` URL (local-only hostname) on Cloud | Cloud uses different routing — verify after `db push` whether the cron migration's hardcoded URL works. If not, write a new forward migration patching the URL to `https://<ref>.functions.supabase.co/take-snapshots`. |
| `supabase functions deploy --all` not supported on installed CLI version | Loop deploy each function name individually (already the default plan). |
| Vercel free tier login sessions expire on company laptop browser profile | Use `vercel logout` then re-login when needed; deploy commands prompt re-auth on expiry. |
| Forgotten `.env.production.local` → frontend can't reach Supabase | Phase C step 1 explicitly creates the file. Build will succeed but app errors at runtime — easy to spot. |
| `supabase secrets set` updates env but functions cached old values | Always re-deploy functions after secret change (Phase D step 2). |
| Missing `app.cron_token` GUC at run time → cron sends NULL header → 401 | Phase B step 9 sets it. Verify in SQL Editor: `SHOW app.cron_token;`. |
| Dev account password mistake → can't log in | Supabase password reset flow works (`enable_confirmations = false` means email link must be opened, but reset still arrives). |
| Lost CRON_TOKEN | Re-generate, set both via `supabase secrets set` and `ALTER DATABASE postgres SET app.cron_token`. Both must match. |

**Rollback:**
- Vercel: `vercel rollback` to previous deployment.
- Supabase: forward migration to undo schema changes; for secrets, just `supabase secrets set` again.
- Total disaster: free tier means delete project, recreate.

---

## 7. Done definition

- Frontend live at `https://<vercel-url>` and reaching Supabase.
- Both accounts created and tested.
- Signup disabled in dashboard.
- Cron job listed and last manual trigger returned 200.
- Smoke flow passes.
- Audit verification checklist (Section 5) all green.

---

## 8. Open follow-ups (not in this spec)

- Custom domain (Phase E, deferred).
- Auto-deploy / CI (out of scope — solo project).
- M4 input validation, L1-L4 audit items — still open in audit doc.
- PRD updates — small docs commit when next pruning.
