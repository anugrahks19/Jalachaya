# Jalachaya image evidence service

This FastAPI service receives image references from the Java backend. It checks photo quality and compares before/after photos using OpenCV ORB alignment and changed pixels. Results are advisory and require officer and citizen review.

It can also run the pretrained [TACO-yolo11s model](https://huggingface.co/fabiocigaina/TACO-yolo11s) locally on CPU without training. Its nine classes are litter objects such as wrappers, bottles, cans and cartons. The model card lists mAP50 0.311 and mAP50-95 0.234 on its test set. These scores do not measure performance on Jalachaya pond photos. The model does not detect sewage, algae, dead fish, smell, or water chemistry, and sample clean photos have produced false positives. The model card lists the weights as MIT, while the Ultralytics runtime has its own licensing; review both before deploying outside the college prototype.

## Run locally

From `ai-service/` in PowerShell:

```powershell
python -m pip install -r requirements.txt
python setup_model.py
$env:AI_BACKEND_URL = 'http://localhost:8080'
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Check `http://localhost:8000/health`. In a second PowerShell window, start Java from `backend/` with `AI_ENABLED=true`, `AI_SERVICE_URL=http://localhost:8000`, and `AI_BACKEND_URL=http://localhost:8080` in addition to your database and JWT variables. Start the static frontend on port 5500. The Java service keeps jobs pending and retries when this service is offline.

Run focused tests from the repository root:

```powershell
python -m pytest ai-service/tests -q
python ai-service/integration_smoke.py
python ai-service/integration_smoke.py --browser
```

The integration command starts both servers on temporary ports with a disposable H2 database. It creates a complaint, fetches its uploaded photos, processes both AI jobs, and completes the full workflow. `--browser` additionally checks the officer complaint screen in headless Chromium using Playwright (`python -m pip install playwright` and install Chromium if needed). Neither command uses your MySQL password or changes your MySQL database. It uses the ignored local Maven copy in `backend/.tools/`; adjust its path in the script if Maven is installed elsewhere.

## What the results mean

With the pinned weights installed, `/ai/classify` returns detected litter labels, boxes and scores alongside photo quality measurements. It suggests `PLASTIC_WASTE` only when a plastic-specific class has score at least 0.5. The reported category is never replaced. `/ai/verify-completion` returns detected object counts before/after, visible pixel change and alignment information. It always says `MANUAL_REVIEW_REQUIRED`. Detection scores are model scores, not calibrated probabilities; count reduction and pixel change do not prove pollution removal, biological safety, or water quality. The officer screen displays these limitations. If the weights cannot be installed, classification falls back to the citizen's report with confidence 0, and visual comparison still runs.

For a reliable local model, collect and label representative pond photos, keep a held-out test set, measure precision/recall and error cases across lighting and camera angles, then consider fine-tuning. No sample photo should be treated as a validated training dataset.

The request and response shapes, retry behavior, and image URL rules are in `docs/AI_INTEGRATION.md`.
