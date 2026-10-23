# Placeholder and real-data audit — 23 October 2026

## Active application

- The frontend API methods call Java. Browser MockBackend branches were removed, mock script tags were removed from application pages, and the local file server rejects `js/mock/` URLs. There is no browser-data fallback when Java is unavailable.
- Public ponds, activity, highlights, timelines, complaint counts, dashboard counts, analytics and workflow percentages query database records. No hardcoded feed or count stub was found in the active Java controllers/services.
- Uploads are actual files validated and saved by Java; task completion is one multipart operation with database/file rollback handling and repeat protection.
- AI output comes from the loaded pretrained detector and actual photo comparisons. The health response reports whether model weights loaded successfully. Without weights the service explicitly returns visual-only/citizen-report results, not invented predictions.
- Notification entries and unread/read state are stored in MySQL. The app does not claim email/SMS messages were sent.
- Password recovery uses a real local database maintenance command and single-use hashed tokens. Real MySQL/browser checks confirmed new password login, token expiry/reuse protection and old-session invalidation.
- Health diagnostics query live services and database state. Backup success requires dump/table checks, a completion footer and matching file hashes; a disposable MySQL restore also matched every saved table's row count.

## Intentional examples, explicitly requested for judges

- Judge accounts use published sample credentials but authenticate through Java against hashed passwords in MySQL.
- Their three ponds, nine complaints, evidence and reviews are actual stored records, labelled `[JUDGES DEMO]`. They are fictional presentation examples, not records of real cleanup work. Seeding preserves changes across restarts.
- Bundled sample photos are used for those examples and the six-photo AI sanity check. They are not a representative labelled local field dataset.
- Old `js/mock/` source files remain as unserved historical reference; they are not active application code.

## Correct empty values and limitations

- Empty feeds/lists are correct when no matching data exists. A null workflow percentage means no applicable complaints exist.
- HTML input `placeholder` text gives form hints; it is not backend sample data.
- `.env.example` and example API JSON are documentation only. The launcher does not load fake example credentials from them.
- The old “recovery” label was changed to **Workflow progress**. The calculation follows complaint stages and priorities; it cannot establish water quality.
- Escalation actions record levels and history and notify relevant app users. No external Ward/Panchayat official email or SMS delivery is configured.

The remaining uncertainty is field accuracy of the pretrained AI, not missing database-backed workflow endpoints. Water chemistry and environmental safety need separate measurements. Public hosting and external email/SMS are outside the current local presentation setup.
