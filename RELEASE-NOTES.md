# Health Os v0.1.0

Health Os is here — a connected workspace for training, nutrition, recovery, health records, body progress, personal care, insights, Pods and automations.

## Downloads

- **Windows 10/11 x64:** `Health-OS-Setup-v0.1.0.exe`. Includes the compiled web app and official verified Node.js runtime. No developer-tool installation is required. The normal installer always asks for an installation folder, including updates.
- **Android 12+:** `Health-OS-v0.1.0.apk` (`app.healthos.mobile`, version code `2026100908`). Open the downloaded APK and approve installation in Android.
- **Browser build:** `Health-OS-Web-v0.1.0.zip`, ready to serve on a web server.
- **Windows portable files:** `Health-OS-Windows-Portable-v0.1.0.zip`. Extract to your chosen folder and open `Health Os.vbs`; the browser app and runtime are included.
- **Integrity:** compare downloads with `SHA256SUMS.txt`.

## New release experience

- A colourful “Health Os is here” welcome dialog with interactive cards for all 11 workspace groups.
- The tour appears on first use and after each installed version; replay it in Settings → Data & account.
- Future stable releases on this repository open an update dialog. Windows installations download and verify the installer before opening it; hosted browsers and Android provide the appropriate download.
- Normal Windows updates keep the location chooser visible. Cloud records and the browser’s session/offline queue remain in place.

## Installation notes

Use your own Health Os cloud account. Internet is required for sign-in and cloud services. Optional AI, email, research, workers and hardware integrations depend on their configuration and permissions.

This Android release uses the existing local distribution/review certificate. It can update the recent review builds with that certificate. It cannot update the supplied original APK because its signing certificate differs; preserve that installation and its records. The Windows installer is not commercially Authenticode signed. On the build PC, Windows Application Control blocked the temporary setup engine (error 4551), so installation could not be completed under that policy. Such PCs need trusted code signing or administrator approval. A Windows portable ZIP with the same bundled app/runtime is also included; local policy remains authoritative.

Automated browser checks use synthetic records and mocked native/cloud services; full hardware and external-service coverage is separate from this initial release.
