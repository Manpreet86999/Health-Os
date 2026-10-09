# Health OS 5.2 APK refinement

The supplied `Health-OS-5.2.0-2026100802.apk` is the visual and functional baseline. Its SHA256 is `8856365bbdbd2bbd295f0cfe136fc51bfe2265e68764bfee9842dd95b7e91fb3`.

This is an APK-derived project, not the recovered original TypeScript/Gradle source. The APK contains a Capacitor wrapper, bundled React interface, compiled native plugins and 101 registered views. It identifies the original Android project as `apps/health-os-mobile/android`; that source and its signing key were not supplied. The unrelated native alpha is not used to render this version.

`reference/` preserves the unchanged APK, extracted public assets, Capacitor configuration and recovered view registry. `runtime/health-os-native.js` contains the editable integration fixes. `scripts/prepare.mjs` verifies the APK identity, copies its interface and applies narrowly checked changes to its Android initialization, reminder delivery and notification consent. All original CSS and screen modules except the requested workout change are retained. Sync also loads recent biological records before full history, recovers realtime connections, and allows readiness touch scrolling. Workout now alternates confirmed-set and rest cards using the shared src/client/components/WorkoutRestCard.ts component.

The fixes connect reminder permission and delivery to the existing Android LocalNotifications plugin; rejected delivery does not create a successful reminder event. Permission checks remain explicit, and denial/revocation prevent delivery. Reminders are evaluated while the app is running; this is not a new background scheduling engine. Generic notification text keeps health details inside the app. Optional failed or hanging plugin listeners no longer block sharing, external links or app rendering. Back dismisses overlays/keyboard before navigation. Native system-bar appearance follows the existing theme. Existing rest scheduling, data stores and cloud contracts are retained.

Build locally:

```powershell
node apps/health-os-mobile/scripts/prepare.mjs
./apps/health-os-mobile/scripts/build-review.ps1 -VersionCode 2026100907 -VersionName 0.1.0
./apps/health-os-mobile/scripts/verify-review.ps1 -VersionCode 2026100907 -VersionName 0.1.0
node node_modules/@playwright/test/cli.js test -c playwright.apk-refinement.config.ts
```

The build uses the workspace's Android SDK/JDK and creates a local review certificate under ignored `.build-tools/apk-refinement/`. It rebuilds the archive with the original DEX/resources, patches package version metadata to 0.1.0 / 2026100907, aligns and signs it, and verifies the result. It does not replace the reference APK. The original package ID and Android 12 minimum remain unchanged.

**The review certificate differs from the original certificate. This APK cannot update the original installation in place. Keep the original installation and its data.** A compatible update requires the original signing key; a future separate package would need its own migration and platform validation. Earlier review builds were installed on the authorized phone and use the same review certificate. Version 2026100904 was subsequently installed successfully over 2026100902 on the authorized RMX3381 phone, preserving login and the workout draft. Startup and the compact workout screen were verified; live convergence and full phone interaction checks remain pending. No account deletion, backend deployment or publication occurred.

Browser acceptance uses the actual extracted production bundle with synthetic cloud records and mocked native plugin calls. It checks the 101 registered destinations, workout draft/save retry, sign-in/retry, water persistence, notification consent, native integration failure paths, and pixel comparison of Today/nutrition/care against the original in both theme settings. These checks do not certify all feature journeys, live service deployment, paid AI, mail delivery, camera/microphone hardware, Health Connect or physical-device behavior. Those require separate acceptance and, where applicable, configured external services.

Official API references used for the integration: [Local Notifications](https://capacitorjs.com/docs/apis/local-notifications), [App](https://capacitorjs.com/docs/apis/app), [Status Bar](https://capacitorjs.com/docs/apis/status-bar).



Mobile gestures and concise visual presentation are shared through src/client/lib/mobile-interactions.ts, transpiled into the prepared native integration module by prepare.mjs. Biological sync yields between four-page batches and avoids unchanged full-cache refreshes. Latest installed candidate: v0.1.0 / 2026100907. Public v0.1.0 / 2026100908 adds the shared welcome tour and new repository updates; the rebuilt package is signature/alignment/source verified, with browser acceptance, but has not replaced the personal phone installation during this release task. Today Pods and completed-workout draft reconciliation are shared with the web source. See outputs/release-v0.1.0/README.md for the current artifact, validation and installation constraints.


