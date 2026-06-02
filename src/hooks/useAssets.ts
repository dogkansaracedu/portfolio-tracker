// Assets are managed by `AssetsProvider` (see contexts/AssetsContext) so every
// consumer shares one fetch instead of each call site firing its own
// `assets?select=*` request on mount. This file preserves the original
// `useAssets` import path.
export { useAssetsContext as useAssets } from "@/contexts/AssetsContext"
