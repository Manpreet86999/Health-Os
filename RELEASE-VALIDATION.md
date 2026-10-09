# Health Os v0.1.0 validation

- Client and server TypeScript checks passed.
- All 277 existing unit tests passed.
- All 4 release-version, trusted-asset, local-origin/token and corrupt-installer checks passed.
- All 8 production welcome/update browser checks passed; desktop and phone screenshots were visually reviewed.
- All 21 recovered Android interface checks passed.
- All 5 selected existing web workout/Pods checks passed.
- Final APK signature, alignment, version metadata and packaged-source checks passed. Native DEX/resources and 555 original entries are byte-identical.
- Windows installer compiled with an explicit welcome page and folder chooser. Official Node.js runtime checksum was verified. The bundled runtime/app passed HTTP startup, version/channel, welcome assets and installed-updater capability checks independently.

Windows installer execution was blocked on the build PC by Application Control (error 4551) before installation. No trusted Authenticode certificate is available. Installation under that policy is not verified; code signing or administrator-approved distribution is required. No policy was changed. The isolated test created no successful app installation.

The final APK has not been installed on the personal phone as part of this publication task. Its distribution certificate matches the prior local review builds and differs from the supplied original APK; original-key installs cannot be updated in place. Browser checks use synthetic records and mocked cloud/native transports. External service and hardware coverage remains separate.

Public source publication excludes local history, user records, backups, caches, outputs, environment files and private signing material.

## Corrected v0.1.0 Windows package

The initial Windows installer and portable ZIP were withdrawn and rebuilt to include start.bat, requirement.txt and requirements.txt. The installer compiler log confirms all three files are compressed into the rebuilt executable. The normal setup still displays its installation-directory page.

The rebuilt portable archive was extracted to a folder containing spaces. Its actual start.bat was invoked twice with a restricted PATH where system Node.js and Python could not be found. Both invocations exited successfully using the bundled official Node.js v24.21.0 runtime. No node_modules directory, Python libraries or developer tools were present in that package. The installed-app health endpoint reported version 0.1.0 and enabled the trusted update flow.

A fresh Edge browser profile displayed the actual Health Os is here welcome dialog on first launch, with all 11 tabs; tab interaction and dismissal persistence passed. All 8 existing production welcome/update browser checks passed against the rebuilt web app. All 112 released browser files remained byte-identical.

The Windows installer remains unsigned. Full installation under this PC's Application Control policy remains unverified; the previously observed error 4551 still limits installer execution testing. The extracted package and launcher were tested directly. No device policy or certificate configuration was changed.

This same-version Windows asset replacement does not notify an already-installed v0.1.0 app as a newer version. Existing users can download the corrected installer manually. Android is unchanged. Use the newly published SHA256SUMS.txt.