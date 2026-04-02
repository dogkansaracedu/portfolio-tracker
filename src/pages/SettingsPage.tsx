import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PlatformList } from "@/components/platforms/PlatformList";
import { AssetList } from "@/components/assets/AssetList";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage your platforms and assets.
        </p>
      </div>

      <Tabs defaultValue="platforms">
        <TabsList>
          <TabsTrigger value="platforms">Platforms</TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
        </TabsList>

        <TabsContent value="platforms">
          <PlatformList />
        </TabsContent>

        <TabsContent value="assets">
          <AssetList />
        </TabsContent>
      </Tabs>
    </div>
  );
}
