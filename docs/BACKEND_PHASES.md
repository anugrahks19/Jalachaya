# Java backend implementation phases

Current progress: Phases 1–5 are implemented and passed H2 tests. The MySQL smoke test passed through Flyway V7. Phase 6 Java AI jobs, retries, response validation, and outage tests are implemented. The Python FastAPI image service is integrated and a disposable live Java + Python workflow reached `VERIFIED`. A pretrained litter detector can produce advisory object detections without local training, but its performance on pond photos remains unvalidated. Public activity, pond counts, timeline, recovery score, verified highlights, escalation, dashboard counts, and analytics read database data.

1. **Foundation:** Spring Boot project, database migrations, configuration, CORS, validation, JSON error handler. Done when the app starts, connects to the database, and the frontend can call it.
2. **Accounts and ponds:** Registration, login, JWT, role permissions, pond management and public pond APIs. Done when users can log in, citizens can see ponds, and officers can manage them.
3. **Complaints and assignment:** Complaint submission with photos, complaint lists/details, history, worker assignment. Done when a citizen reports a problem and an officer assigns it.
4. **Field work and verification:** Start task, notes, before/after evidence, completion, officer review, citizen confirm/dispute. Done when one complaint reaches `VERIFIED` or `REOPENED` through the real backend.
5. **Operations:** Overdue detection, escalation, dashboard counts, analytics, recovery score. Done when officer screens show accurate database data.
6. **AI and hardening:** Integrate the Python AI service, handle outages, test permissions, transitions, retries, and uploads. Done when the full workflow works even when AI is temporarily unavailable.

## Completion request decision for Phase 4

Implemented: `POST /api/tasks/{id}/complete` is one multipart request containing `beforeImage`, `afterImage`, and `remarks`. The Java service validates ownership and `IN_PROGRESS` status, stores both images and evidence, changes status to `COMPLETION_CLAIMED`, and appends history. Repeated submissions return `409` without duplicate evidence. Newly stored files are cleaned up if the database transaction fails. `js/api.js` and `docs/API_CONTRACT.md` use this contract. Evidence is included in task and complaint reads; there is no separate evidence read endpoint.

`USE_MOCK_BACKEND` is now `false` in `js/config.js`. Start the backend before opening the frontend. The H2 integration tests cover citizen → officer → worker → officer → citizen through the real API; the same flow has now also passed against MySQL with browser checks.

## Phase 6 AI boundary

Java stores classification and completion evidence AI jobs in the same database transactions as the source records. The jobs are retried after AI failures; the workflow can reach `VERIFIED` while AI is unavailable. Results are advisory and require the response checks in `docs/AI_INTEGRATION.md`. The Python service detects some litter with pretrained weights, checks image quality, and estimates visible pixel change after aligning photos when possible. Human review still decides completion.
