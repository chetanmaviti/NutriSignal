from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, UploadFile
from pydantic import BaseModel

load_dotenv(Path(__file__).resolve().with_name(".env"))

from classify import ClassificationError, classify_food, get_classification_health
from lookup import get_scoring_health, lookup_food

app = FastAPI()


class LabelScoreRequest(BaseModel):
    label: str


@app.get("/health/scoring")
def health_scoring():
    return {
        **get_scoring_health(),
        **get_classification_health(),
    }


@app.post("/score-label")
def score_label(payload: LabelScoreRequest):
    clean_label = payload.label.strip()
    if not clean_label:
        return {
            "label": clean_label,
            "nutrition": None,
            "signal": None,
            "score": None,
            "error": "Label is required",
            "scoring_system": "USDA API",
            "scoring_version": None,
            "fallback_used": True,
            "foodcompass_food_code": None,
            "foodcompass_missing_domains": None,
            "foodcompass_missing_reason": "Empty label",
            "scoring_metadata": {},
        }

    return {"label": clean_label, **lookup_food(clean_label)}


def _merge_classification_metadata(result: dict, metadata: dict) -> dict:
    merged = dict(result)
    merged["scoring_metadata"] = {
        **(result.get("scoring_metadata") or {}),
        **metadata,
    }
    return merged


def _classification_error_response(message: str, metadata: dict | None = None, label: str = "") -> dict:
    return {
        "label": label,
        "nutrition": None,
        "signal": None,
        "score": None,
        "error": message,
        "scoring_system": "USDA API",
        "scoring_version": None,
        "fallback_used": True,
        "foodcompass_food_code": None,
        "foodcompass_missing_domains": None,
        "foodcompass_missing_reason": message,
        "scoring_metadata": metadata or {},
    }


@app.post("/classify")
async def classify_image(file: UploadFile = File(...)):
    image_bytes = await file.read()

    try:
        classification = classify_food(image_bytes)
    except ClassificationError as err:
        return _classification_error_response(err.public_message, err.metadata)

    labels = classification["labels"]
    classification_metadata = classification["metadata"]

    final_result: dict | None = None
    final_label = labels[0]
    fallback_candidate = None

    for raw_label in labels:
        clean_label = raw_label.replace("_", " ")
        result = lookup_food(clean_label)

        if not result or result.get("score") is None:
            continue

        if result.get("scoring_system") == "Food Compass":
            final_result = result
            final_label = clean_label
            break

        if fallback_candidate is None:
            fallback_candidate = (clean_label, result)

    if not final_result and fallback_candidate:
        final_label, final_result = fallback_candidate

    if not final_result:
        final_result = lookup_food(final_label)

    if not final_result:
        return _classification_error_response(
            "Image classification failed.",
            classification_metadata,
            label=final_label,
        )

    return {
        "label": final_label,
        **_merge_classification_metadata(final_result, classification_metadata),
    }
