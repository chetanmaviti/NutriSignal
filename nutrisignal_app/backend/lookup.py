import requests
import os
from dotenv import load_dotenv

load_dotenv()
USDA_API_KEY = os.getenv("USDA_API_KEY")

def get_nutrition_from_usda(food_label: str) -> dict | None:
    if not USDA_API_KEY:
        print("Error: USDA API Key is not set.")
        return None
    
    try:
        # 1. Fetch more results (20) to find the "Raw" version hidden among processed ones
        search_res = requests.get(
            "https://api.nal.usda.gov/fdc/v1/foods/search",
            params={
                "query": food_label, 
                "pageSize": 20, 
                "api_key": USDA_API_KEY
            },
            timeout=10
        )
        search_res.raise_for_status()
        foods = search_res.json().get("foods", [])
        
        if not foods:
            return None
            
        # 2. PRIORITY LOGIC
        best_match = None
        
        for food in foods:
            desc = food.get("description", "").lower()
            dtype = food.get("dataType", "").lower()
            
            # Skip irrelevant forms that skew stats
            if any(x in desc for x in ["dehydrated", "dried", "powder", "juice", "sauce", "chips"]):
                continue

            # PRIORITY 1: "Raw" in description + Standard Database
            if "raw" in desc and ("foundation" in dtype or "sr legacy" in dtype):
                best_match = food
                break # Found the perfect match, stop looking
            
            # PRIORITY 2: Standard Database (but maybe missing "raw" keyword)
            # Only set this if we haven't found a Priority 1 match yet
            if not best_match and ("foundation" in dtype or "sr legacy" in dtype):
                best_match = food

        # 3. Fallback: If we skipped everything (e.g., search only returned dried fruit),
        # just take the first result as a last resort.
        if not best_match:
            best_match = foods[0]

        fdc_id = best_match["fdcId"]
        print(f"Selected Food: {best_match['description']} (ID: {fdc_id})")

        detail_res = requests.get(
            f"https://api.nal.usda.gov/fdc/v1/food/{fdc_id}",
            params={"api_key": USDA_API_KEY},
            timeout=10
        )
        detail_res.raise_for_status()
        
        nutrients = {}
        for n in detail_res.json().get("foodNutrients", []):
            name = n.get("nutrient", {}).get("name", "").lower()
            value = n.get("amount")
            unit_name = n.get("nutrient", {}).get("unitName", "").lower()
            
            if value is None: continue
            
            if "energy" in name and "kcal" in unit_name: nutrients["calories"] = value
            elif "sugars" in name: nutrients["sugar"] = value
            elif "total lipid" in name: nutrients["fat"] = value
            elif "fatty acids, total saturated" in name: nutrients["saturated_fat"] = value
            elif "sodium" in name: nutrients["sodium"] = value
            elif "fiber" in name: nutrients["fiber"] = value
            elif "protein" in name: nutrients["protein"] = value
        
        return nutrients or None
    
    except Exception as e:
        print(f"USDA API error: {e}")
        return None

def get_health_signal(calories: float, sugar: float, fat: float, saturated_fat: float, sodium: float, fiber: float, protein: float) -> dict:
    # Traffic Light Logic with Scaled Score
    score = 100
    
    # Penalties
    score -= sugar * 2.5
    score -= fat * 0.2
    score -= saturated_fat * 4.0
    score -= sodium * 0.12
    score -= calories * 0.05
    
    # Rewards
    score += fiber * 4.0
    score += protein * 2.0
    
    # Color code:
    # 🟢 Green: 70+
    # 🟡 Yellow: 40–69
    # 🔴 Red: <40
    # cap at min 0, max 100
    score = max(0, min(100, score))
    
    if score >= 70:
        signal = "Green"
    elif score >= 40:
        signal = "Yellow"
    else:
        signal = "Red"
    
    return {"signal": signal, "score": score}

def lookup_food(food_label: str) -> dict:
    nutrition = get_nutrition_from_usda(food_label)
    print(nutrition)
    if not nutrition:
        return {"nutrition": None, "signal": None, "score": None, "error": "Food not found in USDA database or API error."}
    
    health_result = get_health_signal(
        nutrition.get("calories", 0.0),
        nutrition.get("sugar", 0.0),
        nutrition.get("fat", 0.0),
        nutrition.get("saturated_fat", 0.0),
        nutrition.get("sodium", 0.0),
        nutrition.get("fiber", 0.0),
        nutrition.get("protein", 0.0)
    )
    print(health_result)
    return {"nutrition": nutrition, "signal": health_result["signal"], "score": health_result["score"]}