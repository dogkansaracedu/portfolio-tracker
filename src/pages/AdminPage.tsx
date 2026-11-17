import { Navigate } from "react-router"
import { PageHeading } from "@/components/common/PageHeading"
import { Skeleton } from "@/components/ui/skeleton"
import { AssetList } from "@/components/assets/AssetList"
import { useAuth } from "@/hooks/useAuth"
import { ADMIN_COPY, ADMIN_FALLBACK_ROUTE } from "@/lib/constants/admin"

/**
 * Admin page — the asset catalog and each asset's price sources (Fiyat
 * kaynakları). Only the admin gets in; anyone else is sent home once the
 * admin check has answered. The database enforces the same rule on writes.
 */
export default function AdminPage() {
  const { isAdmin, adminLoading } = useAuth()

  if (adminLoading) return <Skeleton className="h-40 w-full" />
  if (!isAdmin) return <Navigate to={ADMIN_FALLBACK_ROUTE} replace />

  return (
    <div className="space-y-6">
      <PageHeading title={ADMIN_COPY.pageTitle} subtitle={ADMIN_COPY.pageSubtitle} />
      <AssetList />
    </div>
  )
}
