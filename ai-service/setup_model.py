"""Install the pinned, pretrained TACO litter detector without training."""

from __future__ import annotations

import hashlib
import sys
from pathlib import Path
from urllib.request import Request, urlopen

from app.detector import DEFAULT_SHA256, DEFAULT_WEIGHTS

SOURCE = "https://huggingface.co/fabiocigaina/TACO-yolo11s/resolve/6ee8e6f/best_model.pt?download=true"


def digest(path: Path) -> str:
    with path.open("rb") as contents:
        return hashlib.file_digest(contents, "sha256").hexdigest()


def main() -> int:
    DEFAULT_WEIGHTS.parent.mkdir(parents=True, exist_ok=True)
    if DEFAULT_WEIGHTS.exists() and digest(DEFAULT_WEIGHTS) == DEFAULT_SHA256:
        print("Pretrained litter model is ready.")
        return 0
    partial = DEFAULT_WEIGHTS.with_suffix(".download")
    try:
        request = Request(SOURCE, headers={"User-Agent": "JalachayaModelSetup/1.0"})
        with urlopen(request, timeout=30) as source, partial.open("wb") as target:
            while block := source.read(1024 * 1024):
                target.write(block)
        if digest(partial) != DEFAULT_SHA256:
            raise RuntimeError("Downloaded model checksum did not match the pinned release")
        partial.replace(DEFAULT_WEIGHTS)
        print("Pretrained litter model downloaded and verified.")
        return 0
    except Exception as exc:
        print(f"Model setup failed: {exc}", file=sys.stderr)
        print("Image quality and visual comparison remain available without the model.", file=sys.stderr)
        return 1
    finally:
        partial.unlink(missing_ok=True)


if __name__ == "__main__":
    raise SystemExit(main())
