"""Serve only Jalachaya frontend assets, never backend data or launcher secrets."""

import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FOLDERS = {"css", "js", "assets", "citizen", "panchayat", "worker"}
EXTENSIONS = {".html", ".css", ".js", ".jpg", ".jpeg", ".png", ".webp",
              ".svg", ".ico", ".woff", ".woff2", ".ttf"}


class FrontendHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_head(self):
        path = Path(self.translate_path(self.path)).resolve()
        if path == ROOT:
            path = ROOT / "index.html"
        try:
            relative = path.relative_to(ROOT)
        except ValueError:
            self.send_error(404)
            return None
        permitted = (
            path.is_file() and path.suffix.lower() in EXTENSIONS
            and relative.parts[:2] != ("js", "mock")
            and (relative.parts[0] in FOLDERS
                 or (len(relative.parts) == 1 and path.suffix.lower() == ".html"))
        )
        if not permitted:
            self.send_error(404)
            return None
        return super().send_head()

    def list_directory(self, path):
        self.send_error(404)
        return None


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=5500)
    options = parser.parse_args()
    ThreadingHTTPServer(("127.0.0.1", options.port), FrontendHandler).serve_forever()
