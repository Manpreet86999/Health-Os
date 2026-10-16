# Health OS v1.4.0 — Final Android & Web Release

## Downloads
- Health-OS-v1.4.0.apk — signed Android app, Android 12+, build 2026101605.
- Health-OS-Web-v1.4.0.zip — production web app with a local Node.js server and hosting instructions.
- SHA256SUMS.txt — SHA-256 checksums for both downloads.

## Included
- The approved daily report design, with body measurements at the bottom.
- Required calorie, protein, carbohydrate, fat, fiber and water goals when importing a new training week.
- Automatic daily report generation and email at 23:00 IST, with retry support.
- Manual daily report requests from Reports, eligible only at/after 23:00 IST on that report's date.
- IST calendar days from 00:00 through 23:59; the report clearly states its 23:00 data cutoff.
- Next-day full-report dialog with acknowledgment enabled after scrolling to the bottom.
- Current training, nutrition totals, recovery, body, insights, account sync and retained Android interface fixes.

## Installation
Android package: app.healthos.review. The APK uses the same signing certificate as the current 1.4 builds. The former public v0.1.0 APK used app.healthos.mobile, so v1.4.0 installs alongside that older package; sign in with the same cloud account to access synced records. Verify your records before removing an older installation.

For web use, extract the ZIP and follow README.txt inside. It requires Node.js 24+ for the included local server, or an HTTPS static host for dist/client. Opening index.html directly is unsupported.

Daily email requires a verified account email, enabled daily reports, and the deployed AI/email services. Reports use saved records through 23:00 IST; unlogged values are not assumed. No extra report email was sent merely to validate this release.

This final release supersedes v0.1.0 and contains Android and web packages.
