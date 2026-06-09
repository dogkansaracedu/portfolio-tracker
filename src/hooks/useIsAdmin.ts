import { useAuth } from "@/hooks/useAuth"
import { ADMIN_USER_ID } from "@/lib/constants/admin"

/** True when the signed-in user is the catalog admin (can write assets). */
export function useIsAdmin(): boolean {
  const { user } = useAuth()
  return user?.id === ADMIN_USER_ID
}
