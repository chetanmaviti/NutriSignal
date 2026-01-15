import requests
import os
from dotenv import load_dotenv

load_dotenv()
USDA_API_KEY = os.getenv("USDA_API_KEY")

# Map vague ImageNet labels to specific USDA food descriptions
# Keys must match the cleaned labels (spaces, no underscores)
LABEL_MAP = {
    "ear": "sweet corn",
    "corn": "sweet corn",
}

def get_nutrition_from_usda(food_label: str) -> dict | None:
    if not USDA_API_KEY:
        print("Error: USDA API Key is not set.")
        return None
    
    # Use mapping if available, otherwise search the label directly
    search_query = LABEL_MAP.get(food_label.lower(), food_label)
    
    try:
        search_res = requests.get(
            "https://api.nal.usda.gov/fdc/v1/foods/search",
            params={
                "query": search_query, 
                "pageSize": 20, 
                "api_key": USDA_API_KEY
            },
            timeout=20
        )
        search_res.raise_for_status()
        foods = search_res.json().get("foods", [])
        
        if not foods:
            return None
            
        best_match = None
        
        for food in foods:
            desc = food.get("description", "").lower()
            dtype = food.get("dataType", "").lower()
            
            # Filter out processed ingredients to ensure we match the "Whole Food"
            # (e.g. Avoid "Potato chips" or "Potato flour" when looking for "Potato")
            if any(x in desc for x in ["dehydrated", "dried", "powder", "juice", "sauce", "chips", "oil", "fat", "syrup", "flour"]):
                continue

            # Priority 1: "Raw" items in the Foundation/Legacy database
            if "raw" in desc and ("foundation" in dtype or "sr legacy" in dtype):
                best_match = food
                break 
            
            # Priority 2: Any Foundation/Legacy item (fallback if "raw" isn't found)
            if not best_match and ("foundation" in dtype or "sr legacy" in dtype):
                best_match = food

        # Priority 3: First result (If no high-quality match exists)
        if not best_match:
            best_match = foods[0]

        fdc_id = best_match["fdcId"]
        print(f"Selected Food: {best_match['description']} (ID: {fdc_id})")

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
            
            if value is None: continue
            
            if "energy" in name and "kcal" in unit_name: nutrients["calories"] = value
            elif "sugars" in name: nutrients["sugar"] = value
            elif "total lipid" in name: nutrients["fat"] = value
            elif "fatty acids, total saturated" in name: nutrients["saturated_fat"] = value
            elif "sodium" in name: nutrients["sodium"] = value
            elif "fiber" in name: nutrients["fiber"] = value
            elif "protein" in name: nutrients["protein"] = value
            elif "carbohydrate, by difference" in name: nutrients["carbohydrates"] = value
        
        return nutrients or None
    
    except Exception as e:
        print(f"USDA API error: {e}")
        return None

def get_health_signal(calories: float, sugar: float, fat: float, saturated_fat: float, sodium: float, fiber: float, protein: float, carbohydrates: float) -> dict:
    score = 100
    
    # Penalties
    score -= sugar * 1.6          # Lower penalty favors fruit
    score -= fat * 0.2
    score -= saturated_fat * 4.0
    score -= sodium * 0.10        # Moderate penalty hits processed food
    score -= calories * 0.05
    score -= carbohydrates * 0.15 # Higher penalty caps starchy veggies (Corn) below 100
    
    # Rewards
    score += fiber * 4.2          # Strong reward for whole grains/veg
    score += protein * 2.0
    
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
        nutrition.get("protein", 0.0),
        nutrition.get("carbohydrates", 0.0) 
    )
    print(health_result)
    return {"nutrition": nutrition, "signal": health_result["signal"], "score": health_result["score"]}