from fastapi import FastAPI, UploadFile, File
from dotenv import load_dotenv
from classify import classify_food
from lookup import lookup_food

load_dotenv()
app = FastAPI()

@app.post("/classify")
async def classify_image(file: UploadFile = File(...)):
    image_bytes = await file.read()
    labels = classify_food(image_bytes)
    
    final_result = None
    final_label = labels[0]
    
    for raw_label in labels:
        clean_label = raw_label.replace("_", " ")
        result = lookup_food(clean_label)
        
        if result and result.get("nutrition"):
            final_result = result
            final_label = clean_label
            break
    
    if not final_result:
        final_result = lookup_food(labels[0].replace("_", " "))
    
    return {"label": final_label, **final_result}