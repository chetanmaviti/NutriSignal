import requests
import os
from dotenv import load_dotenv

load_dotenv()
USDA_API_KEY = os.getenv("USDA_API_KEY")

LABEL_MAP = {"ear": "sweet corn", "corn": "sweet corn"}

def get_nutrition_from_usda(food_label: str) -> dict | None:
    if not USDA_API_KEY:
        return None
    
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
    except Exception:
        return None

def get_health_signal(calories: float, sugar: float, fat: float, saturated_fat: float, sodium: float, fiber: float, protein: float, carbohydrates: float) -> dict:
    score = 100
    score -= sugar * 1.6 + fat * 0.2 + saturated_fat * 4.0 + sodium * 0.10 + calories * 0.05 + carbohydrates * 0.15
    score += fiber * 4.2 + protein * 2.0
    score = max(0, min(100, score))
    
    signal = "Green" if score >= 70 else "Yellow" if score >= 40 else "Red"
    return {"signal": signal, "score": score}

def lookup_food(food_label: str) -> dict:
    nutrition = get_nutrition_from_usda(food_label)
    if not nutrition:
        return {"nutrition": None, "signal": None, "score": None, "error": "Food not found"}
    
    health = get_health_signal(
        nutrition.get("calories", 0.0),
        nutrition.get("sugar", 0.0),
        nutrition.get("fat", 0.0),
        nutrition.get("saturated_fat", 0.0),
        nutrition.get("sodium", 0.0),
        nutrition.get("fiber", 0.0),
        nutrition.get("protein", 0.0),
        nutrition.get("carbohydrates", 0.0)
    )
    return {"nutrition": nutrition, "signal": health["signal"], "score": health["score"]}