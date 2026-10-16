# Health OS v1.4.0 release validation

- Android: versionName 1.4.0; versionCode 2026101605; package app.healthos.review; Android 12 or newer.
- Signing certificate matches the preserved current Android baseline; APK signature, alignment and stored resources verified.
- 445 native/config entries and six original stylesheets preserved; 125 public assets verified against the prepared interface.
- Web production build and server/client TypeScript passed. Android retained-interface TypeScript passed.
- Four web/Android goal-enforcement and full-report dialog browser checks passed with synthetic account records.
- Five release/update trust checks passed, including trusted web ZIP fallback.
- Daily report cutoff, retry, snapshot and owner-boundary checks passed. The report backend was deployed and verified separately.
- Source and public-file checks found no private keys, provider credentials or privileged JWTs. Health account/runtime databases and signing material are excluded.
- SHA256SUMS.txt verifies the two downloadable app packages.

The final APK is signed and packaged, but build 2026101605 has not been physically installed for this release. Browser tests cover the actual prepared Android frontend; native hardware paths are preserved, not recertified by these tests. The old public v0.1.0 APK used another package identity, as explained in the release notes.
