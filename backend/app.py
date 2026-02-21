from fastapi import FastAPI, UploadFile, File
from pydantic import BaseModel
from dotenv import load_dotenv
from classify import classify_food
from lookup import lookup_food, get_scoring_health

load_dotenv()
app = FastAPI()


class LabelScoreRequest(BaseModel):
    label: str


@app.get("/health/scoring")
def health_scoring():
    return get_scoring_health()


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

@app.post("/classify")
async def classify_image(file: UploadFile = File(...)):
    image_bytes = await file.read()
    labels = classify_food(image_bytes)

    final_result = None
    final_label = labels[0].replace("_", " ")
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

    return {"label": final_label, **final_result}