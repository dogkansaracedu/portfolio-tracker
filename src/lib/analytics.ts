import { POSTHOG_KEY, POSTHOG_HOST } from "@/lib/constants/analytics"

// Usage analytics (PostHog, EU cloud). Loaded as a lazy chunk after mount so
// the ~50KB+ SDK never delays first paint. Autocapture handles screen views
// (SPA history changes) and taps; no per-screen or per-button code needed.
export function initAnalytics() {
  void import("posthog-js").then(({ default: posthog }) => {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      // Opt into the current SDK behaviour set: pageviews on history
      // changes (SPA routing), pageleave events, sane autocapture.
      defaults: "2025-05-24",
    })
  })
}
