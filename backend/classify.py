# classify.py
import io
import numpy as np
from PIL import Image
from tensorflow.keras.applications import MobileNetV3Large
from tensorflow.keras.applications.mobilenet_v3 import preprocess_input
from tensorflow.keras.applications.imagenet_utils import decode_predictions

# Load once at startup
model = MobileNetV3Large(weights="imagenet")

def classify_food(image_bytes: bytes) -> list[str]:  # Updated return type
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB").resize((224, 224))
    arr = np.expand_dims(np.array(img), axis=0)
    arr = preprocess_input(arr)
    preds = model.predict(arr)
    # decode_predictions returns a list of lists. We grab the first (and only) image results.
    # We ask for top=3 to get candidates like ['taco', 'guacamole', 'burrito']
    top_preds = decode_predictions(preds, top=3)[0]
    # Extract just the label strings (e.g. "cheeseburger")
    labels = [p[1] for p in top_preds]
    
    return labels