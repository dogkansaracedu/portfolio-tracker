import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import type { Platform, PlatformInsert, PlatformUpdate } from "@/types/database";
import {
  fetchPlatforms,
  createPlatform,
  updatePlatform,
  deletePlatform,
} from "@/lib/queries/platforms";

export function usePlatforms() {
  const { user } = useAuth();
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPlatforms(user.id);
      setPlatforms(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch platforms");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const addPlatform = useCallback(
    async (data: Omit<PlatformInsert, "user_id">) => {
      if (!user) throw new Error("Not authenticated");
      const platform = await createPlatform({ ...data, user_id: user.id });
      setPlatforms((prev) => [...prev, platform]);
      return platform;
    },
    [user]
  );

  const editPlatform = useCallback(
    async (id: string, data: PlatformUpdate) => {
      const platform = await updatePlatform(id, data);
      setPlatforms((prev) => prev.map((p) => (p.id === id ? platform : p)));
      return platform;
    },
    []
  );

  const removePlatform = useCallback(async (id: string) => {
    await deletePlatform(id);
    setPlatforms((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return {
    platforms,
    loading,
    error,
    addPlatform,
    editPlatform,
    removePlatform,
    refetch,
  };
}
