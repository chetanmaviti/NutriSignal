import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

import app as app_module
from classify import ClassificationError


def _upload(client: TestClient):
    return client.post(
        "/classify",
        files={"file": ("photo.jpg", b"fake-image-bytes", "image/jpeg")},
    )


class ClassifyRouteTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app_module.app)

    def test_health_scoring_includes_classification_fields(self):
        with patch.object(app_module, "get_scoring_health", return_value={"status": "ok"}), patch.object(
            app_module,
            "get_classification_health",
            return_value={
                "classification_provider": "OpenAI",
                "classification_model": "gpt-5-nano",
                "openai_api_key_configured": True,
                "classification_status": "ok",
            },
        ):
            response = self.client.get("/health/scoring")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "status": "ok",
                "classification_provider": "OpenAI",
                "classification_model": "gpt-5-nano",
                "openai_api_key_configured": True,
                "classification_status": "ok",
            },
        )

    def test_classify_prefers_food_compass_result_and_merges_metadata(self):
        classification = {
            "labels": ["pizza"],
            "metadata": {
                "classification_provider": "OpenAI",
                "classification_model": "gpt-5-nano",
                "classification_candidates": ["pizza"],
                "classification_confidence": "medium",
                "classification_rejection_reason": None,
                "classification_primary_food": "pizza",
                "classification_food_type": "single",
                "classification_likely_ingredients": ["cheese", "tomato sauce", "dough"],
                "classification_food_category": "mixed dish",
            },
        }

        def lookup_side_effect(label: str):
            return {
                "nutrition": {"calories": 266.0},
                "signal": "Green",
                "score": 81.0,
                "scoring_system": "Food Compass",
                "scoring_version": "2.0",
                "fallback_used": False,
                "foodcompass_food_code": 12345,
                "foodcompass_missing_domains": [],
                "foodcompass_missing_reason": None,
                "scoring_metadata": {"nutrition_source": "USDA FNDDS 2021-2023"},
            }

        with patch.object(app_module, "classify_food", return_value=classification), patch.object(
            app_module, "lookup_food", side_effect=lookup_side_effect
        ):
            response = _upload(self.client)

        payload = response.json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["label"], "pizza")
        self.assertEqual(payload["scoring_system"], "Food Compass")
        self.assertEqual(payload["foodcompass_food_code"], 12345)
        self.assertEqual(payload["scoring_metadata"]["nutrition_source"], "USDA FNDDS 2021-2023")
        self.assertEqual(payload["scoring_metadata"]["classification_provider"], "OpenAI")
        self.assertEqual(payload["scoring_metadata"]["classification_candidates"], ["pizza"])
        self.assertEqual(payload["scoring_metadata"]["classification_food_type"], "single")

    def test_classify_keeps_first_valid_usda_fallback_when_no_food_compass_hit(self):
        classification = {
            "labels": ["toast", "bread"],
            "metadata": {
                "classification_provider": "OpenAI",
                "classification_model": "gpt-5-nano",
                "classification_candidates": ["toast", "bread"],
                "classification_confidence": "high",
                "classification_rejection_reason": None,
                "classification_primary_food": "toast",
                "classification_food_type": "single",
                "classification_likely_ingredients": ["bread"],
                "classification_food_category": "grain dish",
            },
        }

        with patch.object(app_module, "classify_food", return_value=classification), patch.object(
            app_module,
            "lookup_food",
            side_effect=[
                {
                    "nutrition": {"calories": 120.0},
                    "signal": "Yellow",
                    "score": 52.0,
                    "scoring_system": "USDA API",
                    "scoring_version": None,
                    "fallback_used": True,
                    "foodcompass_food_code": None,
                    "foodcompass_missing_domains": ["updated_fcs"],
                    "foodcompass_missing_reason": "No Food Compass match found",
                    "scoring_metadata": {"nutrition_source": "USDA API"},
                },
                {
                    "nutrition": {"calories": 110.0},
                    "signal": "Yellow",
                    "score": 49.0,
                    "scoring_system": "USDA API",
                    "scoring_version": None,
                    "fallback_used": True,
                    "foodcompass_food_code": None,
                    "foodcompass_missing_domains": ["updated_fcs"],
                    "foodcompass_missing_reason": "No Food Compass match found",
                    "scoring_metadata": {"nutrition_source": "USDA API"},
                },
            ],
        ):
            response = _upload(self.client)

        payload = response.json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["label"], "toast")
        self.assertEqual(payload["score"], 52.0)
        self.assertEqual(payload["scoring_system"], "USDA API")
        self.assertEqual(payload["scoring_metadata"]["classification_provider"], "OpenAI")

    def test_classify_returns_clean_error_payload_for_non_food(self):
        error = ClassificationError(
            "No food detected in image.",
            metadata={
                "classification_provider": "OpenAI",
                "classification_model": "gpt-5-nano",
                "classification_candidates": [],
                "classification_confidence": "high",
                "classification_rejection_reason": "No food detected",
                "classification_primary_food": None,
                "classification_food_type": "single",
                "classification_likely_ingredients": [],
                "classification_food_category": "non_food",
            },
        )

        with patch.object(app_module, "classify_food", side_effect=error):
            response = _upload(self.client)

        payload = response.json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["error"], "No food detected in image.")
        self.assertIsNone(payload["nutrition"])
        self.assertIsNone(payload["signal"])
        self.assertIsNone(payload["score"])
        self.assertEqual(payload["scoring_metadata"]["classification_provider"], "OpenAI")

    def test_classify_returns_missing_key_error_payload(self):
        error = ClassificationError(
            "OPENAI_API_KEY is missing. Add it to backend/.env.",
            metadata={
                "classification_provider": "OpenAI",
                "classification_model": "gpt-5-nano",
                "classification_candidates": [],
                "classification_confidence": None,
                "classification_rejection_reason": "OPENAI_API_KEY missing",
                "classification_primary_food": None,
                "classification_food_type": None,
                "classification_likely_ingredients": [],
                "classification_food_category": None,
            },
        )

        with patch.object(app_module, "classify_food", side_effect=error):
            response = _upload(self.client)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json()["error"],
            "OPENAI_API_KEY is missing. Add it to backend/.env.",
        )
