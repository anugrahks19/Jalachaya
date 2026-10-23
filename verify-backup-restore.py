"""Restore a snapshot into a disposable MySQL instance; never connect to port 3306."""
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import time

ROOT = Path(__file__).resolve().parent

def main():
    manifests = list((ROOT / ".runtime" / "backups").glob("*/COMPLETE.json"))
    manifest_path = max(manifests, key=lambda path: path.stat().st_mtime)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
    if not manifest.get("rowCounts"): raise RuntimeError("Take a new backup with row count metadata first")
    for entry in manifest["files"]:
        file = (manifest_path.parent / entry["path"]).resolve()
        if not file.is_relative_to(manifest_path.parent.resolve()): raise RuntimeError("Unsafe manifest path")
        with file.open("rb") as stream:
            if hashlib.file_digest(stream, "sha256").hexdigest().lower() != entry["sha256"].lower(): raise RuntimeError("Backup checksum failed")
    basedir = next(Path("C:/Program Files/MySQL").glob("*/bin/mysqld.exe")).parents[1]
    server = basedir / "bin/mysqld.exe"
    client = basedir / "bin/mysql.exe"
    runtime = ROOT / ".runtime" / ("restore-verification-" + secrets.token_hex(8))
    runtime.mkdir()
    data = runtime / "data"
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0)); port = sock.getsockname()[1]
    if port == 3306: raise RuntimeError("Refusing live MySQL port")
    flags = subprocess.CREATE_NO_WINDOW
    process = None
    verified = False
    env = {key: value for key, value in os.environ.items() if key not in {"MYSQL_PWD", "DB_PASSWORD"}}
    args = [str(client), "--no-defaults", "--protocol=TCP", "-h", "127.0.0.1", "-P", str(port), "-u", "root", "-N", "-B", "--default-character-set=utf8mb4"]
    def sql(statement):
        result = subprocess.run(args, input=statement, text=True, capture_output=True, env=env, creationflags=flags)
        if result.returncode: raise RuntimeError("Disposable restore SQL failed: " + result.stderr[:500])
        return result.stdout.strip()
    try:
        with (runtime / "initialize.log").open("w") as log:
            result = subprocess.run([str(server), "--no-defaults", "--initialize-insecure", f"--basedir={basedir}", f"--datadir={data}"],
                                    stdout=log, stderr=subprocess.STDOUT, creationflags=flags, timeout=90)
        if result.returncode: raise RuntimeError("Disposable MySQL initialization failed; see " + str(runtime))
        with (runtime / "server.log").open("w") as log:
            process = subprocess.Popen([str(server), "--no-defaults", f"--basedir={basedir}", f"--datadir={data}", f"--port={port}",
                                        "--bind-address=127.0.0.1", "--mysqlx=OFF", "--innodb-buffer-pool-size=64M", "--innodb-redo-log-capacity=32M", "--console"],
                                       stdout=log, stderr=subprocess.STDOUT, creationflags=flags)
        until = time.monotonic() + 60
        while True:
            if process.poll() is not None: raise RuntimeError("Disposable MySQL stopped; see " + str(runtime))
            try:
                if sql("SELECT 1;") == "1": break
            except RuntimeError:
                if time.monotonic() > until: raise
                time.sleep(.5)
        private = secrets.token_urlsafe(24)
        sql(f"ALTER USER 'root'@'localhost' IDENTIFIED BY '{private}';")
        env["MYSQL_PWD"] = private
        sql("CREATE DATABASE jalachaya CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
        with (manifest_path.parent / "database.sql").open("rb") as dump:
            restored = subprocess.run(args + ["-D", "jalachaya"], stdin=dump, capture_output=True, env=env, creationflags=flags, timeout=90)
        if restored.returncode: raise RuntimeError("Backup import failed: " + restored.stderr.decode(errors="replace")[:500])
        for table, expected in manifest["rowCounts"].items():
            if not table.replace('_', '').isalnum(): raise RuntimeError("Unexpected backup table")
            actual = int(sql(f"SELECT COUNT(*) FROM jalachaya.{table};"))
            if actual != expected: raise RuntimeError(f"Restored row count differs for {table}: {actual} versus {expected}")
        version = sql("SELECT version FROM jalachaya.flyway_schema_history WHERE success=TRUE ORDER BY installed_rank DESC LIMIT 1;")
        if version != manifest["schemaVersion"]: raise RuntimeError("Restored schema version differs")
        report = {"status": "PASS", "backupFolder": str(manifest_path.parent), "schemaVersion": version,
                  "tablesRestored": len(manifest["rowCounts"]), "rowCountsMatched": True,
                  "uploadChecksumsMatched": True, "liveDatabaseModified": False}
        (ROOT / ".runtime" / "restore-verification.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        print("PASS: backup restored into a separate disposable MySQL instance; every table row count and upload checksum matched")
        verified = True
    finally:
        if process and process.poll() is None:
            try: sql("SHUTDOWN;")
            except RuntimeError: process.terminate()
            try: process.wait(timeout=20)
            except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=10)
        # This freshly created directory is the only recursive cleanup target.
        if verified:
            resolved = runtime.resolve()
            if not resolved.is_relative_to((ROOT / ".runtime").resolve()) or not resolved.name.startswith("restore-verification-"):
                raise RuntimeError("Unsafe disposable database cleanup target")
            shutil.rmtree(resolved)
        else:
            print("Disposable server logs retained in:", runtime)

if __name__ == "__main__": main()
