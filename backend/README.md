# Jalachaya Java backend

Java backend for the static frontend in the parent folder. Java 17 and Maven are required.

For normal local use, double-click `start-jalachaya.cmd` in the parent folder. It starts the installed MySQL service, Java, Python AI and frontend together. Its first run prompts privately for credentials. See the root `README.md` for setup and `docs/BACKEND_STATUS.md` for verified behavior and remaining work.

## Run locally

From `backend/`, set a private JWT secret and bootstrap credentials in the PowerShell window that will run the server. This secret-generation form works in Windows PowerShell 5.1 and PowerShell 7:

```powershell
$env:JAVA_TOOL_OPTIONS = "-Duser.home=$env:USERPROFILE"
$bytes = New-Object byte[] 48
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
$env:JWT_SECRET = [Convert]::ToBase64String($bytes)
$env:BOOTSTRAP_OFFICER_EMAIL = 'officer@example.com'
$env:BOOTSTRAP_OFFICER_PASSWORD = 'REPLACE-WITH-YOUR-OWN-LONG-PASSWORD'
$env:BOOTSTRAP_WORKER_EMAIL = 'worker@example.com'
$env:BOOTSTRAP_WORKER_PASSWORD = 'REPLACE-WITH-A-DIFFERENT-LONG-PASSWORD'
& '.\.tools\apache-maven-3.9.9\bin\mvn.cmd' '-Dmaven.repo.local=.tools\maven-repository' spring-boot:run
```

Replace both password placeholders before starting. Each bootstrap password must have at least 12 characters. `JWT_SECRET` must have at least 32 UTF-8 bytes. Maven was not on `PATH` on this workspace host, so an ignored local copy is available at `.tools/apache-maven-3.9.9/bin/mvn.cmd`. For a fresh checkout, install Maven or add the Maven wrapper.

The default persistent H2 database is in `backend/data/`. Flyway creates and updates the schema; Hibernate validates it at startup. Check `GET http://localhost:8080/api/health` for `{"status":"UP","database":"UP"}`. The bootstrap accounts are created only if the corresponding email and password settings are supplied, and existing passwords are never overwritten. Citizen accounts use `POST /api/auth/register`. Do not commit real credentials.

## Use MySQL

The local MySQL command-line client is at `C:\Program Files\MySQL\MySQL Server 26.7\bin\mysql.exe` on this workspace host. In PowerShell, open an administrator session with `& 'C:\Program Files\MySQL\MySQL Server 26.7\bin\mysql.exe' -u root -p`; enter the password only when prompted. Run this SQL, replacing the placeholder with a private password:

```sql
CREATE DATABASE IF NOT EXISTS jalachaya CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'jalachaya'@'localhost' IDENTIFIED BY 'YOUR-DATABASE-PASSWORD';
GRANT ALL PRIVILEGES ON jalachaya.* TO 'jalachaya'@'localhost';
```

If the `jalachaya` user already exists, `CREATE USER IF NOT EXISTS` does not reset its password. As the administrator, run `ALTER USER 'jalachaya'@'localhost' IDENTIFIED BY 'your actual private password';`, replacing the example text before pressing Enter. Exit and verify the account with `& 'C:\Program Files\MySQL\MySQL Server 26.7\bin\mysql.exe' -h 127.0.0.1 -u jalachaya -p --ssl-mode=REQUIRED -D jalachaya -e 'SELECT CURRENT_USER(), DATABASE();'`. Do not continue until this prints a row.

Then set `DB_URL`, `DB_USERNAME`, and `DB_PASSWORD` from `.env.example` in the same PowerShell window used to start the server:

```powershell
$env:DB_URL = 'jdbc:mysql://localhost:3306/jalachaya?sslMode=REQUIRED&serverTimezone=UTC'
$env:DB_USERNAME = 'jalachaya'
$securePassword = Read-Host 'Jalachaya MySQL password' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try { $env:DB_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
& '.\.tools\apache-maven-3.9.9\bin\mvn.cmd' '-Dmaven.repo.local=.tools\maven-repository' spring-boot:run
```

Stop the H2-backed server before restarting with MySQL on port 8080. H2 records are not automatically copied to MySQL; it starts as a separate database. `.env.example` is a reference file; Spring Boot does not load it automatically. Flyway runs migrations V1–V7 on startup. The MySQL smoke test passed through V7; the full citizen-to-verification MySQL workflow and browser checks have passed.

For an isolated MySQL connection and migration check, run this from `backend/`:

```powershell
& '.\run-mysql-smoke.ps1'
```

The script prompts for the password, sets the MySQL connection variables in the same process as Maven, and clears the password variable afterward. This test verifies the server is MySQL, Flyway has reached V7, and `/api/health` reports the database is up. It does not create sample accounts or complaints.

The frontend origins default to `http://localhost:5500` and `http://127.0.0.1:5500`; set `FRONTEND_ORIGINS` to a comma-separated list if your frontend runs elsewhere. `UPLOAD_DIR` configures pond, complaint, and task evidence storage. The frontend now uses the real API, so start the backend before opening its pages.

## Phase 2 endpoints

- Public: `GET /api/public/ponds`, `GET /api/public/ponds/{id}`, `GET /api/public/activity`, `GET /api/public/highlights`.
- Accounts: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/users/me`.
- Officer: `GET /api/users?role=FIELD_WORKER`, `GET/POST /api/ponds`, `GET/PUT /api/ponds/{id}`, `POST/DELETE /api/ponds/{id}/image`.

## Phase 3 endpoints

- Citizen: `POST /api/problems` (multipart report, up to 3 photos), `POST /api/problems/{id}/images` (one later photo, up to 6 total), `GET /api/problems?mine=true`, `GET /api/problems/{id}` for their own complaint.
- Officer: `GET /api/problems` with filters, `GET /api/problems/{id}`, `PUT /api/problems/{id}` to reject a new or reopened report, `POST /api/tasks` to assign a worker and deadline.
- Assigned worker: `GET /api/problems/{id}` for an assigned complaint.
- Public activity, pond timeline, complaint counts, and recovery percentage use stored complaints.

Ponds with open complaints cannot be deactivated. A worker's `openTasks` count is based on assigned or in-progress work.

## Phase 4 endpoints

- Worker: `GET /api/tasks?mine=true`, `PUT /api/tasks/{id}` to start, `POST /api/tasks/{id}/notes`, `POST /api/tasks/{id}/complete` with both evidence photos and remarks in one multipart request.
- Officer: `POST /api/verifications` to forward completed work to the community or return it to the worker.
- Citizen: `GET /api/community-verifications/pending`, `POST /api/community-verifications` to confirm or dispute. A dispute reopens the complaint and closes the old task while retaining its evidence.
- Public verified highlights now come from completed and confirmed work.

Completion retries return `409` after a successful submission and cannot create duplicate evidence. Local uploaded files are removed if the database transaction rolls back. After an officer returns work, the worker may submit new evidence. The old evidence remains in the database for the audit trail.

## Phase 5 endpoints

- Officer: `POST /api/escalations` with `{ taskId, reason }` escalates an overdue active task through Ward member, Panchayat President, and Block Development Officer. Each level is stored once and added to complaint history; another attempt after level 3 returns `409`.
- Officer: `GET /api/dashboard/summary` and `GET /api/dashboard/analytics` return live database counts and per-pond recovery scores.
- Overdue is computed from the current deadline and workflow status when lists and dashboards are read. No scheduled job is required for the prototype.

The six-phase roadmap and the single multipart completion request decision are recorded in `docs/BACKEND_PHASES.md` at the repository root.

## Phase 6 Java AI integration

Report submission and completion evidence each create a durable AI job. Start the Python service using `ai-service/README.md`, then set `AI_ENABLED=true`. `AI_SERVICE_URL` defaults to `http://localhost:8000`; `AI_BACKEND_URL` must be reachable from Python so it can fetch uploaded photos. The scheduler retries failed calls and validates the returned IDs, task type, model version, warnings, and confidence. It does not automatically accept or reject the work. With AI disabled or temporarily unavailable, the citizen-to-verification workflow still works and the jobs remain pending for later processing. The live Java + Python H2 workflow has passed; MySQL migrations passed through V7.
