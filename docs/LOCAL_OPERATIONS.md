# Local operation and maintenance

Use `start-jalachaya.cmd` and `stop-jalachaya.cmd` from the project root. The launcher uses MySQL database `jalachaya`, user `jalachaya`, and ports 3306 (MySQL), 8080 (Java), 8000 (AI), and 5500 (frontend). Application services bind to loopback. This installation does not need a domain or external HTTPS certificate.

Starting again while the app is healthy reuses its existing services. After a reboot or interrupted launch, stale session records are recovered automatically and launcher-owned services are restarted as needed. PID and creation time must both match before a process is stopped; unrelated programs are preserved. Session state is saved during startup, and a launch lock prevents simultaneous double-clicks from starting duplicate services. If an unrelated program occupies an application port, close that program before launching.

## Judge demonstration

The launcher sets `ENABLE_JUDGE_DEMO=true`. The Java runner creates three judge accounts and labelled demo records once, using ordinary application services and transactions. Existing records and passwords are preserved. Login buttons come from `/api/public/demo-accounts`, which exposes only the intentional sample credentials when judge mode is enabled. Normal private account credentials are never published. User actions persist in MySQL and survive restarts.

Java started outside the launcher defaults to disabling judge mode. This hides the judge login helper; it does not delete existing example records or deactivate those accounts. This mode is intended for the requested local presentation.

## Password recovery

Keep the application running. Double-click `recover-account.cmd`, enter the account email and, if no saved launcher credential exists, the MySQL password locally. The command needs access to the local Windows account/database and opens a private reset link in the browser. It never overwrites a password directly. The user chooses a new password on that page.

The link contains a random 256-bit token in its URL fragment, which the page removes immediately. Only its SHA-256 hash is stored in MySQL. It expires after 30 minutes and all of that account's reset tokens are deleted after use. Updating the password increments an account authentication version, invalidating previously issued JWTs. The database maintenance command never stores the entered MySQL password in shell history or files.

## Notifications

Each dashboard links to Notifications. A background collector reads committed workflow history and creates inbox entries for the reporter, assigned worker and officers as applicable, excluding the actor. A per-recipient/history uniqueness constraint and locked processing prevent duplicates. Read state and unread counts come from MySQL. The page refreshes every 20 seconds. Email/SMS delivery is not enabled; there is no fake success response for external delivery.

## Health checks

Double-click `check-jalachaya.cmd` for real frontend, Java/database, AI/model and backup status. For ongoing checks, run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\check-jalachaya.ps1 -Watch`; press Ctrl+C to stop. The latest result is saved to ignored `.runtime/health.json` and changes are printed. A one-shot check exits nonzero if an application service is down.

Officers can query `/api/operations/health` with their JWT for actual migration version, AI job states, pending notification events, free storage and uptime. Model absence is reported as VISUAL_ONLY; a healthy visual service does not imply that model weights are loaded or that the model is accurate.

## Backups

The first launch each day takes a backup of an existing schema before application startup. `backup-jalachaya.cmd` also takes a backup on demand. It stops launcher services, requires port 8080 to be unused, runs mysqldump and copies `backend/uploads/`, then restarts the application if it was previously running. Do not run another application instance writing the same database or uploads during a backup.

Completed snapshots are `.runtime/backups/<timestamp>/`. A snapshot includes the SQL dump, uploaded photos, a schema/table count, hashes, and a `COMPLETE.json` marker only after dump checks pass. Failed snapshots have no valid success marker. The MySQL 26.7 masking-policy dump is skipped because the app user does not need global access to those policies. The user/password definitions and encrypted launcher credentials are not part of the backup.

Run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\verify-backup.ps1` to verify the latest completed snapshot; supply `-BackupFolder` to select one. Copy backups to another private drive. They contain user and complaint data. No old snapshots are automatically deleted.

## Restore

`restore-jalachaya.cmd` asks for a snapshot folder, verifies every manifest hash and checks that its schema version matches the current installation. It requires typing RESTORE before replacing data. It takes a new safety snapshot and keeps the previous upload directory under `.runtime/pre-restore-uploads-*`. The application remains stopped after restoration; start it when ready. A failure during restore must be resolved using the safety snapshot before restarting.

The backup's structure, hashes and successful import have been verified using a separate disposable MySQL instance, with every table's row count matching the snapshot. The temporary instance was removed afterward. The interactive restore command has not replaced the user's working data. Matching schema versions are required to avoid leaving tables from a newer application version in an older snapshot. Repeat the non-destructive import check with `python verify-backup-restore.py`; it creates and removes only its own temporary MySQL data directory and uses a separate loopback port.

## Repeat the verification

- `verify-mysql-workflow.cmd`: real Java + FastAPI + MySQL flow through VERIFIED with browser AI display checks. It temporarily stops the main launcher to prevent concurrent AI schedulers with different upload paths, then restarts it. Its unique test records and uploads are removed.
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\verify-local.ps1`: all three judge browser logins, data counts, notifications, officer health, local reset command/page and file isolation. It removes its temporary recovery account.
- `backend/run-mysql-smoke.ps1`: connection, database product, Flyway V7 and API health only.
- `python -m pytest ai-service/tests -q`: AI request validation and advisory/fallback behavior.
- `python ai-service/evaluate_model.py`: repeat the six-photo visible-litter check.

Browser verification needs development dependencies Playwright and its Chromium browser. These are not needed for everyday application use.
