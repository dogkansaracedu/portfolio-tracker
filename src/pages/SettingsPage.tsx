import { Link } from "react-router";
import { PageHeading } from "@/components/common/PageHeading";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PlatformList } from "@/components/platforms/PlatformList";
import { SnapshotBackfillCard } from "@/components/settings/SnapshotBackfillCard";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { BULK_ADD_ROUTE, SETTINGS_COPY } from "@/lib/constants/app";
import { ADMIN_COPY, ADMIN_ROUTE } from "@/lib/constants/admin";

const POINTER_LINK_CLASS = "underline-offset-4 hover:text-foreground hover:underline";

export default function SettingsPage() {
  const isAdmin = useIsAdmin();

  return (
    <div className="space-y-6">
      <PageHeading
        title="Settings"
        subtitle="Manage your platforms and snapshots."
      />

      <Tabs defaultValue="platforms">
        <TabsList>
          <TabsTrigger value="platforms">Platforms</TabsTrigger>
          <TabsTrigger value="snapshots">Snapshots</TabsTrigger>
        </TabsList>

        <TabsContent value="platforms">
          <PlatformList />
        </TabsContent>

        <TabsContent value="snapshots">
          <SnapshotBackfillCard />
        </TabsContent>
      </Tabs>

      {/* Import is Component 4's; Settings only points at it. */}
      <div className="space-y-1">
        <h2 className="text-sm font-medium">{SETTINGS_COPY.importHeading}</h2>
        <p className="text-sm text-muted-foreground">
          <Link to={BULK_ADD_ROUTE} className={POINTER_LINK_CLASS}>
            {SETTINGS_COPY.importLink}
          </Link>
        </p>
      </div>

      {/* The catalog lives on the Admin page; only the admin sees the way in. */}
      {isAdmin && (
        <div className="space-y-1">
          <h2 className="text-sm font-medium">{ADMIN_COPY.settingsHeading}</h2>
          <p className="text-sm text-muted-foreground">
            <Link to={ADMIN_ROUTE} className={POINTER_LINK_CLASS}>
              {ADMIN_COPY.settingsLink}
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
