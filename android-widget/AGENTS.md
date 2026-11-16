# android-widget — "Portföy" home-screen widgets

Native Android app with two home-screen widgets for the portfolio tracker. Sideloaded on the
owner's phone; not on Play.

- **Toplam** (2x2, resizable): net worth in TRY, today's change amount and %.
- **Varlıklar** (4x2, resizable): scrollable asset list (ticker, price, today's %), stale prices
  dimmed, footer with data time + refresh button.
- Tapping a widget opens the PWA (`PWA_URL`). The launcher screen is a login form, then
  last fetch status + "Şimdi yenile" + "Çıkış yap".

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

## Debug-only hooks (emulator checks without real credentials)

```bash
adb shell am start -n dev.portfolio.widget/.MainActivity --ez fixture true   # fake portfolio
adb shell am start -n dev.portfolio.widget/.MainActivity --es pin total       # ask launcher to add widget (or: assets)
```

Screenshots go in `screenshots/` (gitignored: they can show real amounts).
