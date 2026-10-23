"""Exercise the actual launcher, judge logins, notifications and local recovery."""
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import time
import requests
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
API = "http://127.0.0.1:8080"
SITE = "http://127.0.0.1:5500"

def main():
    accounts = requests.get(API + "/api/public/demo-accounts", timeout=10).json()["accounts"]
    assert len(accounts) == 3, "Judge accounts were not enabled or seeded"
    evidence = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            for account in accounts:
                context = browser.new_context()
                page = context.new_page()
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.goto(SITE + "/login.html")
                page.get_by_role("button", name=account["label"], exact=True).click()
                page.get_by_role("button", name="Log in", exact=True).click()
                page.wait_for_url(re.compile(r"/(citizen|panchayat|worker)/dashboard.html"))
                page.get_by_role("link", name=re.compile("Notifications")).wait_for()
                session = requests.post(API + "/api/auth/login", json={"email": account["email"], "password": account["password"]}, timeout=10).json()
                headers = {"Authorization": "Bearer " + session["token"]}
                path = {"COMMUNITY_MEMBER": "/api/problems?mine=true", "FIELD_WORKER": "/api/tasks?mine=true", "PANCHAYAT_OFFICER": "/api/problems"}[account["role"]]
                records = requests.get(API + path, headers=headers, timeout=10).json()
                assert len(records) >= (8 if account["role"] == "COMMUNITY_MEMBER" else 6)
                page.goto(SITE + "/notifications.html")
                page.get_by_text(re.compile(r"\d+ unread")).wait_for()
                if account["role"] == "PANCHAYAT_OFFICER":
                    health = requests.get(API + "/api/operations/health", headers=headers, timeout=10)
                    assert health.ok and health.json()["migrationVersion"] == "10"
                assert not errors, errors
                evidence.append({"role": account["role"], "databaseRecords": len(records), "browser": "PASS"})
                context.close()
            verify_recovery(browser)
        finally:
            browser.close()
    for path in ("/backend/pom.xml", "/.runtime/credentials.json", "/js/mock/seed-data.js"):
        assert requests.get(SITE + path, timeout=5).status_code == 404
    output = ROOT / ".runtime" / "local-verification.json"
    output.write_text(json.dumps({"judgeRoles": evidence, "passwordRecovery": "PASS", "frontendFileIsolation": "PASS"}, indent=2), encoding="utf-8")
    print("PASS: all three judge browser logins use populated Java/MySQL data")
    print("PASS: notification inbox, officer diagnostics, and frontend file isolation")
    print("PASS: local recovery command + reset page, token reuse rejection and session revocation")

def verify_recovery(browser):
    email = f"recovery-{secrets.token_hex(8)}@local-check.invalid"
    original, replacement = secrets.token_urlsafe(24), secrets.token_urlsafe(24)
    response = requests.post(API + "/api/auth/register", json={"name": "Temporary Recovery Check", "email": email, "password": original}, timeout=10)
    response.raise_for_status()
    session = response.json()
    user_id = int(session["userId"])
    try:
        command = ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(ROOT / "recover-account.ps1"), "-Email", email, "-NoBrowser"]
        result = subprocess.run(command, text=True, capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
        if result.returncode: raise RuntimeError("Local recovery command failed; no reset link was logged")
        match = re.search(r"#token=([A-Za-z0-9_-]{43})", result.stdout)
        assert match, "Local reset link was not generated"
        token = match.group(1)
        context = browser.new_context()
        try:
            page = context.new_page()
            page.goto(SITE + "/reset-password.html#token=" + token)
            page.locator("#newPassword").fill(replacement)
            page.locator("#confirmPassword").fill(replacement)
            page.locator("#resetButton").click()
            page.get_by_text("Password changed. Log in with your new password.", exact=True).wait_for()
            assert "token=" not in page.url
        finally:
            context.close()
        assert requests.get(API + "/api/users/me", headers={"Authorization": "Bearer " + session["token"]}, timeout=10).status_code == 401
        assert requests.post(API + "/api/auth/login", json={"email": email, "password": original}, timeout=10).status_code == 401
        assert requests.post(API + "/api/auth/login", json={"email": email, "password": replacement}, timeout=10).ok
        assert requests.post(API + "/api/auth/reset-password", json={"token": token, "password": replacement}, timeout=10).status_code == 400
    finally:
        env = {**os.environ, "MYSQL_PWD": os.environ["DB_PASSWORD"]}
        cleanup = subprocess.run([os.environ["MYSQL_CLIENT_PATH"], "-h", "127.0.0.1", "-u", "jalachaya", "--ssl-mode=REQUIRED", "-D", "jalachaya"],
            input=f"START TRANSACTION; DELETE FROM password_reset_tokens WHERE user_id = {user_id}; DELETE FROM app_users WHERE id = {user_id}; COMMIT;",
            text=True, capture_output=True, env=env, creationflags=subprocess.CREATE_NO_WINDOW)
        assert cleanup.returncode == 0, "Temporary recovery account cleanup failed"

if __name__ == "__main__": main()
