# Release Health Os

Public repository: `Manpreet86999/Health-Os`. Stable versions use `vMAJOR.MINOR.PATCH`. Keep the Android distribution certificate unchanged.

## Prepare a newer version

```powershell
node scripts/set-release-version.mjs 0.1.1 2026100909
```

This updates package/lock metadata, the web version, welcome/update configuration and Android build command. Both the release version and Android version code must increase. Edit `RELEASE-NOTES.md`, commit the changes and push main.

## Publish using GitHub Actions

Run **Build and publish Health Os** from the repository’s Actions page. Repository Actions secrets `ANDROID_KEYSTORE_BASE64` and `ANDROID_KEYSTORE_PASSWORD` must contain the distribution key and its password. Never commit the private key. The workflow checks types and unit tests, builds the Windows installer and signed APK, verifies the APK payload, packages the web files and publishes a new stable release with checksums. An existing release is not overwritten. Run browser acceptance checks before invoking publication.

## Publish from this PC

```powershell
npm run typecheck
npm test
npm run build:installer
node --test scripts/release-logic.test.mjs scripts/desktop-updater.test.mjs
npm run test:release
./apps/health-os-mobile/scripts/build-review.ps1 -VersionCode 2026100909 -VersionName 0.1.1
./apps/health-os-mobile/scripts/verify-review.ps1 -VersionCode 2026100909 -VersionName 0.1.1
node node_modules/@playwright/test/cli.js test -c playwright.apk-refinement.config.ts
```

For a different PC, set `JAVA_HOME` to JDK 17 and `ANDROID_HOME` to a SDK containing build-tools 35.0.0. Supply the preserved key with `-Keystore`, `-Alias` and `-StorePassword`; do not let a different machine generate a replacement key.

Upload these exact names for version 0.1.1:

- `Health-OS-Setup-v0.1.1.exe`
- `Health-OS-v0.1.1.apk` (copy/rename the verified build result)
- `Health-OS-Web-v0.1.1.zip`
- `SHA256SUMS.txt` with lowercase SHA-256 followed by two spaces and each asset name

Publish a stable release tagged `v0.1.1`. Drafts, prereleases, older versions and assets outside this repository do not trigger installation. The app never embeds a GitHub access token. Installed Windows updates require a matching local origin/token and verify downloaded bytes before execution. The standard installer uses no silent-update switches and always displays the folder chooser.

Preview the real dialogs locally at `http://localhost:10000/?health-os-preview=welcome` and `http://localhost:10000/?health-os-preview=update`. Preview mode never installs an update.
