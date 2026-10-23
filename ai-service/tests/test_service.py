import sys
from pathlib import Path

import cv2
import numpy as np
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import main


def image(offset=0):
    canvas = np.full((180, 240, 3), 110, dtype=np.uint8)
    cv2.rectangle(canvas, (30 + offset, 40), (100 + offset, 120), (240, 240, 240), -1)
    cv2.circle(canvas, (160, 90), 20, (20, 20, 20), -1)
    return canvas


def test_classify_returns_explicitly_untrained_result(monkeypatch):
    monkeypatch.setattr(main, "_load_image", lambda _: image())
    monkeypatch.setattr(main.detector, "detect", lambda _: None)
    response = TestClient(main.app).post("/ai/classify", json={
        "requestId": "CLASSIFY:11", "problemId": 11,
        "reportedCategory": "PLASTIC_WASTE", "description": "Waste by pond",
        "imageUrls": ["http://localhost:8080/uploads/problems/report.jpg"],
    })
    assert response.status_code == 200
    body = response.json()
    assert body["problemId"] == 11
    assert body["confidence"] == 0
    assert body["result"]["classificationSource"] == "citizen_report"
    assert body["warnings"]


def test_verification_reports_visual_change_without_completion_decision(monkeypatch):
    monkeypatch.setattr(main, "_load_image", lambda url: image(40) if "after" in url else image())
    monkeypatch.setattr(main.detector, "detect", lambda _: None)
    response = TestClient(main.app).post("/ai/verify-completion", json={
        "requestId": "VERIFY:73", "evidenceId": 73, "taskId": 41,
        "taskType": "PLASTIC_REMOVAL",
        "beforeImage": "http://localhost:8080/uploads/problems/before.jpg",
        "afterImage": "http://localhost:8080/uploads/problems/after.jpg",
    })
    assert response.status_code == 200
    body = response.json()
    assert body["taskId"] == 41
    assert body["result"]["visibleChangePercent"] > 0
    assert body["result"]["decision"] == "MANUAL_REVIEW_REQUIRED"


def test_rejects_foreign_image_url():
    response = TestClient(main.app).post("/ai/classify", json={
        "requestId": "CLASSIFY:11", "problemId": 11,
        "reportedCategory": "PLASTIC_WASTE", "description": "Waste by pond",
        "imageUrls": ["http://example.com/private"],
    })
    assert response.status_code == 422


def test_image_urls_are_limited_to_java_upload_files():
    assert not main._allowed_image_url("http://localhost:8080/uploads/problems/../../api/users")
    assert not main._allowed_image_url("http://localhost:8080/api/health")
    assert not main._allowed_image_url("http://example.com/uploads/problems/12345678-1234-1234-1234-123456789abc.jpg")


def test_rejects_mismatched_request_id():
    response = TestClient(main.app).post("/ai/verify-completion", json={
        "requestId": "VERIFY:74", "evidenceId": 73, "taskId": 41,
        "taskType": "PLASTIC_REMOVAL",
        "beforeImage": "http://localhost:8080/uploads/problems/before.jpg",
        "afterImage": "http://localhost:8080/uploads/problems/after.jpg",
    })
    assert response.status_code == 422


def test_model_detections_are_advisory(monkeypatch):
    monkeypatch.setattr(main, "_load_image", lambda _: image())
    monkeypatch.setattr(main.detector, "detect", lambda _: {
        "items": [{"label": "Other plastic", "score": 0.7, "box": [1, 2, 30, 40]}],
        "counts": {"Other plastic": 1}, "count": 1, "maxScore": 0.7,
    })
    response = TestClient(main.app).post("/ai/classify", json={
        "requestId": "CLASSIFY:11", "problemId": 11,
        "reportedCategory": "PLASTIC_WASTE", "description": "Waste by pond",
        "imageUrls": ["http://localhost:8080/uploads/problems/report.jpg"],
    })
    assert response.status_code == 200
    body = response.json()
    assert body["result"]["detectedItems"][0]["label"] == "Other plastic"
    assert body["result"]["suggestedCategory"] == "PLASTIC_WASTE"
    assert body["confidence"] == 0.7
    assert any("uncalibrated" in warning for warning in body["warnings"])
