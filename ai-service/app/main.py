"""Image evidence assistance for the Jalachaya Java workflow."""

from __future__ import annotations

import os
import re
from io import BytesIO
from urllib.parse import urlparse

import cv2
import httpx
import numpy as np
from fastapi import FastAPI, HTTPException
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, ConfigDict, Field, model_validator
from . import detector

MODEL_VERSION = "visual-prototype-v1"
BACKEND_URL = os.getenv("AI_BACKEND_URL", "http://localhost:8080").rstrip("/")
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_PIXELS = 20_000_000
ALLOWED_CATEGORIES = {
    "PLASTIC_WASTE", "SEWAGE_DISCHARGE", "ALGAE_WEED", "DEAD_FISH",
    "FOUL_SMELL", "BANK_DUMPING", "STAGNANT_WATER", "OTHER",
}

app = FastAPI(title="Jalachaya image evidence service", version="1.0")


class ClassifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    requestId: str = Field(min_length=1, max_length=100)
    problemId: int = Field(gt=0)
    reportedCategory: str = Field(min_length=1)
    description: str = ""
    imageUrls: list[str] = Field(min_length=1, max_length=6)


class VerifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    requestId: str = Field(min_length=1, max_length=100)
    evidenceId: int = Field(gt=0)
    taskId: int = Field(gt=0)
    taskType: str = Field(min_length=1)
    beforeImage: str
    afterImage: str

    @model_validator(mode="after")
    def distinct_images(self):
        if self.beforeImage == self.afterImage:
            raise ValueError("Before and after images must differ")
        return self


def _allowed_image_url(url: str) -> bool:
    source = urlparse(url)
    backend = urlparse(BACKEND_URL)
    return (
        source.scheme in {"http", "https"}
        and (source.scheme, source.netloc) == (backend.scheme, backend.netloc)
        and re.fullmatch(r"/uploads/problems/[a-f0-9-]{36}\.(jpg|png|webp)", source.path)
        and not source.username
        and not source.password
        and not source.query
        and not source.fragment
    )


def _load_image(url: str) -> np.ndarray:
    if not _allowed_image_url(url):
        raise HTTPException(422, "Image URL must point to Java problem uploads")
    try:
        with httpx.Client(timeout=5.0, follow_redirects=False) as client:
            with client.stream("GET", url) as response:
                response.raise_for_status()
                if response.headers.get("content-type", "").split(";")[0].lower() not in {
                    "image/jpeg", "image/png", "image/webp", "application/octet-stream"
                }:
                    raise HTTPException(422, "Image URL did not return an image")
                data = bytearray()
                for chunk in response.iter_bytes():
                    data.extend(chunk)
                    if len(data) > MAX_IMAGE_BYTES:
                        raise HTTPException(422, "Image exceeds 5 MB")
    except httpx.HTTPError as exc:
        raise HTTPException(502, "Could not fetch Java upload") from exc
    try:
        with Image.open(BytesIO(data)) as metadata:
            if metadata.width * metadata.height > MAX_PIXELS:
                raise HTTPException(422, "Invalid or oversized image")
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(422, "Invalid or oversized image") from exc
    image = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(422, "Invalid or oversized image")
    return image


def _image_quality(image: np.ndarray) -> dict:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    brightness = float(gray.mean())
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    return {
        "width": int(image.shape[1]), "height": int(image.shape[0]),
        "brightness": round(brightness, 1), "sharpness": round(sharpness, 1),
    }


def _quality_warnings(quality: dict) -> list[str]:
    warnings = []
    if quality["brightness"] < 35 or quality["brightness"] > 225:
        warnings.append("Image lighting may limit visual review")
    if quality["sharpness"] < 25:
        warnings.append("Image may be blurred")
    return warnings


def _compare(before: np.ndarray, after: np.ndarray) -> dict:
    # ORB feature matching aligns camera shifts when enough stable features exist.
    scale = min(1.0, 768 / max(before.shape[:2]), 768 / max(after.shape[:2]))
    def small(image):
        return cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA) if scale < 1 else image
    first, second = small(before), small(after)
    first_gray = cv2.cvtColor(first, cv2.COLOR_BGR2GRAY)
    second_gray = cv2.cvtColor(second, cv2.COLOR_BGR2GRAY)
    orb = cv2.ORB_create(nfeatures=1200)
    key1, desc1 = orb.detectAndCompute(first_gray, None)
    key2, desc2 = orb.detectAndCompute(second_gray, None)
    aligned = False
    matches_used = 0
    if desc1 is not None and desc2 is not None:
        pairs = cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(desc2, desc1, k=2)
        good = [pair[0] for pair in pairs if len(pair) == 2
                and pair[0].distance < 0.75 * pair[1].distance]
        if len(good) >= 12:
            source = np.float32([key2[m.queryIdx].pt for m in good])
            target = np.float32([key1[m.trainIdx].pt for m in good])
            matrix, mask = cv2.findHomography(source, target, cv2.RANSAC, 4.0)
            if matrix is not None and mask is not None and int(mask.sum()) >= 10:
                second = cv2.warpPerspective(second, matrix, (first.shape[1], first.shape[0]))
                aligned = True
                matches_used = int(mask.sum())
    if not aligned:
        second = cv2.resize(second, (first.shape[1], first.shape[0]))
    first_gray = cv2.cvtColor(first, cv2.COLOR_BGR2GRAY)
    second_gray = cv2.cvtColor(second, cv2.COLOR_BGR2GRAY)
    # Blur suppresses compression noise. This is visible pixel change, not waste removal.
    delta = cv2.absdiff(cv2.GaussianBlur(first_gray, (9, 9), 0),
                        cv2.GaussianBlur(second_gray, (9, 9), 0))
    visible_change = float(np.mean(delta > 30) * 100)
    lighting_shift = float(abs(first_gray.mean() - second_gray.mean()))
    return {
        "visibleChangePercent": round(visible_change, 1),
        "aligned": aligned, "alignmentInliers": matches_used,
        "lightingShift": round(lighting_shift, 1),
    }


@app.get("/health")
def health():
    available = detector.model() is not None
    return {"status": "UP", "modelVersion": detector.MODEL_VERSION if available else MODEL_VERSION,
            "pretrainedLitterModel": available, "advisoryOnly": True}


@app.post("/ai/classify")
def classify(request: ClassifyRequest):
    if request.reportedCategory not in ALLOWED_CATEGORIES:
        raise HTTPException(422, "Unknown category")
    if request.requestId != f"CLASSIFY:{request.problemId}":
        raise HTTPException(422, "Request ID does not match problem")
    images = [_load_image(url) for url in request.imageUrls]
    qualities = [_image_quality(image) for image in images]
    detections = [detector.detect(image) for image in images]
    model_available = all(result is not None for result in detections)
    warnings = (["Pretrained litter model results are uncalibrated for pond photos; false positives and misses are possible"]
                if model_available else
                ["No litter model is installed; category is the citizen's report, not an AI prediction"])
    for quality in qualities:
        warnings.extend(_quality_warnings(quality))
    found = [item for result in detections if result for item in result["items"]]
    plastic_found = any(item["label"] in {"Plastic bag & wrapper", "Other plastic"}
                        and item["score"] >= 0.5 for item in found)
    return {
        "success": True, "modelVersion": detector.MODEL_VERSION if model_available else MODEL_VERSION,
        "problemId": request.problemId,
        "result": {"reportedCategory": request.reportedCategory, "imageQuality": qualities,
                   "classificationSource": "pretrained_litter_detector" if model_available else "citizen_report",
                   "detectedItems": found, "detectedCount": len(found),
                   "suggestedCategory": "PLASTIC_WASTE" if plastic_found else None},
        "confidence": max((item["score"] for item in found), default=0.0),
        "warnings": list(dict.fromkeys(warnings)),
    }


@app.post("/ai/verify-completion")
def verify_completion(request: VerifyRequest):
    if request.requestId != f"VERIFY:{request.evidenceId}":
        raise HTTPException(422, "Request ID does not match evidence")
    before = _load_image(request.beforeImage)
    after = _load_image(request.afterImage)
    comparison = _compare(before, after)
    before_litter, after_litter = detector.detect(before), detector.detect(after)
    model_available = before_litter is not None and after_litter is not None
    before_count = before_litter["count"] if before_litter else None
    after_count = after_litter["count"] if after_litter else None
    count_reduction = (round(100 * (before_count - after_count) / before_count, 1)
                       if before_count else None)
    warnings = ["Visible pixel change does not prove waste removal or water quality"]
    if model_available:
        warnings.append("Detected litter counts are model estimates, not a physical waste measurement")
    else:
        warnings.append("No trained litter model is installed; only visual pixel change is available")
    if not comparison["aligned"]:
        warnings.append("Images could not be aligned reliably; change estimate may reflect camera angle")
    if comparison["lightingShift"] > 25:
        warnings.append("Lighting differs substantially between images")
    warnings.extend(_quality_warnings(_image_quality(before)))
    warnings.extend(_quality_warnings(_image_quality(after)))
    return {
        "success": True, "modelVersion": detector.MODEL_VERSION if model_available else MODEL_VERSION,
        "taskId": request.taskId,
        "taskType": request.taskType,
        "result": {**comparison, "verificationSource": "visual_comparison",
                   "decision": "MANUAL_REVIEW_REQUIRED",
                   "litterCountBefore": before_count, "litterCountAfter": after_count,
                   "estimatedCountReductionPercent": count_reduction,
                   "detectedBefore": before_litter["items"] if before_litter else [],
                   "detectedAfter": after_litter["items"] if after_litter else []},
        "confidence": max(before_litter["maxScore"] if before_litter else 0.0,
                          after_litter["maxScore"] if after_litter else 0.0),
        "warnings": list(dict.fromkeys(warnings)),
    }
