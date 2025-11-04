# classify.py
import io
import numpy as np
from PIL import Image
from tensorflow.keras.applications.mobilenet_v2 import (
    MobileNetV2, preprocess_input, decode_predictions
)

# Load once at startup (fast reload)
model = MobileNetV2(weights="imagenet")

def classify_food(image_bytes: bytes) -> str:
    """Takes image bytes, returns top predicted food label"""
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB").resize((224, 224))
    arr = np.expand_dims(np.array(img), axis=0)
    arr = preprocess_input(arr)
    preds = model.predict(arr)
    label = decode_predictions(preds, top=1)[0][0][1]
    return label