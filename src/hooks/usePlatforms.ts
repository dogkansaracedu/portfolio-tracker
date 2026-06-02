// Platforms are managed by `PlatformsProvider` (see contexts/PlatformsContext)
// so every consumer shares one fetch instead of each call site firing its own
// `platforms?select=*` request on mount. This file preserves the original
// `usePlatforms` import path.
export { usePlatformsContext as usePlatforms } from "@/contexts/PlatformsContext"
