import { describe, expect, it } from "vitest"
import {
  bearerToken,
  isCronToken,
  resolveCaller,
  type ResolveCallerInput,
} from "../../../supabase/functions/_shared/caller.ts"

// The edge-function auth guard (supabase/functions/_shared/caller.ts). Lives in
// src/ because Vitest only includes src/**/*.test.ts (same as yahoo.test.ts).

const USER_JWT = "user.jwt.token"
const ANON_JWT = "anon.jwt.token"

/** Auth server stand-in: only USER_JWT belongs to a user. */
async function fakeGetUserId(jwt: string): Promise<string | null> {
  return jwt === USER_JWT ? "user-1" : null
}

function input(over: Partial<ResolveCallerInput>): ResolveCallerInput {
  return {
    authorization: null,
    cronHeader: null,
    cronToken: "cron-secret",
    allowCron: false,
    getUserId: fakeGetUserId,
    ...over,
  }
}

describe("bearerToken", () => {
  it("reads the token from a Bearer header", () => {
    expect(bearerToken("Bearer abc.def")).toBe("abc.def")
    expect(bearerToken("bearer abc")).toBe("abc")
  })
  it("rejects missing or malformed headers", () => {
    expect(bearerToken(null)).toBeNull()
    expect(bearerToken("")).toBeNull()
    expect(bearerToken("Basic abc")).toBeNull()
    expect(bearerToken("Bearer ")).toBeNull()
    expect(bearerToken("Bearer a b")).toBeNull()
  })
})

describe("isCronToken", () => {
  it("needs a configured secret and an exact match", () => {
    expect(isCronToken("s", "s")).toBe(true)
    expect(isCronToken("x", "s")).toBe(false)
    expect(isCronToken(null, "s")).toBe(false)
    expect(isCronToken("", "")).toBe(false)
    expect(isCronToken("s", undefined)).toBe(false)
  })
})

describe("resolveCaller", () => {
  it("accepts a signed-in user and returns its id and token", async () => {
    const d = await resolveCaller(input({ authorization: `Bearer ${USER_JWT}` }))
    expect(d).toEqual({ kind: "user", userId: "user-1", jwt: USER_JWT })
  })

  it("denies the anon key (a valid JWT with no user)", async () => {
    const d = await resolveCaller(input({ authorization: `Bearer ${ANON_JWT}` }))
    expect(d.kind).toBe("denied")
  })

  it("denies a request with no Authorization header", async () => {
    const d = await resolveCaller(input({}))
    expect(d.kind).toBe("denied")
  })

  it("denies when the Auth server lookup throws", async () => {
    const d = await resolveCaller(
      input({
        authorization: `Bearer ${USER_JWT}`,
        getUserId: () => Promise.reject(new Error("network")),
      }),
    )
    expect(d.kind).toBe("denied")
  })

  it("accepts the cron token only where cron is allowed", async () => {
    const cron = { cronHeader: "cron-secret", authorization: `Bearer ${ANON_JWT}` }
    expect((await resolveCaller(input({ ...cron, allowCron: true }))).kind).toBe("cron")
    expect((await resolveCaller(input({ ...cron, allowCron: false }))).kind).toBe("denied")
  })

  it("denies a wrong cron token and falls back to the user check", async () => {
    const d = await resolveCaller(
      input({ allowCron: true, cronHeader: "guess", authorization: `Bearer ${USER_JWT}` }),
    )
    expect(d.kind).toBe("user")
    const anon = await resolveCaller(
      input({ allowCron: true, cronHeader: "guess", authorization: `Bearer ${ANON_JWT}` }),
    )
    expect(anon.kind).toBe("denied")
  })

  it("never treats an unset CRON_TOKEN as a match", async () => {
    const d = await resolveCaller(
      input({ allowCron: true, cronToken: undefined, cronHeader: "" }),
    )
    expect(d.kind).toBe("denied")
  })
})
