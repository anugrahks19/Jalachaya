# Local email setup

SMTP is the connection Jalachaya uses to send email. The SMTP account is the **sender**; authority contacts are the **recipients**. These may be the same mailbox if you control it.

## Gmail sender

1. Enable Google 2-Step Verification for the sender account.
2. Create a Google app password for Jalachaya. Use that app password, not your normal Gmail password. Availability depends on account policy. See [Google's app password instructions](https://support.google.com/mail/answer/185833?hl=en).
3. Add the following to the private `backend/.env` file, replacing the example values locally:

```dotenv
ALERT_SMTP_HOST=smtp.gmail.com
ALERT_SMTP_PORT=587
ALERT_SMTP_USERNAME=your-sender@gmail.com
ALERT_SMTP_PASSWORD=your-google-app-password
ALERT_MAIL_FROM=your-sender@gmail.com
ALERT_SMTP_STARTTLS=true
```

Gmail uses [smtp.gmail.com with STARTTLS on port 587](https://developers.google.com/workspace/gmail/imap/imap-smtp?hl=en). Keep the password private; do not send it in chat or commit it. The file is ignored by Git.

4. Stop and restart Jalachaya using its launcher. An already running Java process keeps its previous settings.
5. Log in as a real Panchayat officer. Open **Overview → Automatic deadline alerts → Authority email recipients and setup**. Save the Panchayat, higher-authority and inspection addresses.
6. Click **Send test email**. “Accepted by email server” confirms SMTP acceptance; check the recipient inbox and spam folder to establish inbox arrival.

Alternatively, double-click `setup-email.cmd`. It saves the app password encrypted for your Windows account in the ignored `.runtime/` folder. Nonempty SMTP values in `backend/.env` take precedence over that saved configuration.

The launcher reads only the six SMTP keys listed above from `.env`; it does not execute the file. Spring Boot started directly with Maven needs these variables in its process environment. Other settings in `.env` are not automatically imported.

## Troubleshooting

- Authentication rejected: confirm sender email, Google app password, 2-Step Verification and account policy.
- New settings seem ignored: stop and start the app; launching again while healthy reuses the running services.
- Connection failure: check Internet access and outbound port 587.
- A queued alert shows `NEEDS_CONFIGURATION`: supply both a sender and the recipient for that alert level. The scheduler checks again.
- `RETRY`: the SMTP send failed; delivery is retried with backoff. Do not repeatedly click the test button to test the queue.
- Google password changes may revoke app passwords. Replace the local app password and restart if necessary.

Demo accounts never send external email. SMS and password-reset email delivery are not implemented; password recovery uses the existing local recovery command.
