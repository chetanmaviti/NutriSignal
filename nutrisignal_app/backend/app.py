# app.py
from fastapi import FastAPI, UploadFile, File
from classify import classify_food
from lookup import lookup_food

app = FastAPI()

@app.get("/")
def root():
    return {"message": "NutriSignal backend is running 🚀"}

@app.post("/classify")
async def classify_image(file: UploadFile = File(...)):
    # Read image bytes
    image_bytes = await file.read()
    # Step 1: Predict label
    label = classify_food(image_bytes)
    # Step 2: Lookup nutrition + signal
    result = lookup_food(label)
    return {"label": label, **result}
