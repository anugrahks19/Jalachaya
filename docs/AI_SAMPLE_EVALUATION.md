# AI sample evaluation — 23 October 2026

The six bundled photographs were visually reviewed for whether litter is visible. The same pinned detector and 0.15 score threshold used by the service were run without training or threshold tuning. This is a reused demonstration sanity check, not a held-out field benchmark. Object bounding boxes have not been independently annotated.

| Photo | Visual label | Detector presence | Outcome |
|---|---|---|---|
| polluted-1.jpg | Litter visible | Litter | Correct |
| polluted-2.jpg | Litter visible | Litter | Correct |
| polluted-3.jpg | Litter visible | Litter | Correct |
| clean-1.jpg | No litter visible | No litter | Correct |
| clean-2.jpg | No litter visible | No litter | Correct |
| clean-3.jpg | No litter visible | Litter | False positive |

There were 3 true positives, 2 true negatives, 1 false positive and 0 false negatives: image-presence accuracy 5/6 (83.3%), precision 3/4 (75%) and recall 3/3 (100%). With only three positive images these numbers must not be used as product accuracy claims. They do not measure the accuracy of individual boxes or classifications.

The detector incorrectly marked the structure near the bank in clean-3.jpg as a carton with score 0.868. A high model score can therefore still be wrong. Neither detections nor their before/after count reduction prove waste removal or water safety. Officer and citizen review remain required.

Exact labels, boxes and scores are in `AI_SAMPLE_EVALUATION.json`. Repeat with `python ai-service/evaluate_model.py`. To evaluate local field photos, supply a JSON manifest with an explicit boolean `visibleLitter` label per image using `--manifest`; keep those photos separate from any future model tuning set.
