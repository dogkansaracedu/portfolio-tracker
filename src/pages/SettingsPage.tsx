import { Link } from "react-router";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PlatformList } from "@/components/platforms/PlatformList";
import { AssetList } from "@/components/assets/AssetList";
import { SnapshotBackfillCard } from "@/components/settings/SnapshotBackfillCard";
import { BULK_ADD_ROUTE, SETTINGS_COPY } from "@/lib/constants/app";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage your platforms, assets, and snapshots.
        </p>
      </div>

      <Tabs defaultValue="assets">
        <TabsList>
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="platforms">Platforms</TabsTrigger>
          <TabsTrigger value="snapshots">Snapshots</TabsTrigger>
        </TabsList>

        <TabsContent value="assets">
          <AssetList />
        </TabsContent>

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
          <Link
            to={BULK_ADD_ROUTE}
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            {SETTINGS_COPY.importLink}
          </Link>
        </p>
      </div>
    </div>
  );
}
