/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Build-time constants injected by `define` in vite.config.ts. Read them
 *  through `@/lib/constants/build-info`, not directly. */
declare const __BUILD_VERSION__: string
declare const __BUILD_COMMIT__: string
declare const __BUILD_TIME__: string
