# Java ↔ Python AI integration contract

The Java adapter and Python FastAPI service in `ai-service/` implement this contract. A disposable live test has exercised both services through a complaint reaching `VERIFIED`.

Start the Python service, then set `AI_ENABLED=true`, `AI_SERVICE_URL` (default `http://localhost:8000`), and `AI_BACKEND_URL` (the URL the Python service can use to fetch Java `/uploads/...` images) in the Java process. Set the same `AI_BACKEND_URL` in the Python process so it accepts only image URLs from that backend origin. Java sends JSON with a 5-second default timeout. Set `AI_TIMEOUT_MS=15000` when using the CPU litter model; `AI_POLL_MS` tunes the retry poll. Keep the AI service on localhost or a private network.

## Classification

`POST /ai/classify`

```json
{
  "requestId": "CLASSIFY:11",
  "problemId": 11,
  "reportedCategory": "PLASTIC_WASTE",
  "description": "Plastic waste on the bank",
  "imageUrls": ["http://localhost:8080/uploads/problems/example.jpg"]
}
```

Successful response:

```json
{
  "success": true,
  "modelVersion": "taco-yolo11s-6ee8e6f",
  "problemId": 11,
  "result": { "reportedCategory": "PLASTIC_WASTE", "classificationSource": "pretrained_litter_detector", "imageQuality": [{"width": 260, "height": 200, "brightness": 113.2, "sharpness": 125.4}], "detectedItems": [{"label": "Other plastic", "score": 0.71, "box": [12.0, 17.0, 82.0, 91.0]}], "detectedCount": 1, "suggestedCategory": "PLASTIC_WASTE" },
  "confidence": 0.71,
  "warnings": ["Pretrained litter model results are uncalibrated for pond photos; false positives and misses are possible"]
}
```

## Completion evidence

`POST /ai/verify-completion`

```json
{
  "requestId": "VERIFY:73",
  "evidenceId": 73,
  "taskId": 41,
  "taskType": "PLASTIC_REMOVAL",
  "beforeImage": "http://localhost:8080/uploads/problems/before.jpg",
  "afterImage": "http://localhost:8080/uploads/problems/after.jpg"
}
```

Successful response:

```json
{
  "success": true,
  "modelVersion": "taco-yolo11s-6ee8e6f",
  "taskId": 41,
  "taskType": "PLASTIC_REMOVAL",
  "result": { "visibleChangePercent": 18.5, "aligned": false, "alignmentInliers": 0, "lightingShift": 3.4, "verificationSource": "visual_comparison", "decision": "MANUAL_REVIEW_REQUIRED", "litterCountBefore": 1, "litterCountAfter": 0, "estimatedCountReductionPercent": 100.0, "detectedBefore": [{"label": "Other plastic", "score": 0.71, "box": [12.0, 17.0, 82.0, 91.0]}], "detectedAfter": [] },
  "confidence": 0.71,
  "warnings": ["Visible pixel change does not prove waste removal or water quality", "Images could not be aligned reliably; change estimate may reflect camera angle"]
}
```

For a plastic complaint, Java sends `PLASTIC_REMOVAL`; for other categories, it sends the category enum as `taskType`. Java checks `success`, model version, an object result, confidence from 0 to 1, warnings array, and the matching problem ID or task ID and task type. Invalid responses are retried and never change a complaint's category or status. AI output is advisory: an officer still reviews completion, and a citizen still confirms or disputes.

`requestId` is stable across retries. The Python service should reuse a prior result for the same request ID if it has already processed that request; `evidenceId` distinguishes a new completion submission from an earlier one on the same task.

The current Python service has no persistent side effects, so repeat requests are safe. With pinned pretrained weights installed, it detects litter objects; it also checks photo quality, aligns images with ORB feature matching when enough features are present, and estimates changed pixels. The model's test metrics do not validate it on pond photos. A detection or reduced count cannot prove waste removal. Without weights, the service returns `classificationSource: citizen_report` and confidence 0. Do not present the reported category as model output.

## Persistence and outages

Flyway V6 stores one classification job per complaint and one verification job per evidence submission in `ai_jobs`. Those jobs commit with the report or evidence, so a network outage cannot roll back either upload. With `AI_ENABLED=false`, jobs remain pending. When enabled, the scheduler claims due jobs, retries failures with a capped backoff, and reclaims jobs left processing after a crash. The officer complaint response includes `aiClassification`; a task response includes `aiVerification`. Each has `status`, `attempts`, `modelVersion`, `confidence`, `result`, `warnings`, and a generic `lastError`.

The Python service must be reachable from the Java process, and it must be able to fetch the image URLs sent by Java. The Java stub test covers outage and malformed responses. `python ai-service/integration_smoke.py` runs both real services against disposable H2 data and verifies classification, completion comparison, manual review, and community confirmation. MySQL Flyway V6 was checked separately; this smoke test does not write to the user's MySQL database.
