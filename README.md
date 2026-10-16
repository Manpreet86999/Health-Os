# Health OS

## Final Android and web release — v1.4.0

Download the signed Android APK and web package from [the latest release](https://github.com/Manpreet86999/Health-Os/releases/latest).

- Android: **Health-OS-v1.4.0.apk**, Android 12+, build **2026101605**.
- Web: **Health-OS-Web-v1.4.0.zip**. Extract it, read its README and run the included local server with Node.js 24+, or host its dist/client directory on HTTPS.
- SHA256SUMS.txt contains the SHA-256 checksums of both packages.

This release includes training and recovery tracking, full-day nutrition targets, body measurements, and daily AI reports. New training weeks require all six daily nutrition goals. Reports are generated at 23:00 IST; manual requests are blocked before that day's cutoff. The next-day report dialog requires scrolling before acknowledgment.

The existing Supabase report services are deployed. Use your own Health OS account; automatic report delivery requires a verified account email, enabled daily reports and the configured server services. Missing data stays labeled.

### Android installation

The APK retains the current app's signing certificate and package **app.healthos.review**. It updates current 1.4 builds of that package. The removed public v0.1.0 release used **app.healthos.mobile**, so this APK installs alongside that older app. Sign in to the same cloud account and verify your records before removing any older installation.

### Development

Use Node.js 24 or newer:

```powershell
npm ci --ignore-scripts
npm run dev
npm run typecheck
npm run build
```

The web client source is in src/client; server-side Supabase functions and migrations are in supabase. Read DAILY-REPORT-IMPLEMENTATION.md for report behavior and deployment verification. Release packaging instructions are in release.md. Optional local workers remain separate from the cloud web app.

Android preparation preserves the supplied native implementation and existing styles, while bundling the retained interface fixes. Rebuilding it requires the hash-verified baseline specified in scripts/extract-original-android.ps1, Android build tools, and the existing distribution signing key; private keys are never included in this repository or release.
