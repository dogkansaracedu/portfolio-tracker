# android-widget — "Portföy Widget" home-screen widgets

Native Android app with two home-screen widgets for the portfolio tracker. Sideloaded on the
owner's phone; not on Play.

- **Toplam** (2x2, resizable): net worth in TRY, today's change amount and %.
- **Varlıklar** (4x2, resizable): scrollable asset list (ticker, price, today's %), stale prices
  dimmed, footer with data time + refresh button.
- Tapping a widget opens the PWA (`PWA_URL`).
- **No launcher icon** (the PWA already has one). The only screen (`MainActivity`: login form,
  then last fetch status + "Şimdi yenile" + "Çıkış yap") is reached by:
  1. Long-press a widget → pencil / "widget settings" (it is both widgets' configuration
     activity, `widgetFeatures="reconfigurable|configuration_optional"`). On API 31+ adding a
     widget skips this screen; on 29/30 it opens on add.
  2. Tapping a widget in the "Giriş gerekli" / "Kurulum gerekli" state.
  Opened as configuration it returns `RESULT_OK` + the widget id immediately, so backing out
  still keeps the widget (it shows "Giriş gerekli" until sign-in).
- App label "Portföy Widget" (Settings > Apps, widget picker); widget labels "Toplam" / "Varlıklar".

## Stack

Kotlin, Jetpack Glance 1.1 (widgets), WorkManager (15-min refresh, network constraint),
kotlinx.serialization, HttpURLConnection. No other deps. minSdk 29, target/compile 36.
Gradle wrapper 8.14.3, AGP 8.12, Kotlin 2.2.20. Package `dev.portfolio.widget`.

## Config (`local.properties`, gitignored → BuildConfig)

See `local.properties.example`. Keys: `sdk.dir`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` (public,
production values from the web app's `.env.production.local`), optional `PWA_URL` (defaults to
`https://portfolio-tracker-theta-seven.vercel.app`). Missing values → "Kurulum gerekli" state.

## Auth + data flow

- Login calls GoTrue `POST {SUPABASE_URL}/auth/v1/token?grant_type=password` (apikey header).
  Only the session (access + refresh token + expiry) is stored, AES-GCM encrypted with an
  Android Keystore key (`data/Auth.kt`). The password is never stored.
- Before each fetch the access token is refreshed if it expires within 60 s; the rotated
  refresh token is persisted. A 400/401 on refresh clears the session → widgets show
  "Giriş gerekli" (tap opens the login screen).
- Data: `GET {SUPABASE_URL}/functions/v1/widget-data` with `Authorization: Bearer` + `apikey`.
- Both widgets share one cached payload (`filesDir/widget_cache.json` + in-memory StateFlow in
  `data/WidgetStore.kt`). On error the last data stays and a "güncellenemedi" hint shows.
- Refresh triggers: periodic WorkManager job (scheduled while any widget exists), one-shot on
  widget add (throttled to 2 min), refresh button, "Şimdi yenile".

## Build / install

```bash
./gradlew assembleDebug testDebugUnitTest   # APK: app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Updates install over the previous APK as long as it is signed with the same debug keystore
(`~/.android/debug.keystore` on this Mac); a build from another machine needs an uninstall first.

## Debug-only hooks (emulator checks without real credentials)

Explicit component start (works without a launcher entry; the activity is exported):

```bash
adb shell am start -n dev.portfolio.widget/.MainActivity --ez fixture true   # fake portfolio
adb shell am start -n dev.portfolio.widget/.MainActivity --es pin total       # ask launcher to add widget (or: assets)
```

Screenshots go in `screenshots/` (gitignored: they can show real amounts).
