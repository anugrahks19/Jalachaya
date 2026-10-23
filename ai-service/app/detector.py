"""Optional pretrained litter detector. Results are advisory and uncalibrated."""

from __future__ import annotations

import hashlib
import logging
import os
from collections import Counter
from functools import lru_cache
from pathlib import Path
from threading import Lock

import numpy as np

DEFAULT_WEIGHTS = Path(__file__).resolve().parents[1] / "models" / "taco-yolo11s.pt"
DEFAULT_SHA256 = "1b9c8379aca95efa75ec1f6ac803cabd3ba531b7d4b3f459101bcfd3aaae95ef"
MODEL_VERSION = "taco-yolo11s-6ee8e6f"
_PREDICT_LOCK = Lock()
_LOG = logging.getLogger(__name__)


def weights_path() -> Path | None:
    configured = os.getenv("WASTE_MODEL_PATH")
    path = Path(configured) if configured else DEFAULT_WEIGHTS
    return path if path.is_file() else None


@lru_cache(maxsize=1)
def model():
    path = weights_path()
    if path is None:
        return None
    try:
        if path.resolve() == DEFAULT_WEIGHTS.resolve():
            with path.open("rb") as weights:
                digest = hashlib.file_digest(weights, "sha256").hexdigest()
            if digest != DEFAULT_SHA256:
                raise RuntimeError("Pretrained litter model checksum differs from the pinned release")
        from ultralytics import YOLO
        return YOLO(str(path))
    except (ImportError, OSError, RuntimeError) as exc:
        _LOG.warning("Litter model unavailable; using visual-only fallback: %s", exc)
        return None


def detect(image: np.ndarray) -> dict | None:
    predictor = model()
    if predictor is None:
        return None
    try:
        with _PREDICT_LOCK:
            output = predictor.predict(image, imgsz=640, conf=0.15, max_det=50,
                                       device="cpu", verbose=False)[0]
    except (OSError, RuntimeError, ValueError) as exc:
        _LOG.warning("Litter model prediction failed; using visual-only fallback: %s", exc)
        return None
    items = []
    if output.boxes is not None:
        for category, score, box in zip(output.boxes.cls, output.boxes.conf, output.boxes.xyxy):
            items.append({
                "label": str(predictor.names[int(category)]),
                "score": round(float(score), 3),
                "box": [round(float(value), 1) for value in box],
            })
    counts = dict(Counter(item["label"] for item in items))
    return {"items": items, "counts": counts, "count": len(items),
            "maxScore": max((item["score"] for item in items), default=0.0)}
