from fastapi import FastAPI, UploadFile, File
from dotenv import load_dotenv
from classify import classify_food
from lookup import lookup_food

# Load environment variables from .env file
load_dotenv()

app = FastAPI()

@app.get("/")
def root():
    return {"message": "NutriSignal backend is running 🚀"}
#Frontend: Display Score and click for exact nutrients
#show color instead of "green"

@app.post("/classify")
async def classify_image(file: UploadFile = File(...)):
    # Read image bytes
    image_bytes = await file.read()
    
    # Step 1: Predict label
    label = classify_food(image_bytes)
    #print(f"Label from classify_food: '{label}' (type: {type(label)})")
    print(label)
    #WORK ON LABEL MAPPER
    #label_mapper.py file scaffold with common fruits and fast food items
    # Step 2: Lookup nutrition + signal
    result = lookup_food(label)
    #print(f"Result from lookup_food: {result}")
    
    return {"label": label, **result}

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