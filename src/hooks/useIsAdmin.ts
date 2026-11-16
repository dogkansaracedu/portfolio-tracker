import { useAuth } from "@/hooks/useAuth"

/** True when the signed-in user is the catalog admin (can write assets). */
export function useIsAdmin(): boolean {
  return useAuth().isAdmin
}
