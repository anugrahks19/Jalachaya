# Pond Recovery Index and deadline escalation

## Pond Recovery Index

This is a complaint-workflow index, not a measurement of water quality or ecological recovery.

For each pond, rejected complaints are excluded. Priority weights are Low 1, Medium 2, High 3 and Urgent 4. Stage fractions are:

| Stage | Fraction |
|---|---:|
| Submitted | 0 |
| Reopened | 0.1 |
| Assigned | 0.2 |
| In progress | 0.4 |
| Completion claimed | 0.6 |
| Community verification | 0.8 |
| Verified | 1 |

`Index = round(100 × sum(priority weight × stage fraction) / sum(priority weight))`

The result is capped at 99 unless every included complaint is verified. An empty applicable set returns null. Reopening work lowers its contribution. Photos and AI assessments do not establish water chemistry or biological safety.

## Automatic deadline stages

| Level | Default trigger | Action |
|---|---|---|
| L0 | Assignment | Existing assignment history and inbox notification |
| L1 | Within 24 hours before deadline | Assigned worker inbox and email reminder |
| L2 | Deadline reached | Panchayat inbox and configured Panchayat email |
| L3 | Still unresolved 24 hours after deadline | Officer inbox and configured higher-authority email |
| L4 | Still unresolved 48 hours after deadline | Officer inbox and configured manual-inspection email |

L4 requests manual inspection; it cannot arrange a physical inspection automatically. Authority recipients are configured by an officer. If all three addresses point to the same test mailbox, all three stages go to that mailbox; the app does not discover a government authority's address.

`DeadlineMonitor` checks active assigned/in-progress tasks every minute while Java is running. Stages, history, inbox notifications and delivery attempts are persisted in MySQL. Each task/level has one event. A restart catches up missed overdue stages without sending an expired pre-deadline reminder. Completion submission, cancellation or reassignment stops outstanding alerts for that inactive field task.

Configure these environment variables before starting Java to change the defaults:

```dotenv
DEADLINE_MONITOR_ENABLED=true
DEADLINE_POLL_MS=60000
DEADLINE_REMINDER_HOURS=24
DEADLINE_HIGHER_HOURS=24
DEADLINE_INSPECTION_HOURS=48
```

These are process environment variables; the launcher imports only SMTP keys from `backend/.env`.

## Delivery tracking

The officer Overview shows automatic events and delivery status. Complaint details show the stage history; workers see applicable deadline alerts on tasks. Real delivery uses SMTP; see [Email setup](EMAIL_SETUP.md).

- `PENDING`: queued for processing.
- `NEEDS_CONFIGURATION`: missing sender or recipient; checked again later.
- `PROCESSING`: claimed for a send attempt with a five-minute lease.
- `RETRY`: failed send, retried with backoff up to 60 minutes.
- `SENT`: accepted by the email server, not proof of inbox arrival or acknowledgment.
- `CANCELLED`: the task or reminder is no longer applicable.
- `DEMO_IN_APP`: demo inbox only; no external email.

Database event uniqueness prevents duplicate stage creation. SMTP delivery is not a database transaction: a crash after SMTP acceptance but before saving `SENT` can cause a duplicate message on retry. Alerts include a stable event header for correlation.

The computer and Java process must stay running for timely notifications. Gmail also needs an Internet connection. After downtime, processing resumes at the next scheduled check.
