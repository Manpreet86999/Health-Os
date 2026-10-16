# Native Health Connect bridge

Read-only Capacitor plugin compiled separately and added to the supplied Android shell. The app package remains `app.healthos.review`; its installed data is preserved. The original native DEX and resource table remain unchanged. New dependency classes are filtered against the baseline DEX before compilation to avoid duplicate class definitions.

The bridge uses AndroidX Health Connect 1.2.0-alpha06, including its updated provider certificates. Compilation requires Android Gradle Plugin 9.1.1, Gradle 9.3.1, Android SDK Platform 37.0, Build Tools 36.0.0 and JDK 17. The app's existing min/target SDK remain 31/35. Build dependencies reside under `.build-tools/health-connect`; local SDK paths and build output are ignored by Git.

Build with `scripts/build-health-connect-native.ps1`, then build the Android frontend and run `scripts/package-android-011.ps1 -SideBySide` and `scripts/verify-android-011.ps1`.

## Reads and accuracy

- Permissions are requested only through the provider's native permission contract. Each status/read checks granted categories. No health record write permissions are declared.
- Daily Steps use `StepsRecord.COUNT_TOTAL` via aggregate with no origin restriction. Counts are not summed from overlapping raw records. Steps and active-calorie daily totals share one calendar-period aggregation request. Day boundaries use the current local calendar and time zone, including DST.
- Sleep uses the main completed session ending on that local date and the provider's duration aggregate over its complete interval. Naps are not added to this readiness reading. A recorded session duration is not a diagnosis of sleep quality.
- HRV is RMSSD in milliseconds. Resting HR is read from resting-heart-rate records, not inferred from ordinary pulse measurements. Point readings select the latest measurement per local day and preserve the source record ID and origin.
- Missing measurements remain unknown. Changed daily aggregates update the same daily record. Identical data does not create revisions. Successfully read categories can remove a stale imported value deleted by the provider; failed/revoked categories do not erase history. Explicit user deletions are respected.
- Initial connection and explicit Sync import up to 28 days; regular active refresh reads two days to capture overnight sleep and late corrections. Successful history refresh is remembered across restart. Raw pagination stops on null or blank final tokens and rejects repeated cursors. Heart-rate pages are reduced as they arrive rather than flattening a month of samples into memory. Existing manual records and source preferences are retained.

## Active sync and account scope

Health OS checks every minute while visible and on focus/resume, coalescing repeated focus events. Reads pause cleanly when the app loses foreground access. Provider quota errors stop the current request batch and trigger persisted retry backoff, preserving saved data. Background reads require runtime feature support plus separate user permission. A persisted Android JobScheduler job requests a 15-minute interval; Android controls actual execution. Background results are encrypted with an Android Keystore AES-GCM key and tagged with the account's hashed scope. The frontend consumes only matching, newer snapshots after checking current permissions. No cloud tokens are stored in the job. Disconnect cancels reads, revokes this app's provider permissions and clears the native cache; imported Health OS history remains.

The SDK's exported `HealthDataSdkService` and its `ACTION_BIND_SDK_SERVICE` filter are required on Android 13. The SDK verifies trusted provider callers. The scheduler retains the existing pending job so foreground refresh does not reset its periodic interval. The packaging verifier checks that service, the privacy activity, scheduled job and health permission declarations, and verifies original native-entry hashes, APK signing and alignment.

## Verification

Native JVM tests cover blank/null page endings, repeated cursors and wrapped quota errors. Node tests cover duplicate prevention, corrected totals, missing data, units, explicit deletion and metadata ordering. Android browser tests cover permissions, live total changes, navigation and disconnect using an isolated native fixture. Those tests are separate from actual on-phone permission/read verification. No synthetic measurements are written to the user's Health Connect store.

