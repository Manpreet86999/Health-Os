# Daily reports and required week goals

Implemented the approved V3 section order, with **Your body, in perspective** immediately before the footer. Removed the hero, all-day-context box, micronutrient cards, health/habit cards, delivery-explanation card and repeated indicators. Existing readiness, set and exercise-coaching renderers are reused. New PNG indicators become MIME inline attachments for email.

Every newly imported/created training week requires calories, protein, carbs, fat, fiber and water targets. The shared web/Android goal dialog blocks use until all six are saved. The database trigger also rejects week activation, workout drafts and sessions without valid goals. Existing weeks are preserved. Targets can be edited from Recover → Nutrition Totals.

IST calendar days run from 00:00 through 23:59. Reports are eligible from 23:00 on their own IST date, including historical manual requests. The report states its 23:00 data cutoff: entries afterward remain in records but are not silently inserted into the saved report. The scheduler creates one job per account/date, including rest days. Failed deliveries remain retryable; sent daily reports are not resent by repeated requests. The first generated snapshot is persisted and reused for delivery retries and in-app display.

On a subsequent IST day, an unread sent report opens in a blocking dialog on web and the retained Android interface. The whole saved report appears in a sandboxed iframe. “I’ve read it” enables at the bottom, then persists an account-owned acknowledgment. Required dialogs cannot be dismissed with Escape or backdrop clicks; focus is kept inside them.

## Validation

- Web and retained Android end-to-end tests: 4/4 passed for required goals, persisted goals, next-day full report, scrolling, Escape behavior and persisted acknowledgment.
- Existing Android navigation/nutrition persistence checks: 2/2 passed.
- Report settings browser regression: passed.
- Report preview: 900, 390 and 320 px; no horizontal overflow, broken images or duplicated steps/protein/water indicators.
- SQL migration: 11 local PGlite checks passed, including ownership isolation, server-side enforcement, early sending rejection and idempotency.
- Server/client TypeScript, retained Android TypeScript and production web build passed.
- Broad regression initially passed 540/544. Three sandbox-blocked localhost checks passed with network access; the remaining large-history performance failure was fixed by eliminating repeated Intl formatter construction, and all tests in that file passed on rerun.
- Focused email, queue and IST boundary tests passed. All browser/AI fixtures are synthetic; no live health records or report emails were created for testing.

## Build artifacts

- Web: `dist/client`, installed into `G:\Health Os\dist\client` and verified through localhost:10000.
- Signed Android APK: `outputs/android-original-ui/Health-OS-v1.4-daily-report.apk`, build 2026101604; existing native/config entries and six original stylesheets verified; not installed on a phone or published.
- Bundled server functions: `output/daily-report-deploy/supabase`.
- Preview and evidence: `output/daily-report-validation`.
- Migration: `supabase/migrations/20261016133612_daily_ist_reports_and_week_goals.sql`.

## Deployment state

Deployed on 16 October 2026 following the user's explicit instruction to deploy everything.

- Applied the reviewed daily_ist_reports_and_week_goals migration to the existing Supabase project. Existing health records and legacy job rows were preserved.
- Deployed body-os-email and body-os-email-scheduler from output/daily-report-deploy/supabase. Existing account and scheduler authentication remain required; unauthenticated POSTs returned 401/AUTH_REQUIRED.
- Verified the new table, owner SELECT policy, RLS, private RPC access, removal of the per-workout queue trigger, and the new mandatory-week-goals trigger.
- Live transaction checks verified future/early report rejection, imported-week goal requirements, rejection of training without goals, and successful training after valid goals. All synthetic writes were rolled back.
- Verified the existing active every-minute cron reads the scheduler URL from Vault, that the URL points to body-os-email-scheduler, and that the five recent cron invocations succeeded.
- Supabase security advisors reported no findings involving the new report or week-goal objects. Existing unrelated advisor findings remain unchanged.
- Installed the production web build, keeping account configuration and old hashed assets. Served index matches the build; seven entry assets returned successfully.
- Installed-entry rollback files: output/daily-report-deploy/installed-before-20261016-203459.
- Rebuilt and signed Android build 2026101604 with the existing matching certificate. The package retains 445 native/config entries, six original stylesheets and 125 verified public assets. This APK was not installed on a phone or published to a public release.
- No extra production report email was sent for testing. Actual scheduled mail arrival remains to be observed at/after 23:00 IST.
