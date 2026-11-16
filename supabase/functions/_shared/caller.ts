/**
 * Who is calling an edge function — the pure decision, no Deno or network
 * access, so Vitest can cover it (see src/lib/queries/caller.test.ts).
 *
 * The gateway's `verify_jwt` is not an auth check here: the anon key is itself
 * a valid JWT and ships in the public frontend bundle. A function that acts on
 * user data or spends provider calls must instead resolve the caller to either
 *   - the pg_cron job, holding the shared `X-Cron-Token` secret, or
 *   - a real signed-in user, whose access token the Auth server accepts.
 * Anything else (anon key, service key, expired or forged token) is denied.
 * `_shared/auth.ts` wires this to the request and the Auth server.
 */

export type Caller =
  | { kind: "cron" }
  | { kind: "user"; userId: string; jwt: string }

export type CallerDecision = Caller | { kind: "denied"; reason: string }

/** The token from an `Authorization: Bearer <token>` header, or null. */
export function bearerToken(authorization: string | null): string | null {
  if (!authorization) return null
  const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization.trim())
  return match ? match[1] : null
}

/** True only when a cron secret is configured and the header matches it. */
export function isCronToken(
  provided: string | null,
  expected: string | undefined,
): boolean {
  return !!expected && !!provided && provided === expected
}

export interface ResolveCallerInput {
  authorization: string | null
  cronHeader: string | null
  /** `CRON_TOKEN` from env; undefined when not configured. */
  cronToken: string | undefined
  /** Whether this function has a legitimate cron caller. */
  allowCron: boolean
  /** Ask the Auth server who owns `jwt`; null for anon/service/invalid. */
  getUserId: (jwt: string) => Promise<string | null>
}

export async function resolveCaller(
  input: ResolveCallerInput,
): Promise<CallerDecision> {
  if (input.allowCron && isCronToken(input.cronHeader, input.cronToken)) {
    return { kind: "cron" }
  }
  const jwt = bearerToken(input.authorization)
  if (!jwt) return { kind: "denied", reason: "missing bearer token" }
  let userId: string | null
  try {
    userId = await input.getUserId(jwt)
  } catch {
    userId = null
  }
  if (!userId) return { kind: "denied", reason: "not a signed-in user" }
  return { kind: "user", userId, jwt }
}
