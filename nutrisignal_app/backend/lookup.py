# lookup.py
import random

def get_mock_nutrition(food_label: str):
    """Temporary placeholder for actual API lookup."""
    samples = {
        "salad": {"calories": 180, "sugar": 6, "fat": 7},
        "pizza": {"calories": 550, "sugar": 8, "fat": 22},
        "donut": {"calories": 680, "sugar": 30, "fat": 25},
    }
    return samples.get(food_label.lower(), {
        "calories": random.randint(200, 700),
        "sugar": random.randint(5, 25),
        "fat": random.randint(5, 25),
    })

def get_health_signal(calories, sugar, fat):
    if calories < 350 and sugar < 10 and fat < 10:
        return "Green"
    elif calories < 600:
        return "Yellow"
    else:
        return "Red"

def lookup_food(food_label: str):
    nutrition = get_mock_nutrition(food_label)
    signal = get_health_signal(**nutrition)
    return {"nutrition": nutrition, "signal": signal}
