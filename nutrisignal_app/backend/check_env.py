from fastapi import FastAPI
import tensorflow as tf

app = FastAPI()

@app.get("/")
def root():
    return {
        "TensorFlow": tf.__version__,
        "GPU_available": len(tf.config.list_physical_devices('GPU')) > 0
    }
