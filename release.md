# Release Health OS

Current final release: **v1.4.0**, Android build **2026101605**.

The released APK is built by scripts/prepare-original-android.mjs and scripts/package-original-android.ps1. The latter preserves the existing distribution certificate, verifies the binary manifest version, checks native/config entries and original stylesheets, then checks alignment and signatures. It requires the reviewed baseline and local build tools; never generate a new signing identity for an update.

The web app is built with npm run build. scripts/package-final-web.ps1 packages dist/client with the static local server, README.txt and start-web.bat. scripts/prepare-final-release.mjs creates the two public assets, checksums and validation metadata after both platform builds pass.

Before publishing: run typecheck, the release/update logic tests and focused web/Android report browser checks. Review staged public source and artifact contents for secrets and personal records. Publish a draft containing Health-OS-vVERSION.apk, Health-OS-Web-vVERSION.zip, SHA256SUMS.txt and VALIDATION.md, then verify every uploaded checksum. Publish as a stable latest release. Verify anonymous downloads before removing a superseded release. Preserve old release artifacts locally for recovery.

The Windows installer workflow is retained for historical Windows release work; it is not the Android/web final-release packaging path.
