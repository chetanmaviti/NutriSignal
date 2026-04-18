import base64
import io
import json
import logging
import os
import re
from typing import Literal

from openai import APIConnectionError, APITimeoutError, OpenAI
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, ValidationError

DEFAULT_CLASSIFICATION_MODEL = "gpt-5-nano"
CLASSIFICATION_PROVIDER = "OpenAI"
MAX_CANDIDATE_COUNT = 3
MAX_LIKELY_INGREDIENTS = 6
MAX_IMAGE_DIMENSION = 1024
JPEG_QUALITY = 85

logger = logging.getLogger("nutrisignal.classify")


CLASSIFICATION_PROMPT = """
You are a food recognition system.

Return JSON only that matches the provided schema.

Given this image, identify the food and return JSON with:
- primary_food
- confidence
- food_type
- likely_ingredients
- food_category

Rules:
- primary_food must be a lowercase, generic, unbranded food or beverage name.
- Do not include restaurant names, package labels, marketing words, or unnecessary adjectives.
- Use labels likely to match nutrition databases like "pizza", "ice cream", "milk", "cola", "fried rice", "salad", "apple".
- food_type must be "single" or "mixed".
- likely_ingredients must be a JSON array of short, lowercase ingredient names.
- food_category must be a short generic category such as "fruit", "dessert", "beverage", "grain dish", "vegetable", "mixed dish", or "protein".
- If the image is blurry but still clearly food, choose the best generic label instead of rejecting it.
- If the image does not clearly contain food or beverage for human consumption, set primary_food to an empty string, confidence to "low", food_type to "single", likely_ingredients to [], and food_category to "non_food".
""".strip()


class ClassificationError(Exception):
    def __init__(self, public_message: str, metadata: dict | None = None):
        super().__init__(public_message)
        self.public_message = public_message
        self.metadata = metadata or {}


class RawClassificationResult(BaseModel):
    primary_food: str
    confidence: Literal["high", "medium", "low"]
    food_type: Literal["single", "mixed"]
    likely_ingredients: list[str]
    food_category: str


def _get_openai_client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ClassificationError(
            "OPENAI_API_KEY is missing. Add it to backend/.env.",
            metadata=_base_metadata([], confidence=None, rejection_reason="OPENAI_API_KEY missing"),
        )

    return OpenAI(api_key=api_key, timeout=20.0, max_retries=1)


def _normalize_label(label: str) -> str:
    normalized = re.sub(r"\s+", " ", label.replace("_", " ").strip().lower())
    return normalized.strip(" ,.;:-")


def _dedupe_candidates(primary_label: str | None) -> list[str]:
    labels: list[str] = []
    for raw_label in [primary_label]:
        if not raw_label:
            continue
        normalized = _normalize_label(raw_label)
        if normalized and normalized not in labels:
            labels.append(normalized)
        if len(labels) >= MAX_CANDIDATE_COUNT:
            break
    return labels


def _base_metadata(
    candidates: list[str],
    confidence: str | None,
    rejection_reason: str | None,
    primary_food: str | None = None,
    food_type: str | None = None,
    likely_ingredients: list[str] | None = None,
    food_category: str | None = None,
) -> dict:
    return {
        "classification_provider": CLASSIFICATION_PROVIDER,
        "classification_model": DEFAULT_CLASSIFICATION_MODEL,
        "classification_candidates": candidates,
        "classification_confidence": confidence,
        "classification_rejection_reason": rejection_reason,
        "classification_primary_food": primary_food,
        "classification_food_type": food_type,
        "classification_likely_ingredients": likely_ingredients or [],
        "classification_food_category": food_category,
    }


def _parse_classification_output(output_text: str) -> tuple[list[str], dict]:
    try:
        payload = json.loads(output_text)
        if hasattr(RawClassificationResult, "model_validate"):
            result = RawClassificationResult.model_validate(payload)
        else:
            result = RawClassificationResult.parse_obj(payload)
    except (json.JSONDecodeError, ValidationError) as exc:
        raise ClassificationError(
            "OpenAI classifier returned invalid structured output.",
            metadata=_base_metadata([], confidence=None, rejection_reason="Invalid classifier output"),
        ) from exc

    primary_food = _normalize_label(result.primary_food)
    likely_ingredients = [
        _normalize_label(label)
        for label in result.likely_ingredients[:MAX_LIKELY_INGREDIENTS]
        if _normalize_label(label)
    ]
    food_category = _normalize_label(result.food_category)
    rejection_reason = None
    if not primary_food:
        rejection_reason = "No food detected"
    elif food_category == "non food" or food_category == "non_food":
        rejection_reason = "No food detected"

    candidates = _dedupe_candidates(primary_food or None)
    metadata = _base_metadata(
        candidates,
        result.confidence,
        rejection_reason,
        primary_food=primary_food or None,
        food_type=result.food_type,
        likely_ingredients=likely_ingredients,
        food_category=food_category or None,
    )

    if rejection_reason is not None:
        raise ClassificationError("No food detected in image.", metadata=metadata)

    if not candidates:
        raise ClassificationError(
            "Could not confidently classify food in image.",
            metadata=_base_metadata(
                [],
                result.confidence,
                "No food labels returned",
                primary_food=primary_food or None,
                food_type=result.food_type,
                likely_ingredients=likely_ingredients,
                food_category=food_category or None,
            ),
        )

    return candidates, metadata


def _encode_image(image_bytes: bytes) -> str:
    try:
        image = Image.open(io.BytesIO(image_bytes))
    except UnidentifiedImageError as exc:
        raise ClassificationError(
            "Could not read uploaded image.",
            metadata=_base_metadata([], confidence=None, rejection_reason="Unreadable image"),
        ) from exc

    image = ImageOps.exif_transpose(image).convert("RGB")
    image.thumbnail((MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION), Image.Resampling.LANCZOS)

    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    encoded = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:image/jpeg;base64,{encoded}"


def get_classification_health() -> dict:
    key_configured = bool(os.getenv("OPENAI_API_KEY"))
    return {
        "classification_provider": CLASSIFICATION_PROVIDER,
        "classification_model": DEFAULT_CLASSIFICATION_MODEL,
        "openai_api_key_configured": key_configured,
        "classification_status": "ok" if key_configured else "degraded",
    }


def classify_food(image_bytes: bytes) -> dict:
    data_url = _encode_image(image_bytes)
    client = _get_openai_client()

    schema = {
        "type": "object",
            "properties": {
                "primary_food": {"type": "string"},
                "confidence": {
                    "type": "string",
                    "enum": ["high", "medium", "low"],
                },
                "food_type": {
                    "type": "string",
                    "enum": ["single", "mixed"],
                },
                "likely_ingredients": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "food_category": {"type": "string"},
            },
            "required": [
                "primary_food",
                "confidence",
                "food_type",
                "likely_ingredients",
                "food_category",
            ],
            "additionalProperties": False,
        }

    try:
        response = client.responses.create(
            model=DEFAULT_CLASSIFICATION_MODEL,
            input=[
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": CLASSIFICATION_PROMPT},
                        {"type": "input_image", "image_url": data_url},
                    ],
                }
            ],
            text={
                "format": {
                    "type": "json_schema",
                    "name": "food_classification",
                    "schema": schema,
                    "strict": True,
                }
            },
        )
    except (APITimeoutError, APIConnectionError) as exc:
        raise ClassificationError(
            "Could not reach OpenAI classification service.",
            metadata=_base_metadata([], confidence=None, rejection_reason="OpenAI service unavailable"),
        ) from exc
    except Exception as exc:
        logger.exception("OpenAI classification request failed.")
        raise ClassificationError(
            "Image classification failed.",
            metadata=_base_metadata([], confidence=None, rejection_reason="OpenAI request failed"),
        ) from exc

    output_text = getattr(response, "output_text", None)
    if not output_text:
        raise ClassificationError(
            "Image classification failed.",
            metadata=_base_metadata([], confidence=None, rejection_reason="OpenAI returned empty output"),
        )

    labels, metadata = _parse_classification_output(output_text)
    return {"labels": labels, "metadata": metadata}
