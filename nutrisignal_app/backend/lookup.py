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
        search_res = requests.get(
            "https://api.nal.usda.gov/fdc/v1/foods/search",
            params={"query": food_label, "pageSize": 1, "api_key": USDA_API_KEY},
            timeout=10
        )
        search_res.raise_for_status()
        foods = search_res.json().get("foods", [])
        
        if not foods or not foods[0].get("fdcId"):
            return None
        
        fdc_id = foods[0]["fdcId"]
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
            elif "sodium" in name and "na" in name: nutrients["sodium"] = value
            elif "fiber, total dietary" in name: nutrients["fiber"] = value
            elif "protein" in name: nutrients["protein"] = value
        
        return nutrients or None
    
    except requests.exceptions.RequestException as e:
        print(f"USDA API error: {e}")
        return None
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        return None

def get_health_signal(calories: float, sugar: float, fat: float, saturated_fat: float, sodium: float, fiber: float, protein: float) -> str:

    ##2. Replace Traffic Light Logic with Scaled Score
    # score = 100
    # score -= sugar * 1.5
    # score -= sodium * 0.2
    # score += fiber * 2.0
    # score += protein * 1.0
    #     signal_score = 0

    #     Color code:
    # 	•	🟢 Green: 70+
    # 	•	🟡 Yellow: 40–69
    # 	•	🔴 Red: <40
    # cap at min 0, max 100

    if calories > 700: signal_score += 2 # High calories
    elif calories > 400: signal_score += 1 # Moderate calories

    if sugar > 20: signal_score += 2 # High sugar
    elif sugar > 10: signal_score += 1 # Moderate sugar
    
    if fat > 20: signal_score += 2 # High fat
    elif fat > 10: signal_score += 1 # Moderate fat

    if saturated_fat > 7: signal_score += 2 # High saturated fat
    elif saturated_fat > 3: signal_score += 1 # Moderate saturated fat

    if sodium > 400: signal_score += 2 # High sodium
    elif sodium > 200: signal_score += 1 # Moderate sodium

    if fiber > 5: signal_score -= 1 # Good fiber

    if protein > 10: signal_score -= 1 # Good protein

    if signal_score >= 4:
        return "Red"
    elif signal_score >= 2:
        return "Yellow"
    else:
        return "Green"

def lookup_food(food_label: str) -> dict:
    nutrition = get_nutrition_from_usda(food_label)
    print(nutrition)
    if not nutrition:
        return {"nutrition": None, "signal": None, "error": "Food not found in USDA database or API error."}
    
    signal = get_health_signal(
        nutrition.get("calories", 0.0),
        nutrition.get("sugar", 0.0),
        nutrition.get("fat", 0.0),
        nutrition.get("saturated_fat", 0.0),
        nutrition.get("sodium", 0.0),
        nutrition.get("fiber", 0.0),
        nutrition.get("protein", 0.0)
    )
    print(signal)
    return {"nutrition": nutrition, "signal": signal}