# JALACHAYA — REST API contract (frontend ↔ Spring Boot)

This lists every endpoint the frontend calls when `USE_MOCK_BACKEND` is `false` (see `js/api.js`). It follows the minimum set in the implementation guide, with a few additions marked **(added)** that the screens need.

Implementation status: Phases 1–5 and the Phase 6 Java adapter are implemented. The Python image service is integrated and the real Java + Python API workflow passed on both H2 and MySQL, with browser checks. A pretrained litter model supplies advisory detections; the citizen's reported category remains authoritative for workflow routing. See `docs/AI_INTEGRATION.md` for the AI contract. The backend also provides `GET /api/ponds/{id}` for officer pond detail. Run the backend before using real frontend mode.

- Base URL: `http://localhost:8080`
- All protected requests send `Authorization: Bearer <JWT>`.
- JSON uses camelCase. Dates are ISO-8601 strings (e.g. `2026-10-19T11:30:00Z`).
- Errors return the HTTP status and `{ "message": "Readable explanation" }`.

## Local maintenance additions

| Method & path | Who | Behavior |
|---|---|---|
| `POST /api/auth/reset-password` | holder of a valid local reset link | JSON `{ token, password }`; single use, 30-minute expiry, minimum 12 characters and at most 72 UTF-8 bytes. Invalid/expired link returns 400. Revokes old JWTs. |
| `GET /api/notifications` | logged-in user | `{ items: [{id, message, problemId, createdAt, read}], unreadCount }`; latest 100 own records, unread count over the whole inbox. |
| `POST /api/notifications/{id}/read` | logged-in user | Marks only their own record read; never changes another account's record. |
| `GET /api/operations/health` | officer | Actual migration version, AI job states, pending notification count, free storage and uptime. |
| `GET /api/public/demo-accounts` | public | Publishes only intentional judge sample credentials when local judge mode is enabled and those accounts exist. Java defaults to disabled; the launcher enables it. |

Flyway V7 adds hashed reset tokens, account authentication versions and persistent notifications. Reset issuance requires the private `recover-account.cmd` maintenance command; no public request endpoint exposes reset tokens. Email/SMS are not configured. Judge example records are stored in the real database and labelled `[JUDGES DEMO]`; old browser mock scripts are not used.

## Enums (must match `js/constants.js`)

| Enum | Values |
|---|---|
| Role | `COMMUNITY_MEMBER`, `PANCHAYAT_OFFICER`, `FIELD_WORKER` |
| Category | `PLASTIC_WASTE`, `SEWAGE_DISCHARGE`, `ALGAE_WEED`, `DEAD_FISH`, `FOUL_SMELL`, `BANK_DUMPING`, `STAGNANT_WATER`, `OTHER` |
| Priority | `LOW`, `MEDIUM`, `HIGH`, `URGENT` |
| Status | `SUBMITTED`, `ASSIGNED`, `IN_PROGRESS`, `COMPLETION_CLAIMED`, `COMMUNITY_VERIFICATION`, `VERIFIED`, `REOPENED`, `REJECTED` |

## Endpoints

| # | Method & path | Who | Used by | Body / query |
|---|---|---|---|---|
| 1 | `POST /api/auth/login` | anyone | login.js | `{ email, password, role? }`; the login page requires a role selection. A supplied role must match the stored account role or the API returns 403; unknown roles return 400. Omitting it remains supported for existing API clients. |
| 2 | `POST /api/auth/register` | anyone | register.js | `{ name, email, phone, ward, password }` → creates `COMMUNITY_MEMBER` |
| 3 | `GET /api/users/me` | logged in | — | |
| 4 | `GET /api/users?role=FIELD_WORKER` | officer | complaints | |
| 5 | `GET /api/public/ponds` **(added)** | anyone | home, report | |
| 6 | `GET /api/public/ponds/{id}` **(added)** | anyone | pond.js | |
| 6a | `GET /api/public/highlights` **(added)** | anyone | home.js | latest 2 verified complaints with before/after photos |
| 6b | `GET /api/public/activity` **(added)** | anyone | home.js | latest 6 public events (see below) |
| 7 | `GET /api/ponds` | officer | ponds, complaints | |
| 8 | `POST /api/ponds` | officer | ponds | Pond fields |
| 9 | `PUT /api/ponds/{id}` | officer | ponds | Pond fields, or `{ active: false }` to deactivate |
| 9a | `POST /api/ponds/{id}/image` **(added)** | officer | ponds | multipart: `image` (replaces the current photo) |
| 9b | `DELETE /api/ponds/{id}/image` **(added)** | officer | ponds | removes the pond photo |
| 10 | `POST /api/problems` | citizen | report.js | multipart: `pondId, category, description, landmark, latitude, longitude`, and `images` repeated 0–3 times |
| 10a | `POST /api/problems/{id}/images` **(added)** | reporter | citizen dashboard | multipart: `image, caption?` (max 6 photos per complaint, not when VERIFIED/REJECTED) |
| 11 | `GET /api/problems?mine=true` | citizen | citizen dashboard | |
| 12 | `GET /api/problems` | officer | complaints, overview | query: `pondId, category, priority, status, overdue=true, search` |
| 13 | `GET /api/problems/{id}` | officer / reporter / assigned worker | detail dialogs | |
| 14 | `PUT /api/problems/{id}` | officer | reject | `{ status: "REJECTED", reason }` |
| 15 | `POST /api/tasks` | officer | assign | `{ problemId, assignedWorkerId, deadline, priority, instructions }` |
| 16 | `GET /api/tasks?mine=true` | worker | worker dashboard | |
| 17 | `PUT /api/tasks/{id}` | assigned worker | start inspection | `{ status: "IN_PROGRESS" }` |
| 18 | `POST /api/tasks/{id}/notes` **(added)** | assigned worker | add note | multipart: `text, image?` |
| 19–20 | `POST /api/tasks/{id}/complete` | assigned worker | submit completion | one multipart request: `beforeImage, afterImage, remarks` → status `COMPLETION_CLAIMED`; repeat returns `409` without new evidence. No separate evidence upload endpoint. |
| 21 | `POST /api/verifications` | officer | review work | `{ taskId, decision: "FORWARD" \| "RETURN", comment }` |
| 22 | `GET /api/community-verifications/pending` **(added)** | citizen | verify.js | |
| 23 | `POST /api/community-verifications` | citizen | verify.js | multipart: `taskId, decision (CONFIRM \| DISPUTE), comment, image?` — the photo is also added to the complaint's `images` |
| 24 | `POST /api/escalations` | officer | escalate | `{ taskId, reason }` |
| 25 | `GET /api/dashboard/summary` | officer | overview | |
| 26 | `GET /api/dashboard/analytics` **(added)** | officer | overview charts | |

## Response shapes

### Login / register → `200`
```json
{ "token": "eyJ...", "role": "COMMUNITY_MEMBER", "userId": 12, "name": "Anjali Menon" }
```

### Public pond (list item) — #5
```json
{
  "id": 1, "name": "Thamarakulam", "ward": "Ward 3", "village": "Puthur",
  "areaAcres": 1.2, "latitude": 10.4921, "longitude": 76.2486,
  "totalComplaints": 2, "activeComplaints": 1, "resolvedComplaints": 1, "recoveryPercent": 92
}
```
`imageUrl` is the pond photo or `null`. `recoveryPercent` is `null` when the pond has no non-rejected complaints. It uses the prototype weights in `js/constants.js`; a new submitted complaint scores 0%, an assigned complaint 20%, and later workflow stages increase it. #6 adds `description` and
`timeline: [{ code, category, status, createdAt, updatedAt }]` — no names.

### Pond (officer) — #7–9
Public fields plus `description`, `active`, `createdAt`.

### Problem — #10–14
```json
{
  "id": 11, "code": "JC-1011", "pondId": 1, "pondName": "Thamarakulam",
  "reporterId": 6, "reporterName": "Meera Krishnan", "reporterPhone": "9876543210",
  "category": "SEWAGE_DISCHARGE", "priority": "HIGH", "status": "ASSIGNED",
  "description": "...", "landmark": "...", "latitude": 10.4921, "longitude": 76.2486,
  "images": [ { "url": "/uploads/problems/11-1.jpg", "caption": "Reported photo 1", "addedBy": "Meera Krishnan", "role": "COMMUNITY_MEMBER", "at": "..." } ],
  "rejectionReason": null,
  "overdue": false,
  "createdAt": "...", "updatedAt": "...",
  "history": [ { "status": "SUBMITTED", "note": "Complaint submitted.", "by": "Meera Krishnan", "role": "COMMUNITY_MEMBER", "at": "..." } ],
  "task": { "...see Task..." },
  "previousTaskCount": 0,
  "communityVerifications": [ { "decision": "CONFIRM", "comment": "...", "imageUrl": null, "userName": "...", "createdAt": "..." } ]
}
```
Visibility rules the frontend relies on:
- **Citizen** gets `history[].by` masked as `You`, `Community member`, `Field team` or `Panchayat office`, and `task` only as `{ id, deadline, evidence }` (evidence only once the work has been forwarded). No reporter phone, worker name or community voter names.
- **Officer** gets everything above.
- **Officer** also gets `aiClassification` with a pending or successful advisory result. A task includes `aiVerification` for its latest evidence submission. AI results do not change the workflow automatically.
- `overdue` = task active, status `ASSIGNED`/`IN_PROGRESS`, deadline passed.

### Task
```json
{
  "id": 8, "problemId": 11, "workerId": 4, "workerName": "Biju Thomas", "workerTeam": "Sanitation Team A",
  "priority": "HIGH", "deadline": "...", "instructions": "...", "active": true,
  "createdAt": "...", "startedAt": "...",
  "notes": [ { "text": "...", "imageUrl": null, "at": "..." } ],
  "evidence": { "beforeImageUrl": "...", "afterImageUrl": "...", "remarks": "...", "submittedAt": "..." },
  "review": { "decision": "RETURN", "comment": "...", "at": "..." },
  "escalationLevel": 1,
  "escalations": [ { "level": 1, "escalatedTo": "Ward member", "reason": "...", "by": "...", "at": "..." } ]
}
```
`GET /api/tasks?mine=true` (#16) returns tasks with extra fields:
`problem: { id, code, category, description, landmark, latitude, longitude, images, status, createdAt }`,
`pondName`, `overdue`, and `stage` (= problem status, or `CLOSED` for an inactive task that was reopened).

### Pending community verification — #22
```json
{
  "problemId": 2, "code": "JC-1002", "pondName": "Thamarakulam", "category": "ALGAE_WEED",
  "description": "...", "landmark": "...", "reportedByMe": false, "taskId": 2,
  "evidence": { "beforeImageUrl": "...", "afterImageUrl": "...", "remarks": "...", "submittedAt": "..." },
  "myResponse": null
}
```

### Highlight — #6a
```json
{ "code": "JC-1001", "pondName": "Thamarakulam", "category": "PLASTIC_WASTE", "verifiedAt": "...",
  "beforeImageUrl": "/uploads/...", "afterImageUrl": "/uploads/...", "remarks": "..." }
```

### Public activity — #6b
```json
[ { "id": "11-2", "code": "JC-1011", "pondName": "Chirakkal Kulam", "status": "ASSIGNED",
    "text": "Field worker assigned", "at": "2026-10-20T05:12:00Z" } ]
```
Public wording only — no names, internal notes or escalations. `id` must be unique and stable
(problem id + history index works), because the frontend uses it to highlight new events.

### Live updates
The frontend re-requests its lists every `CONFIG.LIVE_REFRESH_SECONDS` (20 s) while the tab is visible.
No WebSocket is needed for the prototype. A later version could add Server-Sent Events or WebSocket push
and call the same render functions.

### Image paths
Return image locations as paths such as `/uploads/problems/11-1.jpg` (served by Spring Boot). The frontend turns paths that start with `/` into `API_BASE_URL + path`. Full `https://` URLs also work.

### Dashboard summary — #25
```json
{
  "totalPonds": 5, "activeProblems": 9, "newComplaints": 3, "inProgress": 3,
  "overdue": 2, "awaitingReview": 1, "awaitingVerification": 1, "verified": 1
}
```

### Analytics — #26
```json
{
  "byCategory": { "PLASTIC_WASTE": 2, "SEWAGE_DISCHARGE": 1, "...": 0 },
  "byStatus":   { "SUBMITTED": 2, "ASSIGNED": 2, "...": 0 },
  "ponds": [ { "id": 1, "name": "Thamarakulam", "activeComplaints": 1, "resolvedComplaints": 1, "totalComplaints": 2, "recoveryPercent": 92 } ]
}
```

## Business rules the backend must enforce

| Rule | Status code if broken |
|---|---|
| Missing/invalid JWT | 401 |
| Wrong role, or worker acting on another worker's task, or citizen viewing another citizen's complaint | 403 |
| Unknown pond/problem/task ID | 404 |
| Assign only from `SUBMITTED` or `REOPENED`; reject only from those | 409 |
| Start only from `ASSIGNED`; submit evidence only from `IN_PROGRESS` | 409 |
| Review only from `COMPLETION_CLAIMED`; `RETURN` needs a comment | 409 / 400 |
| One community response per user per task; worker cannot verify own work | 409 / 403 |
| `DISPUTE` needs a reason; it sets `REOPENED`, deactivates the task and keeps its evidence | 400 |
| Escalate only overdue tasks, max level 3 | 409 |
| Deadline must be in the future; each image must be JPG/PNG/WEBP ≤ 5 MB; max 3 photos per report, 6 per complaint | 400 / 409 / 413 |
| Pond with open complaints cannot be deactivated | 409 |
| Duplicate email on register | 409 |
| Every status change appends to history — never overwrite or delete | — |
| Saving a complaint must not depend on the AI service being up | — |
