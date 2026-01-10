from fastapi import FastAPI, UploadFile, File
from dotenv import load_dotenv
from classify import classify_food
from lookup import lookup_food

# Load environment variables from .env file
load_dotenv()

app = FastAPI()
#why given color
#time for classification

@app.get("/")
def root():
    return {"message": "NutriSignal backend is running 🚀"}

@app.post("/classify")
async def classify_image(file: UploadFile = File(...)):
    # Read image bytes
    image_bytes = await file.read()
    
    # Step 1: Get top 3 predicted labels
    labels = classify_food(image_bytes)
    print(f"Top 3 Predictions: {labels}")
    
    final_result = None
    final_label = labels[0] # Default to the first one if everything fails
    
    # Step 2: Iterate to find valid food
    for raw_label in labels:
        # Clean label (MobileNet uses underscores)
        clean_label = raw_label.replace("_", " ")
        print(f"Checking USDA for: {clean_label}...")
        
        # Try to lookup
        result = lookup_food(clean_label)
        
        # Check if we got valid nutrition back
        if result and result.get("nutrition"):
            final_result = result
            final_label = clean_label
            print(f"✅ Match found for: {clean_label}")
            break
        else:
            print(f"❌ No data for: {clean_label}")

    # If the loop finishes without finding anything, fallback to the top prediction's result
    if not final_result:
        final_result = lookup_food(labels[0].replace("_", " "))

    return {"label": final_label, **final_result}

@app.get("/test-api-key")
def test_api_key():
    import os
    api_key = os.getenv("USDA_API_KEY")
    if api_key:
        return {"status": "API key found", "key_length": len(api_key)}
    else:
        return {"status": "API key NOT found", "error": "Check .env file"}

@app.get("/test-lookup/{food}")
def test_lookup(food: str):
    result = lookup_food(food)
    return result

@app.get("/debug-food/{food}")
def debug_food(food: str):
    import os
    import requests
    load_dotenv()

    api_key = os.getenv("USDA_API_KEY")
    
    # Search for food
    search = requests.get(
        "https://api.nal.usda.gov/fdc/v1/foods/search",
        params={"query": food, "pageSize": 1, "api_key": api_key}
    ).json()
    
    if not search.get("foods"):
        return {"error": "Food not found"}
    
    fdc_id = search["foods"][0].get("fdcId")
    
    # Get all details
    detail = requests.get(
        f"https://api.nal.usda.gov/fdc/v1/food/{fdc_id}",
        params={"api_key": api_key}
    ).json()
    
    # Return all nutrients
    all_nutrients = []
    for nutrient in detail.get("foodNutrients", []):
        all_nutrients.append({
            "name": nutrient.get("nutrient", {}).get("name"),
            "value": nutrient.get("amount"),
            "unit": nutrient.get("nutrient", {}).get("unitName")
        })
    
    return {
        "food_name": detail.get("description"),
        "fdc_id": fdc_id,
        "all_nutrients": all_nutrients
    }