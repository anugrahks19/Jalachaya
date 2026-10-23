# Jalachaya — local pond reporting system

This project runs a static HTML/CSS/JavaScript frontend, a Java 17 Spring Boot API, a MySQL database, and a Python FastAPI image service. Frontend actions call Java; complaints, assignments, evidence, reviews, notifications and dashboards use stored database records.

## Start and stop

Double-click **start-jalachaya.cmd**. It checks/starts MySQL, verifies the database login, applies Flyway migrations, starts Java and Python, serves the frontend, and opens http://127.0.0.1:5500/index.html. On the first run it prompts for the existing MySQL app password and private officer/worker passwords. They are encrypted for your Windows account in ignored `.runtime/credentials.json`. Existing account passwords are never overwritten.

Requires Java 17, Python 3.11+, MySQL with the `jalachaya` database and user, and either `backend/.tools/apache-maven-3.9.9/` or Maven on PATH. Missing Python packages and pretrained weights are installed on first setup; internet is needed for those downloads. The application services listen on localhost. Close other services using ports 5500, 8000 or 8080 first. If MySQL is stopped and Windows denies permission to start its service, start MySQL through Windows Services or run the launcher as administrator.

Double-click **stop-jalachaya.cmd** to stop the processes started by the launcher. MySQL remains running. Logs are in `.runtime/`.

## Judge accounts with populated data

The login form lets users choose **Citizen**, **Panchayat officer**, or **Field worker** before entering credentials. Java checks the selected role against the account. The local launcher also enables three demonstration accounts; their helper buttons fill the credentials and select the matching role, then you click **Log in**.

| Role | Email | Password |
|---|---|---|
| Citizen | citizen@judges.invalid | JudgeCitizen123! |
| Panchayat officer | officer@judges.invalid | JudgeOfficer123! |
| Field worker | worker@judges.invalid | JudgeWorker123! |

These are real Java accounts with hashed passwords and MySQL records. Initial setup creates three ponds and nine complaints spanning all workflow stages, including an overdue assignment. Worker tasks, evidence, officer reviews and citizen responses are stored. Seeding runs once and preserves subsequent changes. Your private accounts and data are not reset.

Ponds and complaints are clearly labelled **[JUDGES DEMO]**. Their example photos and outcomes demonstrate the application; they are not evidence of actual field cleanups. Browser mock scripts are neither loaded nor served. Judge mode is enabled explicitly by the local launcher; Java defaults to disabling it when started separately.

## Presentation workflow

Login uses a compact, wider card with the role selector and judge account buttons together. Citizen registration has two sliding steps: personal details, then password, with inputs preserved on Back. Both auth pages fit the tested desktop/phone viewports without page scrolling. In the citizen portal, **Public pond status** opens `citizen/ponds.html` with the portal navigation retained; pond details and timelines open in a dialog.

1. Log in as the judge citizen. Open existing complaints, or submit a new report with your own photos.
2. Log in as the judge officer. Assign the report to **Judges Demo Field worker**, set a future deadline and priority, and show the dashboard counts. A seeded overdue task can be escalated.
3. Log in as the judge worker. Start the inspection, add a note, and submit both evidence photos with remarks in one request.
4. Log in as the officer. Inspect evidence and AI results, then forward the task for community verification or return it to the worker.
5. Log in as the citizen. Confirm to reach VERIFIED, or dispute with a reason to reach REOPENED. Old evidence and history are retained.
6. Open **Notifications** to see persistent updates for the logged-in account. Lists and dashboards refresh every 20 seconds.

The percentage shown as **Workflow progress** is a priority-weighted calculation from complaint stages. It does not measure water quality.

## Local maintenance

| Command | Purpose |
|---|---|
| start-jalachaya.cmd | Start all application services and open the website |
| stop-jalachaya.cmd | Stop launcher-owned processes |
| check-jalachaya.cmd | Check frontend, Java, database, AI model and latest backup |
| backup-jalachaya.cmd | Pause the application, back up MySQL and uploaded files, verify the dump, and restart |
| recover-account.cmd | Issue a private one-time reset link for an existing account |
| restore-jalachaya.cmd | Verify a selected backup and restore it after an explicit RESTORE confirmation |
| verify-mysql-workflow.cmd | Exercise the full real MySQL workflow and browser, then remove only its temporary test records |

The launcher takes the first backup of each day before startup when an existing schema is present. Backups and checksums are under `.runtime/backups/`. Copy completed backups privately to another drive. A `COMPLETE.json` marker means the dump/table checks and file hashes passed; it does not mean a destructive restore was performed.

Recovery requires local computer/database access. The reset link expires after 30 minutes, can be used once, and invalidates old sessions when the password changes. Reset tokens are hashed in MySQL and are not returned by a public request endpoint. Email/SMS delivery is not configured; this local installation uses its real in-app notification inbox.

Details: [Local operations](docs/LOCAL_OPERATIONS.md), [Backend status](docs/BACKEND_STATUS.md), [Backend setup](backend/README.md), [API contract](docs/API_CONTRACT.md).

## AI behavior and measured limits

The Python service uses pinned pretrained TACO YOLO11s litter weights without local training. It reports possible litter objects, image quality, before/after counts and visible pixel change. It always requires human completion review. Java stores durable AI jobs and retries failed requests, so AI outages do not prevent the normal workflow.

A visually reviewed six-photo sample check found all three litter photos, correctly rejected two photos without visible litter, and falsely flagged one clean-looking scene as cartons. That is **5/6 correct for visible-litter presence on this small reused set**, not an estimate of field accuracy. No local object-box dataset, sewage detector, algae classifier or water-quality measurement exists. See [Evaluation results](docs/AI_SAMPLE_EVALUATION.md) and [AI service](ai-service/README.md).

## Verification

- Java suite: 16 tests, 15 passed, one conditional MySQL test skipped in the standard run.
- Full Java + FastAPI + MySQL workflow and browser officer results passed; its temporary test data was cleaned up.
- All three judge logins, real populated records, notifications, officer diagnostics and local password recovery passed against the launcher and MySQL.
- Backup dump checks and file checksums passed. The backup restored into a separate disposable MySQL instance with every table row count matching; your working database was not replaced.

Run focused Python tests with `python -m pytest ai-service/tests -q`, or repeat the labelled-photo check with `python ai-service/evaluate_model.py`. Development verification uses Playwright and Chromium; normal app startup does not require them.
