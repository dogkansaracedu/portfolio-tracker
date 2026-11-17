import {
  createContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { User, Session, AuthError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** True when the signed-in user is the catalog admin. Asked of the database
   *  once per signed-in user; false while unknown or signed out. */
  isAdmin: boolean;
  /** True while the admin check for the signed-in user is still in flight —
   *  an admin-only route waits on it instead of bouncing the admin. */
  adminLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // Id of the user the database confirmed as admin; compared against the
  // current user so a stale answer never leaks across sign-out / switch.
  const [adminUserId, setAdminUserId] = useState<string | null>(null);
  // Id of the user whose admin check has answered (yes or no).
  const [adminCheckedUserId, setAdminCheckedUserId] = useState<string | null>(null);

  useEffect(() => {
    // Apply a session update only when identity actually changed, so a
    // reference-churning re-set never invalidates the app's `[user]` effects.
    // Two things deliver the session on mount — `getSession()` and
    // `onAuthStateChange`'s INITIAL_SESSION — and they race. Whichever lands
    // second carries the *same* user id but a fresh object reference; setting
    // it unconditionally flips `user` to a new reference a second time, firing
    // every `[user]` effect twice (e.g. two identical `fetchTransactionsForAll
    // Assets` calls, doubled snapshot/holdings loads). TOKEN_REFRESHED on tab
    // focus is the same hazard. Guarding both paths by id / access_token keeps
    // the reference stable across all of these.
    const applySession = (session: Session | null) => {
      setSession((prev) =>
        prev?.access_token === session?.access_token ? prev : session,
      );
      setUser((prev) => {
        const next = session?.user ?? null;
        return prev?.id === next?.id ? prev : next;
      });
      setLoading(false);
    };

    // Restore existing session on mount.
    supabase.auth.getSession().then(({ data: { session } }) => {
      applySession(session);
    });

    // Listen for auth state changes (login, logout, token refresh).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Admin status comes from the database (`is_admin()`), once per user id.
  // `user` keeps its reference across token refreshes (see applySession), so
  // this runs on sign-in / sign-out / account switch only.
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase.rpc("is_admin").then(({ data, error }) => {
      if (cancelled) return;
      if (error) console.error("Failed to check admin status:", error);
      setAdminUserId(data === true ? userId : null);
      setAdminCheckedUserId(userId);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);
  const isAdmin = userId != null && adminUserId === userId;
  const adminLoading = userId != null && adminCheckedUserId !== userId;

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });

    // Seed default platforms and assets for the new user
    if (!error && data.user) {
      try {
        await supabase.rpc("seed_user_data", { p_user_id: data.user.id });
      } catch (seedErr) {
        console.error("Failed to seed user data:", seedErr);
      }
    }

    return { error };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, loading, isAdmin, adminLoading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
