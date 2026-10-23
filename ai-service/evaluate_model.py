"""Evaluate visible-litter presence on explicitly labelled photos; never infer water quality."""
import argparse
import json
from pathlib import Path
import cv2
from app import detector

ROOT = Path(__file__).resolve().parents[1]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=Path(__file__).with_name("evaluation_samples.json"))
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    results = []
    counts = dict(truePositive=0, trueNegative=0, falsePositive=0, falseNegative=0)
    for entry in manifest["images"]:
        image = cv2.imread(str(ROOT / entry["file"]))
        if image is None: raise RuntimeError(f"Cannot read {entry['file']}")
        detection = detector.detect(image)
        if detection is None: raise RuntimeError("Model is not available; run setup_model.py first")
        expected = entry["visibleLitter"]
        if not isinstance(expected, bool): raise ValueError("visibleLitter labels must be explicit booleans")
        predicted = detection["count"] > 0
        label = ("truePositive" if expected else "falsePositive") if predicted else ("falseNegative" if expected else "trueNegative")
        counts[label] += 1
        results.append({**entry, "predictedLitter": predicted, "outcome": label, **detection})
    total = len(results)
    if not total: raise ValueError("No labelled photos supplied")
    tp, fp, fn = counts["truePositive"], counts["falsePositive"], counts["falseNegative"]
    report = {"modelVersion": detector.MODEL_VERSION, "description": manifest["description"],
              "threshold": 0.15, "photoCount": total, **counts,
              "imagePresenceAccuracy": (tp + counts["trueNegative"]) / total,
              "imagePresencePrecision": tp / (tp + fp) if tp + fp else None,
              "imagePresenceRecall": tp / (tp + fn) if tp + fn else None, "results": results}
    destination = ROOT / "docs" / "AI_SAMPLE_EVALUATION.json"
    destination.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({key: value for key, value in report.items() if key != "results"}, indent=2))
    print(f"Full detections: {destination}")

if __name__ == "__main__": main()
