import io
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import classify
from PIL import Image


def _make_image_bytes() -> bytes:
    image = Image.new("RGB", (64, 64), color=(255, 255, 255))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG")
    return buffer.getvalue()


class _FakeResponses:
    def __init__(self, output_text: str):
        self._output_text = output_text

    def create(self, **kwargs):
        return SimpleNamespace(output_text=self._output_text)


class _FakeClient:
    def __init__(self, output_text: str):
        self.responses = _FakeResponses(output_text)


class ClassifyFoodTests(unittest.TestCase):
    def test_classify_food_returns_ranked_labels_and_metadata(self):
        output_text = json.dumps(
            {
                "primary_food": "Ice Cream",
                "confidence": "high",
                "food_type": "single",
                "likely_ingredients": ["milk", "cream", "sugar"],
                "food_category": "dessert",
            }
        )

        with patch.object(classify, "_get_openai_client", return_value=_FakeClient(output_text)):
            result = classify.classify_food(_make_image_bytes())

        self.assertEqual(result["labels"], ["ice cream"])
        self.assertEqual(result["metadata"]["classification_provider"], "OpenAI")
        self.assertEqual(result["metadata"]["classification_model"], classify.DEFAULT_CLASSIFICATION_MODEL)
        self.assertEqual(result["metadata"]["classification_confidence"], "high")
        self.assertEqual(result["metadata"]["classification_primary_food"], "ice cream")
        self.assertEqual(result["metadata"]["classification_food_type"], "single")
        self.assertEqual(result["metadata"]["classification_likely_ingredients"], ["milk", "cream", "sugar"])
        self.assertEqual(result["metadata"]["classification_food_category"], "dessert")
        self.assertIsNone(result["metadata"]["classification_rejection_reason"])

    def test_classify_food_rejects_non_food_images(self):
        output_text = json.dumps(
            {
                "primary_food": "",
                "confidence": "low",
                "food_type": "single",
                "likely_ingredients": [],
                "food_category": "non_food",
            }
        )

        with patch.object(classify, "_get_openai_client", return_value=_FakeClient(output_text)):
            with self.assertRaises(classify.ClassificationError) as exc:
                classify.classify_food(_make_image_bytes())

        self.assertEqual(str(exc.exception), "No food detected in image.")
        self.assertEqual(
            exc.exception.metadata["classification_rejection_reason"],
            "No food detected",
        )

    def test_classify_food_rejects_malformed_structured_output(self):
        output_text = json.dumps({"primary_food": "pizza", "confidence": "high"})

        with patch.object(classify, "_get_openai_client", return_value=_FakeClient(output_text)):
            with self.assertRaises(classify.ClassificationError) as exc:
                classify.classify_food(_make_image_bytes())

        self.assertEqual(str(exc.exception), "OpenAI classifier returned invalid structured output.")
