import path from "path"
import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const pkg = JSON.parse(
  readFileSync(path.resolve(__dirname, "./package.json"), "utf8"),
) as { version: string }

/** Commit the bundle was built from. Vercel exposes it as an env var; its
 *  checkout is shallow and `git` isn't guaranteed there, so prefer the env
 *  var and only shell out for local builds. Empty when neither works — the
 *  UI renders that as "dev". */
function resolveCommitSha(): string {
  const fromCi = process.env.VERCEL_GIT_COMMIT_SHA
  if (fromCi) return fromCi
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim()
  } catch {
    return ""
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __BUILD_VERSION__: JSON.stringify(pkg.version),
    __BUILD_COMMIT__: JSON.stringify(resolveCommitSha()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
