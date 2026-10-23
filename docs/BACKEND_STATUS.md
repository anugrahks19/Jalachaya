# Backend status — localhost installation

All six planned Java phases are implemented. The frontend uses the real API. MySQL Flyway V7, the full citizen-to-VERIFIED workflow and browser officer AI results were verified on 23 October 2026.

## Working

- Registration, login, JWT, role/ownership checks, pond management and public pond APIs.
- Complaint photos, filtering, history, worker assignment, task start and notes.
- Single multipart completion, duplicate protection, officer return/forward and citizen confirm/dispute.
- Overdue detection, escalation records, dashboard counts, analytics, public activity and verified highlights.
- Durable AI jobs, response checks, retry/recovery after outages, pretrained litter detections and visual evidence comparison.
- Persistent role-aware notification inbox and read state. Users cannot read or mark another user's notifications.
- Local administrator password recovery: hashed one-time token, 30-minute expiry, token reuse rejection and old-session revocation.
- Real judge accounts with three labelled demo ponds, nine complaints across eight stages and seven worker tasks. Seeding is opt-in and idempotent.
- Local start/stop, health diagnostics, automatic first daily startup backup, manual backup verification and a restore command with explicit confirmation.

## Verified evidence

- Standard Java suite: 16 tests, 15 passed, no failures, one conditional MySQL smoke test skipped.
- Python service tests: 6 passed.
- Java + FastAPI + MySQL flow reached VERIFIED, with live image fetches and AI output displayed in a headless browser. Test accounts, complaints, notifications and uploaded test images were removed afterward.
- Real launcher browser checks: citizen has 9 complaints, worker has 7 tasks, officer has 9 demo complaints; all role logins and notification pages passed.
- MySQL recovery command and browser reset form passed; old passwords and JWTs were rejected, the new password worked, and token replay failed. Its temporary recovery account was removed.
- Local file server blocks backend files, `.runtime` and old browser mock scripts.
- Compact auth layouts and the two-step registration wizard passed browser checks at six viewport sizes from 320×568 to 1920×900. Real MySQL registration, field validation and preserved Back navigation passed. Citizen public pond browsing and detail dialogs remain inside the portal and use the public database APIs.
- Login role selector verified in all three real browser logins, including missing-role validation, mismatch rejection and phone layout. The four focused accounts/ponds integration tests passed after the role check was added. Older API clients may omit the role; a supplied role must match the database account.
- Launcher recovery regression checks passed: stale/reused PIDs are preserved, unreadable session records are cleared, repeated starts reuse healthy services, and a stopped frontend is automatically recovered on the next launch. The stale-session startup error shown after services stopped was fixed.
- MySQL 26.7 backup verified table counts, per-table row counts, the dump completion footer and SHA-256 hashes. The backup then restored successfully into a separate disposable MySQL instance; every row count and upload checksum matched. The temporary server/data were removed, without replacing the working database. The MySQL masking-policy dump permission incompatibility was handled without granting global privileges.

## Honest limitations and remaining work

- The pretrained model is advisory. On six reused photos it got visible-litter presence right in five cases; one clean-looking scene was falsely labelled as cartons. This is not a representative held-out local pond evaluation. More labelled local photos are needed to measure field performance.
- Water chemistry, sewage, smell, algae and biological safety are not measured. Workflow progress is not water quality.
- Email/SMS are not enabled. The local installation has actual in-app notifications and operator-assisted recovery, so no external provider is needed for the presentation.
- Backup restoration passed on a disposable MySQL instance. The interactive restore command preserves a safety snapshot and previous upload folder; it has not been used to replace the working database.
- Public hosting, domain certificates and deployment monitoring are outside the user's current localhost scope.
- Additional officer/worker accounts use bootstrap configuration; a staff-administration screen is not part of the current API contract.

There are no known missing endpoints from the six-phase frontend contract. Old `js/mock/` sources remain as unused reference files; they are not loaded, served, or used as fallback. The only populated example records are the explicitly requested [JUDGES DEMO] data in MySQL. Empty lists and null workflow percentages mean no applicable records exist, not placeholder responses.
