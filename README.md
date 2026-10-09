# Health Os

Health Os brings training, nutrition, recovery, health records, body progress, personal care, shared goals and insights into one colourful workspace.

## Download v0.1.0

Get the [Windows installer and Android APK](https://github.com/Manpreet86999/Health-Os/releases/tag/v0.1.0).

- **Windows:** `Health-OS-Setup-v0.1.0.exe`, Windows 10/11 x64. Choose the installation folder every time. The compiled web app and verified official Node.js runtime are included; users do not need npm, Java, Python or development tools. Open **Health Os** from the Start menu or desktop.
- **Android:** `Health-OS-v0.1.0.apk`, Android 12 or newer, package `app.healthos.mobile`, version code `2026100908`. Android asks for permission to install a downloaded APK.
- **Web files:** `Health-OS-Web-v0.1.0.zip` contains the compiled browser app. Serve these files from a web server; opening `index.html` directly does not support browser modules.

The welcome dialog says **“Health Os is here”** and offers an interactive tour of all 11 workspace groups. It appears on first use and after installing a new version. You can replay it in Settings → Data & account.

Sign in with your own account. Cloud sync and online services need connectivity. AI coaching, research, email, hardware permissions and optional personal workers need the relevant configured service; bundling a runtime does not configure these accounts.

## Updates

The app checks the official public GitHub Releases channel on startup, every 30 minutes and when returning after five minutes. A newer stable release with the expected installer/APK opens an update dialog. “Later” defers that version for 24 hours; Settings can check immediately.

In the installed Windows app, **Download & install** downloads the installer, verifies its SHA-256 against the release checksum file, opens the normal installer and closes the old local server. The installer asks for a folder again. A hosted browser app offers the installer download and the user opens it. Android offers the APK download; Android controls installation approval. Updates preserve the existing cloud account and browser storage. Use the same browser and `http://localhost:10000` to retain the local session and offline queue.

The original supplied APK and this distribution use different signing certificates. This APK can update the recent Health Os review builds signed with the distribution key; it cannot update an original-key installation. Preserve that installation and its records. Windows installers currently do not have a commercial Authenticode signature. Windows Application Control blocked the installer’s temporary setup engine on the build PC (error 4551), so installation is not verified under that policy. A trusted signing certificate or administrator-approved distribution is required on such PCs. `Health-OS-Windows-Portable-v0.1.0.zip` provides the same bundled app and runtime for manual extraction; its compatibility with a device’s policy must also be approved by that policy.

## Source and development

```powershell
npm ci --ignore-scripts
npm run dev
```

Node.js 24+ is required for development. For a production web server, run `npm run build` then `npm start`, and open `http://localhost:10000`. Supabase remains authoritative for cloud records. Optional legacy worker source is included; the retired Express database updater is disabled.

The Android production interface is recovered from the supplied APK. `apps/health-os-mobile/reference` preserves its interface and native archive. Editable integration fixes and the shared welcome/update module are packaged by `prepare.mjs`. This is not the recovered original Capacitor/Gradle source project. See [Android build notes](apps/health-os-mobile/README.md).

## Build and publish another version

Follow [release.md](release.md). Increase the stable version and Android version code, preserve the distribution signing key and publish matching release assets with `SHA256SUMS.txt`. The manually triggered **Build and publish Health Os** GitHub Actions workflow builds from main and requires distribution-key repository secrets. It refuses to overwrite an existing release.

## Verification

`npm run typecheck`, `npm test`, `node --test scripts/release-logic.test.mjs scripts/desktop-updater.test.mjs`, `npm run test:release` and the Android browser checks cover source contracts, update trust checks, first-use/version behaviour and key app journeys. Browser/native-bridge checks use synthetic records and mocked services. They do not certify every external service or hardware journey.
