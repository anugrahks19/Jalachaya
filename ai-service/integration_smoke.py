"""Run a disposable Java + Python API workflow on H2, with real image fetches."""

from __future__ import annotations

import os
import re
import secrets
import socket
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import cv2
import numpy as np
import psutil
import requests

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
MAVEN = BACKEND / ".tools" / "apache-maven-3.9.9" / "bin" / "mvn.cmd"
MAVEN_REPO = BACKEND / ".tools" / "maven-repository"
STARTED_AT = time.time()
MYSQL_MODE = "--mysql" in sys.argv
RUN_ID = secrets.token_hex(6)
OFFICER_EMAIL = f"officer-{RUN_ID}@smoke.invalid"
WORKER_EMAIL = f"worker-{RUN_ID}@smoke.invalid"
CITIZEN_EMAIL = f"citizen-{RUN_ID}@smoke.invalid"


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_for(url: str, process: subprocess.Popen, seconds: int = 90) -> None:
    until = time.monotonic() + seconds
    while time.monotonic() < until:
        if process.poll() is not None:
            raise RuntimeError(f"Service exited early with code {process.returncode}")
        try:
            if requests.get(url, timeout=1).ok:
                return
        except requests.RequestException:
            pass
        time.sleep(0.5)
    raise RuntimeError(f"Timed out waiting for {url}")


def wait_for_login(java_url: str, email: str, password: str) -> str:
    until = time.monotonic() + 15
    while time.monotonic() < until:
        response = requests.post(f"{java_url}/api/auth/login",
                                 json={"email": email, "password": password}, timeout=3)
        if response.ok:
            return response.json()["token"]
        time.sleep(0.5)
    raise RuntimeError(f"Bootstrap account {email} was not ready")


def call(method: str, url: str, token: str | None = None, **kwargs) -> dict:
    headers = kwargs.pop("headers", {})
    if token:
        headers["Authorization"] = f"Bearer {token}"
    response = requests.request(method, url, headers=headers, timeout=15, **kwargs)
    if not response.ok:
        raise RuntimeError(f"{method} {url} returned {response.status_code}: {response.text[:400]}")
    return response.json()


def image(offset: int) -> bytes:
    canvas = np.full((200, 260, 3), 110, dtype=np.uint8)
    cv2.rectangle(canvas, (20 + offset, 30), (100 + offset, 130), (245, 245, 245), -1)
    cv2.circle(canvas, (180, 140), 25, (20, 20, 20), -1)
    valid, encoded = cv2.imencode(".png", canvas)
    assert valid
    return encoded.tobytes()


def wait_ai_status(java_url: str, problem_id: int, token: str, key: str, expected: str) -> dict:
    until = time.monotonic() + 30
    while time.monotonic() < until:
        problem = call("GET", f"{java_url}/api/problems/{problem_id}", token)
        item = problem["task"]["aiVerification"] if key == "verification" else problem["aiClassification"]
        if item and item["status"] == expected:
            return item
        time.sleep(0.5)
    raise RuntimeError(f"AI {key} did not reach {expected}; last value: {item}")


def stop(process: subprocess.Popen | None) -> None:
    if process is None or process.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    else:
        process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()


def stop_spawned_java(log_path: Path) -> None:
    if not log_path.exists():
        return
    match = re.search(r"JalachayaApplication.*?PID (\d+)",
                      log_path.read_text(encoding="utf-8", errors="replace"))
    if not match:
        return
    try:
        process = psutil.Process(int(match.group(1)))
        if process.create_time() >= STARTED_AT and process.name().lower().startswith("java"):
            process.kill()
            process.wait(timeout=10)
    except psutil.NoSuchProcess:
        pass


def cleanup_mysql():
    """Remove only this run's uniquely identified records, never existing project data."""
    client = os.environ["MYSQL_CLIENT_PATH"]
    env = {**os.environ, "MYSQL_PWD": os.environ["DB_PASSWORD"]}
    def sql(statement):
        result = subprocess.run([client, "-h", "127.0.0.1", "-u", "jalachaya", "--ssl-mode=REQUIRED",
                                 "-D", "jalachaya", "-N", "-B"], input=statement, text=True,
                                capture_output=True, env=env, creationflags=subprocess.CREATE_NO_WINDOW)
        if result.returncode: raise RuntimeError("MySQL smoke cleanup failed; inspect its uniquely named smoke.invalid records")
        return result.stdout.strip()
    emails = ",".join(f"'{value}'" for value in (OFFICER_EMAIL, WORKER_EMAIL, CITIZEN_EMAIL))
    user_ids = sql(f"SELECT id FROM app_users WHERE email IN ({emails});").split()
    if not user_ids: return
    users = ",".join(str(int(value)) for value in user_ids)
    pond_ids = sql(f"SELECT DISTINCT pond_id FROM problems WHERE reporter_id IN ({users});").split()
    pond_ids += sql(f"SELECT id FROM ponds WHERE name = 'Integration pond {RUN_ID}';").split()
    problems = sql(f"SELECT id FROM problems WHERE reporter_id IN ({users});").split()
    upload_paths = []
    statements = ["START TRANSACTION;"]
    if problems:
        ids = ",".join(str(int(value)) for value in problems)
        tasks = f"SELECT id FROM tasks WHERE problem_id IN ({ids})"
        for query in (f"SELECT path FROM problem_images WHERE problem_id IN ({ids})",
                      f"SELECT before_image_path FROM task_evidence WHERE task_id IN ({tasks})",
                      f"SELECT after_image_path FROM task_evidence WHERE task_id IN ({tasks})"):
            upload_paths.extend(sql(query + ";").split())
        for table in ("user_notifications", "ai_jobs", "community_verifications"):
            statements.append(f"DELETE FROM {table} WHERE problem_id IN ({ids});")
        for table in ("task_escalations", "task_reviews", "task_evidence", "task_notes"):
            statements.append(f"DELETE FROM {table} WHERE task_id IN ({tasks});")
        for table in ("tasks", "problem_history", "problem_images"):
            statements.append(f"DELETE FROM {table} WHERE problem_id IN ({ids});")
        statements.append(f"DELETE FROM problems WHERE id IN ({ids});")
    if pond_ids:
        statements.append("DELETE FROM ponds WHERE id IN (" + ",".join(str(int(value)) for value in set(pond_ids)) + ");")
    statements += [f"DELETE FROM password_reset_tokens WHERE user_id IN ({users});",
                   f"DELETE FROM app_users WHERE id IN ({users});", "COMMIT;"]
    sql("\n".join(statements))
    upload_root = Path(os.environ["MYSQL_SMOKE_UPLOAD_DIR"]).resolve()
    for uploaded in upload_paths:
        if not re.fullmatch(r"/uploads/problems/[a-f0-9-]{36}\.(jpg|png|webp)", uploaded):
            raise RuntimeError("Unexpected smoke upload path; cleanup stopped")
        path = (upload_root / uploaded.removeprefix("/uploads/")).resolve()
        if not path.is_relative_to(upload_root): raise RuntimeError("Smoke cleanup escaped upload directory")
        path.unlink(missing_ok=True)
    print("PASS: removed this MySQL test run's records; existing project records were retained")


def browser_check(frontend_url: str, java_url: str, officer_password: str, problem_id: int) -> None:
    from playwright.sync_api import sync_playwright

    config = (ROOT / "js" / "config.js").read_text(encoding="utf-8")
    config = config.replace("API_BASE_URL: 'http://localhost:8080'", f"API_BASE_URL: '{java_url}'")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            page = browser.new_page()
            page.route("**/js/config.js", lambda route: route.fulfill(
                status=200, content_type="application/javascript", body=config))
            page.goto(f"{frontend_url}/login.html")
            page.locator("#email").fill(OFFICER_EMAIL)
            page.locator("#loginRole").select_option("PANCHAYAT_OFFICER")
            page.locator("#password").fill(officer_password)
            page.locator("#loginButton").click()
            page.wait_for_url("**/panchayat/dashboard.html", timeout=15000)
            page.goto(f"{frontend_url}/panchayat/complaints.html?open={problem_id}")
            page.get_by_text(re.compile("Pretrained model|Photo quality checked")).wait_for(timeout=15000)
            page.get_by_text("Estimated visible pixel change", exact=False).wait_for(timeout=15000)
        finally:
            browser.close()


def main() -> None:
    if not MAVEN.exists():
        raise RuntimeError("Bundled Maven not found; install Maven and update this smoke script")
    if MYSQL_MODE and not all(os.environ.get(key) for key in ("DB_URL", "DB_PASSWORD", "MYSQL_CLIENT_PATH")):
        raise RuntimeError("Run verify-mysql-workflow.cmd so MySQL credentials are supplied privately")
    java_port, ai_port, frontend_port = free_port(), free_port(), free_port()
    java_url, ai_url = f"http://127.0.0.1:{java_port}", f"http://127.0.0.1:{ai_port}"
    frontend_url = f"http://127.0.0.1:{frontend_port}"
    officer_password, worker_password = secrets.token_urlsafe(24), secrets.token_urlsafe(24)
    with tempfile.TemporaryDirectory(prefix="jalachaya-integration-", ignore_cleanup_errors=True) as directory:
        temp = Path(directory)
        java_log, ai_log, frontend_log = temp / "java.log", temp / "ai.log", temp / "frontend.log"
        ai_env = {**os.environ, "AI_BACKEND_URL": java_url}
        java_env = {**os.environ,
                    "JAVA_TOOL_OPTIONS": f"-Duser.home={Path.home()}",
                    "PORT": str(java_port),
                    "DB_URL": "jdbc:h2:mem:live_ai_smoke;MODE=MySQL;DB_CLOSE_DELAY=-1",
                    "DB_USERNAME": "sa", "DB_PASSWORD": "",
                    "UPLOAD_DIR": str(temp / "uploads"),
                    "JWT_SECRET": secrets.token_urlsafe(48),
                    "BOOTSTRAP_OFFICER_EMAIL": OFFICER_EMAIL,
                    "BOOTSTRAP_OFFICER_PASSWORD": officer_password,
                    "BOOTSTRAP_WORKER_EMAIL": WORKER_EMAIL,
                    "BOOTSTRAP_WORKER_PASSWORD": worker_password,
                    "AI_ENABLED": "true", "AI_SERVICE_URL": ai_url,
                    "AI_BACKEND_URL": java_url, "AI_TIMEOUT_MS": "15000", "AI_POLL_MS": "1000",
                    "FRONTEND_ORIGINS": frontend_url, "ENABLE_JUDGE_DEMO": "false"}
        if MYSQL_MODE:
            java_env.update(DB_URL=os.environ["DB_URL"], DB_USERNAME="jalachaya", DB_PASSWORD=os.environ["DB_PASSWORD"],
                            UPLOAD_DIR=os.environ["MYSQL_SMOKE_UPLOAD_DIR"])
        startup_flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        ai = java = frontend = None
        try:
            with ai_log.open("w", encoding="utf-8") as ai_output, java_log.open("w", encoding="utf-8") as java_output, frontend_log.open("w", encoding="utf-8") as frontend_output:
                ai = subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app",
                                       "--host", "127.0.0.1", "--port", str(ai_port)],
                                      cwd=ROOT / "ai-service", env=ai_env,
                                      stdout=ai_output, stderr=subprocess.STDOUT,
                                      creationflags=startup_flags)
                wait_for(f"{ai_url}/health", ai, 30)
                java = subprocess.Popen([str(MAVEN), f"-Dmaven.repo.local={MAVEN_REPO}",
                                         "spring-boot:run"], cwd=BACKEND, env=java_env,
                                        stdout=java_output, stderr=subprocess.STDOUT,
                                        creationflags=startup_flags)
                wait_for(f"{java_url}/api/health", java)
                officer = wait_for_login(java_url, OFFICER_EMAIL, officer_password)
                worker = wait_for_login(java_url, WORKER_EMAIL, worker_password)
                citizen = call("POST", f"{java_url}/api/auth/register", json={
                    "name": "Integration Citizen", "email": CITIZEN_EMAIL,
                    "password": secrets.token_urlsafe(24), "phone": "9876543210", "ward": "Ward 6"})["token"]
                pond = call("POST", f"{java_url}/api/ponds", officer, json={
                    "name": f"Integration pond {RUN_ID}", "ward": "Ward 6", "latitude": 10.5,
                    "longitude": 76.2})
                report = call("POST", f"{java_url}/api/problems", citizen,
                              data={"pondId": pond["id"], "category": "PLASTIC_WASTE",
                                    "description": "Plastic waste by the pond bank"},
                              files={"images": ("report.png", image(0), "image/png")})
                problem_id = report["id"]
                classification = wait_ai_status(java_url, problem_id, officer, "classification", "SUCCEEDED")
                assert classification["result"]["classificationSource"] in {
                    "citizen_report", "pretrained_litter_detector"}
                worker_id = call("GET", f"{java_url}/api/users/me", worker)["id"]
                deadline = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
                assigned = call("POST", f"{java_url}/api/tasks", officer, json={
                    "problemId": problem_id, "assignedWorkerId": worker_id,
                    "priority": "HIGH", "deadline": deadline})
                task_id = assigned["task"]["id"]
                call("PUT", f"{java_url}/api/tasks/{task_id}", worker,
                     json={"status": "IN_PROGRESS"})
                call("POST", f"{java_url}/api/tasks/{task_id}/complete", worker,
                     data={"remarks": "Removed the visible waste"}, files={
                         "beforeImage": ("before.png", image(0), "image/png"),
                         "afterImage": ("after.png", image(35), "image/png")})
                verification = wait_ai_status(java_url, problem_id, officer, "verification", "SUCCEEDED")
                assert verification["result"]["decision"] == "MANUAL_REVIEW_REQUIRED"
                call("POST", f"{java_url}/api/verifications", officer, json={
                    "taskId": task_id, "decision": "FORWARD", "comment": "Reviewed evidence"})
                verified = call("POST", f"{java_url}/api/community-verifications", citizen,
                                data={"taskId": task_id, "decision": "CONFIRM",
                                      "comment": "Site appears clean"},
                                files={"image": ("vote.png", image(35), "image/png")})
                assert verified["status"] == "VERIFIED"
                print("PASS: Java + FastAPI, image fetches, AI jobs, and VERIFIED workflow")
                if "--browser" in sys.argv:
                    frontend = subprocess.Popen([sys.executable, str(ROOT / "serve_frontend.py"), "--port", str(frontend_port)],
                                                stdout=frontend_output, stderr=subprocess.STDOUT,
                                                creationflags=startup_flags)
                    wait_for(f"{frontend_url}/login.html", frontend, 15)
                    browser_check(frontend_url, java_url, officer_password, problem_id)
                    print("PASS: browser officer screen shows live AI results")
        except Exception:
            for label, path in (("Java", java_log), ("AI", ai_log)):
                if path.exists():
                    print(f"{label} log tail:\n" + "\n".join(path.read_text(
                        encoding="utf-8", errors="replace").splitlines()[-18:]), file=sys.stderr)
            raise
        finally:
            stop(frontend)
            stop(java)
            stop_spawned_java(java_log)
            stop(ai)
            if MYSQL_MODE:
                cleanup_mysql()
            time.sleep(1)


if __name__ == "__main__":
    main()
