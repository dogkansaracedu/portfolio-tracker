-- Signup allowlist
--
-- Gates signup with a database-backed email allowlist instead of either
-- (a) keeping signup wide open behind a private URL or (b) toggling the
-- Supabase "Allow new users to sign up" provider switch on/off every time
-- you want to add a friend. The allowlist lives in a regular Postgres
-- table so it's editable via SQL Editor, queryable, and auditable. No
-- redeploy needed to add/remove emails.

-- ─── Allowlist table ────────────────────────────────────────────────
-- Email is stored lower-cased. The CHECK enforces that going in.
CREATE TABLE IF NOT EXISTS public.signup_allowlist (
  email    text PRIMARY KEY CHECK (email = LOWER(email)),
  added_at timestamptz NOT NULL DEFAULT now(),
  note     text
);

-- Lock the table down. RLS on, no policies → only the service role and
-- definer-context functions can read/write. Authenticated users can't
-- enumerate who's allowlisted.
ALTER TABLE public.signup_allowlist ENABLE ROW LEVEL SECURITY;

-- ─── Grandfather currently existing users ──────────────────────────
-- Anyone who already has an auth.users row stays signable-in. Without
-- this, the trigger below would block the existing accounts the next
-- time they (somehow) re-signed up. More importantly, it keeps the
-- migration safe to apply on a live database.
INSERT INTO public.signup_allowlist (email, note)
SELECT LOWER(u.email), 'pre-existing user (grandfathered)'
FROM auth.users u
WHERE u.email IS NOT NULL
ON CONFLICT (email) DO NOTHING;

-- ─── Enforcement trigger ───────────────────────────────────────────
-- BEFORE INSERT on auth.users → if the email isn't on the allowlist,
-- raise an exception. The exception rolls back the auth.users insert,
-- so no auth account is created for unallowlisted emails.
--
-- SECURITY DEFINER + locked search_path so the function runs as the
-- migration owner (bypasses the table's RLS for the SELECT) without
-- being susceptible to search-path tricks.
CREATE OR REPLACE FUNCTION public.enforce_signup_allowlist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NULL THEN
    RAISE EXCEPTION 'signup blocked: email is required';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.signup_allowlist
    WHERE email = LOWER(NEW.email)
  ) THEN
    RAISE EXCEPTION
      'signup blocked: % is not on the allowlist', NEW.email;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_signup_allowlist_trg ON auth.users;
CREATE TRIGGER enforce_signup_allowlist_trg
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_signup_allowlist();

-- ─── Operator notes (no DDL — kept here for discoverability) ────────
-- Add an email:
--   INSERT INTO public.signup_allowlist (email, note)
--   VALUES (LOWER('friend@example.com'), 'Friend X');
--
-- Remove an email (does NOT delete their existing account if any):
--   DELETE FROM public.signup_allowlist WHERE email = LOWER('foo@bar.com');
--
-- List:
--   SELECT email, added_at, note FROM public.signup_allowlist ORDER BY added_at;
