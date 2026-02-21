import requests
import os
import logging
from difflib import SequenceMatcher
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()
USDA_API_KEY = os.getenv("USDA_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

SCORING_SYSTEM_FOOD_COMPASS = "Food Compass"
SCORING_VERSION_FOOD_COMPASS = "2.0"
SCORING_SYSTEM_USDA = "USDA API"

FOOD_COMPASS_REQUIRED_DOMAINS = [
    "updated_fcs",
    "health_star_rating",
    "nutri_score",
    "nova_classification",
]

logger = logging.getLogger("nutrisignal.lookup")

LABEL_MAP = {"ear": "sweet corn", "corn": "sweet corn"}


def _normalize_food_label(food_label: str) -> str:
    return LABEL_MAP.get(food_label.lower().strip(), food_label.strip()).lower()


def _get_supabase_client() -> Client | None:
    key = SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY
    if not SUPABASE_URL or not key:
        logger.warning("Food Compass lookup disabled: missing SUPABASE_URL or Supabase key.")
        return None

    try:
        return create_client(SUPABASE_URL, key)
    except Exception:
        logger.exception("Failed to initialize Supabase client for Food Compass lookup.")
        return None


def _pick_best_foodcompass_match(rows: list[dict], normalized_label: str) -> dict | None:
    if not rows:
        return None

    def _score(row: dict) -> float:
        description = (row.get("food_description") or "").lower()
        similarity = SequenceMatcher(None, normalized_label, description).ratio()
        starts_with_bonus = 0.08 if description.startswith(normalized_label) else 0.0
        contains_bonus = 0.05 if normalized_label in description else 0.0
        updated_fcs_bonus = 0.06 if row.get("updated_fcs") is not None else 0.0
        return similarity + starts_with_bonus + contains_bonus + updated_fcs_bonus

    return max(rows, key=_score)


def _find_foodcompass_row(food_label: str) -> dict | None:
    client = _get_supabase_client()
    if not client:
        return None

    normalized_label = _normalize_food_label(food_label)
    search_patterns = [
        normalized_label,
        f"{normalized_label}%",
        f"%{normalized_label}%",
    ]

    rows: list[dict] = []
    try:
        for pattern in search_patterns:
            query = (
                client.table("foodcompass")
                .select(
                    "food_code,food_description,updated_fcs,health_star_rating,nutri_score,nova_classification"
                )
                .ilike("food_description", pattern)
                .limit(20)
            )
            response = query.execute()
            data = response.data or []
            if data:
                rows = data
                break
    except Exception:
        logger.exception("Food Compass query failed for label '%s'.", food_label)
        return None

    return _pick_best_foodcompass_match(rows, normalized_label)


def _signal_from_score(score: float) -> str:
    return "Green" if score >= 70 else "Yellow" if score >= 40 else "Red"


def _missing_foodcompass_domains(row: dict | None) -> list[str]:
    if not row:
        return FOOD_COMPASS_REQUIRED_DOMAINS.copy()
    return [domain for domain in FOOD_COMPASS_REQUIRED_DOMAINS if row.get(domain) is None]


def get_scoring_health() -> dict:
    key_present = bool(SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY)
    env_ok = bool(SUPABASE_URL and key_present)

    health = {
        "scoring_system": SCORING_SYSTEM_FOOD_COMPASS,
        "scoring_version": SCORING_VERSION_FOOD_COMPASS,
        "supabase_url_configured": bool(SUPABASE_URL),
        "supabase_key_configured": key_present,
        "foodcompass_table_reachable": False,
        "foodcompass_row_count": None,
        "status": "degraded",
    }

    if not env_ok:
        return health

    client = _get_supabase_client()
    if not client:
        return health

    try:
        response = client.table("foodcompass").select("food_code", count="exact").limit(1).execute()
        health["foodcompass_table_reachable"] = True
        health["foodcompass_row_count"] = response.count
        health["status"] = "ok"
    except Exception:
        logger.exception("Health check failed when querying foodcompass table.")

    return health

def get_nutrition_from_usda(food_label: str) -> dict | None:
    if not USDA_API_KEY:
        return {"error": "USDA_API_KEY is missing. Add it to backend/.env."}
    
    search_query = LABEL_MAP.get(food_label.lower(), food_label)
    
    try:
        search_res = requests.get(
            "https://api.nal.usda.gov/fdc/v1/foods/search",
            params={"query": search_query, "pageSize": 20, "api_key": USDA_API_KEY},
            timeout=20
        )
        search_res.raise_for_status()
        foods = search_res.json().get("foods", [])
        
        if not foods:
            return None
        
        best_match = None
        excluded = ["dehydrated", "dried", "powder", "juice", "sauce", "chips", "oil", "fat", "syrup", "flour"]
        
        for food in foods:
            desc = food.get("description", "").lower()
            dtype = food.get("dataType", "").lower()
            
            if any(x in desc for x in excluded):
                continue
            
            if "raw" in desc and ("foundation" in dtype or "sr legacy" in dtype):
                best_match = food
                break
            
            if not best_match and ("foundation" in dtype or "sr legacy" in dtype):
                best_match = food
        
        if not best_match:
            best_match = foods[0]
        
        fdc_id = best_match["fdcId"]

        detail_res = requests.get(
            f"https://api.nal.usda.gov/fdc/v1/food/{fdc_id}",
            params={"api_key": USDA_API_KEY},
            timeout=20
        )
        detail_res.raise_for_status()
        
        nutrients = {}
        for n in detail_res.json().get("foodNutrients", []):
            name = n.get("nutrient", {}).get("name", "").lower()
            value = n.get("amount")
            unit_name = n.get("nutrient", {}).get("unitName", "").lower()
            
            if value is None:
                continue
            
            if "energy" in name and "kcal" in unit_name:
                nutrients["calories"] = value
            elif "sugars" in name:
                nutrients["sugar"] = value
            elif "total lipid" in name:
                nutrients["fat"] = value
            elif "fatty acids, total saturated" in name:
                nutrients["saturated_fat"] = value
            elif "sodium" in name:
                nutrients["sodium"] = value
            elif "fiber" in name:
                nutrients["fiber"] = value
            elif "protein" in name:
                nutrients["protein"] = value
            elif "carbohydrate, by difference" in name:
                nutrients["carbohydrates"] = value
        
        return nutrients or None
    except requests.HTTPError as err:
        status_code = err.response.status_code if err.response else "unknown"
        return {"error": f"USDA API request failed with status {status_code}."}
    except requests.RequestException:
        return {"error": "Could not reach USDA API."}
    except Exception:
        return {"error": "Unexpected error while fetching USDA nutrition data."}

def get_health_signal(calories: float, sugar: float, fat: float, saturated_fat: float, sodium: float, fiber: float, protein: float, carbohydrates: float) -> dict:
    score = 100
    score -= sugar * 1.6 + fat * 0.2 + saturated_fat * 4.0 + sodium * 0.10 + calories * 0.05 + carbohydrates * 0.15
    score += fiber * 4.2 + protein * 2.0
    score = max(0, min(100, score))
    
    signal = "Green" if score >= 70 else "Yellow" if score >= 40 else "Red"
    return {"signal": signal, "score": score}

def lookup_food(food_label: str) -> dict:
    foodcompass_row = _find_foodcompass_row(food_label)

    if foodcompass_row and foodcompass_row.get("updated_fcs") is not None:
        nutrition = get_nutrition_from_usda(food_label)
        if isinstance(nutrition, dict) and nutrition.get("error"):
            logger.warning(
                "USDA nutrition fetch failed for '%s' while using Food Compass scoring: %s",
                food_label,
                nutrition.get("error"),
            )
            nutrition = None

        score = float(foodcompass_row["updated_fcs"])
        missing_domains = _missing_foodcompass_domains(foodcompass_row)
        if missing_domains:
            logger.warning(
                "Food Compass domains missing for '%s' (food_code=%s): %s",
                food_label,
                foodcompass_row.get("food_code"),
                ", ".join(missing_domains),
            )

        return {
            "nutrition": nutrition,
            "signal": _signal_from_score(score),
            "score": score,
            "scoring_system": SCORING_SYSTEM_FOOD_COMPASS,
            "scoring_version": SCORING_VERSION_FOOD_COMPASS,
            "fallback_used": False,
            "foodcompass_food_code": foodcompass_row.get("food_code"),
            "foodcompass_missing_domains": missing_domains,
            "foodcompass_missing_reason": None,
            "scoring_metadata": {
                "foodcompass_food_description": foodcompass_row.get("food_description"),
                "foodcompass_updated_fcs": foodcompass_row.get("updated_fcs"),
                "foodcompass_health_star_rating": foodcompass_row.get("health_star_rating"),
                "foodcompass_nutri_score": foodcompass_row.get("nutri_score"),
                "foodcompass_nova_classification": foodcompass_row.get("nova_classification"),
            },
        }

    missing_reason = "No Food Compass match found"
    missing_domains = FOOD_COMPASS_REQUIRED_DOMAINS.copy()

    if foodcompass_row and foodcompass_row.get("updated_fcs") is None:
        missing_reason = "Food Compass updated_fcs missing"
        missing_domains = _missing_foodcompass_domains(foodcompass_row)

    logger.warning(
        "Falling back to USDA scoring for '%s'. reason=%s, missing_domains=%s",
        food_label,
        missing_reason,
        ", ".join(missing_domains),
    )

    nutrition = get_nutrition_from_usda(food_label)
    if not nutrition:
        return {
            "nutrition": None,
            "signal": None,
            "score": None,
            "error": "Food not found",
            "scoring_system": SCORING_SYSTEM_USDA,
            "scoring_version": None,
            "fallback_used": True,
            "foodcompass_food_code": foodcompass_row.get("food_code") if foodcompass_row else None,
            "foodcompass_missing_domains": missing_domains,
            "foodcompass_missing_reason": missing_reason,
            "scoring_metadata": {},
        }

    if isinstance(nutrition, dict) and nutrition.get("error"):
        return {
            "nutrition": None,
            "signal": None,
            "score": None,
            "error": nutrition["error"],
            "scoring_system": SCORING_SYSTEM_USDA,
            "scoring_version": None,
            "fallback_used": True,
            "foodcompass_food_code": foodcompass_row.get("food_code") if foodcompass_row else None,
            "foodcompass_missing_domains": missing_domains,
            "foodcompass_missing_reason": missing_reason,
            "scoring_metadata": {},
        }

    health = get_health_signal(
        nutrition.get("calories", 0.0),
        nutrition.get("sugar", 0.0),
        nutrition.get("fat", 0.0),
        nutrition.get("saturated_fat", 0.0),
        nutrition.get("sodium", 0.0),
        nutrition.get("fiber", 0.0),
        nutrition.get("protein", 0.0),
        nutrition.get("carbohydrates", 0.0),
    )

    return {
        "nutrition": nutrition,
        "signal": health["signal"],
        "score": health["score"],
        "scoring_system": SCORING_SYSTEM_USDA,
        "scoring_version": None,
        "fallback_used": True,
        "foodcompass_food_code": foodcompass_row.get("food_code") if foodcompass_row else None,
        "foodcompass_missing_domains": missing_domains,
        "foodcompass_missing_reason": missing_reason,
        "scoring_metadata": {},
    }