# ============================================================
# WeatherOps Backend – v4.0 (FINAL FIXED VERSION)
# Multi-Hazard: Flood + Wind + Heat + Landslide
# ============================================================

import os
import time
import requests
import joblib
from functools import lru_cache
from typing import List, Optional
from datetime import datetime
import threading
import logging
import geopandas as gpd
import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.colors import red, orange, yellow, green, black
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.platypus import Image
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.graphics.shapes import Drawing
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.charts.piecharts import Pie
from reportlab.lib.units import inch
from reportlab.graphics.shapes import Drawing, String
from evaluation_agent import EvaluationAgent
from data_ingestion import (
    get_spatial_weather,
    derive_wind_fields,
    derive_heat_fields,
    derive_landslide_fields,
    derive_rainfall_fields,
    get_hourly_forecast,
)
import matplotlib.pyplot as plt
import io
from reportlab.lib.utils import ImageReader
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.platypus import PageBreak

logger = logging.getLogger(__name__)

# ============================================================
# CONFIG
# ============================================================
LAST_UPDATED = None
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")

DEHRADUN_NAMED_ZONES = [
    "Rispana River Crossing","ISBT & Railway Station Zone","Bindal River Corridor",
    "Paltan Bazaar","Clock Tower Area","Rajpur Road","Mussoorie Road Corridor",
    "Sahastradhara Slide Zones","NH-707 Chakrata Vikasnagar",
    "Jolly Grant Airport Zone","Prem Nagar Low-Lying Zone","Raipur Road Drain Corridor",
]

DEHRADUN_LOCATIONS = [
    ("Dehradun City Centre",               30.3165, 78.0322),
    ("Paltan Bazaar",                      30.3245, 78.0409),
    ("Rajpur Road",                        30.3456, 78.0645),
    ("ISBT Dehradun",                      30.3078, 78.0234),
    ("Prem Nagar",                         30.2892, 78.0156),
    ("Dalanwala",                          30.3312, 78.0534),
    ("Niranjanpur",                        30.2934, 78.0489),
    ("Rispana River — Patel Nagar Bridge", 30.3023, 78.0312),
    ("Bindal River — Ladpur",              30.3612, 78.0756),
    ("Song River — Doiwala",               30.1823, 78.1234),
    ("Dakpathar Barrage",                  30.2434, 77.9423),
    ("Suswa River — Selaqui",              30.3567, 77.8923),
    ("Mussoorie Road — Kimberley",         30.4523, 78.0756),
    ("Sahastradhara",                      30.3934, 78.1123),
    ("Maldevta",                           30.3756, 78.1312),
    ("Chakrata Road — Kalsi",              30.5234, 77.8456),
    ("Vikasnagar",                         30.4612, 77.7645),
    ("Mussoorie — Landour",                30.4756, 78.1023),
    ("Benog Tibba",                        30.4512, 78.0234),
    ("Barlowganj — Kempty Road",           30.4756, 78.0534),
    ("Tyuni — Tons Valley",                30.6712, 77.9234),
    ("FRI Campus",                         30.3423, 77.9934),
    ("Raiwala",                            30.0523, 78.0712),
    ("Haridwar Border — Shyampur",         30.0456, 78.0923),
    ("Rishikesh",                          30.0867, 78.2678),
    ("Doiwala",                            30.1812, 78.1234),
    ("Jolly Grant Airport",                30.1889, 78.1804),
    ("Mussoorie Ridge",                    30.4589, 78.0823),
    ("Chakrata",                           30.6945, 77.8678),
    ("Kaulagarh",                          30.4312, 78.0923),
    ("Tiuni",                              30.7123, 77.8234),
    ("AIIMS Rishikesh",                    30.1234, 78.2156),
    ("Railway Station Dehradun",           30.3189, 78.0345),
    ("Selaqui Industrial Area",            30.3512, 77.8823),
    ("Premnagar Barrage",                  30.2867, 78.0023),
]

def nearest_location_name(lat: float, lon: float) -> str:
    """Return the name of the nearest known Dehradun location."""
    best_name = "Dehradun Zone"
    best_dist = float("inf")
    for name, loc_lat, loc_lon in DEHRADUN_LOCATIONS:
        dist = (lat - loc_lat) ** 2 + (lon - loc_lon) ** 2
        if dist < best_dist:
            best_dist = dist
            best_name = name
    return best_name

def auto_refresh_weather():
    global LAST_UPDATED
    while True:
        get_cached_weather.cache_clear()
        compute_predictions.cache_clear()
        LAST_UPDATED = datetime.now()
        print("Weather cache refreshed")
        time.sleep(3600)  # 1 hour

# ============================================================
# FASTAPI
# ============================================================

app = FastAPI(title="WeatherOps API", version="4.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("FRONTEND_URL", "https://your-frontend.railway.app")],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# MODELS
# ============================================================

@lru_cache(maxsize=1)
def load_flood_model():
    return joblib.load(os.path.join(BASE_DIR, "models", "weatherops_rf_model.pkl"))

@lru_cache(maxsize=1)
def load_wind_model():
    data = joblib.load(os.path.join(BASE_DIR, "models", "wind_hazard_xgboost_model.pkl"))
    if isinstance(data, dict):
        return data.get("model", data)
    return data

@lru_cache(maxsize=1)
def load_heat_model():
    # Return full dict so we can access both 'model' and 'scaler' keys
    return joblib.load(os.path.join(BASE_DIR, "models", "heat_hazard_model.pkl"))

@lru_cache(maxsize=1)
def load_imputer():
    return joblib.load(os.path.join(BASE_DIR, "models", "weatherops_imputer.pkl"))

@lru_cache(maxsize=1)
def load_scaler():
    return joblib.load(os.path.join(BASE_DIR, "models", "weatherops_scaler.pkl"))


# ============================================================
# DATA
# ============================================================

@lru_cache(maxsize=1)
def load_roi():
    return gpd.read_file(os.path.join(DATA_DIR, "Dehradun.gpkg")).to_crs(4326)

@lru_cache(maxsize=1)
def load_features():
    return gpd.read_file(os.path.join(DATA_DIR, "weatherops_features.gpkg")).to_crs(4326)

@lru_cache(maxsize=1)
def load_features_clipped():
    return gpd.clip(load_features(), load_roi())

@lru_cache(maxsize=1)
def load_blocks():
    path = os.path.join(DATA_DIR, "Doon_Blocks.gpkg")
    gdf = gpd.read_file(path)
    return gdf.to_crs(4326)

@lru_cache(maxsize=1)
def get_cached_weather():
    return get_spatial_weather()

# ============================================================
# WEATHER
# ============================================================

#def get_live_weather():
 #   res = requests.get(
  #      "https://api.open-meteo.com/v1/forecast?latitude=30.3165&longitude=78.0322&current=temperature_2m,wind_speed_10m,soil_moisture_0_to_1cm&hourly=precipitation"
   # ).json()

    #return {
     #   "temp_c": res["current"]["temperature_2m"],
      #  "wind_kmh": res["current"]["wind_speed_10m"],
       # "rain_mm": sum(res["hourly"]["precipitation"][:24]),
        #"rainfall_24h": sum(res["hourly"]["precipitation"][:24]),
      #  "rainfall_3h": sum(res["hourly"]["precipitation"][:3]),
       # "soil_moisture": res["current"].get("soil_moisture_0_to_1cm", 0.2),
    #}

def get_live_weather():
    try:
        res = requests.get(
            "https://api.open-meteo.com/v1/forecast"
            "?latitude=30.3165&longitude=78.0322"
            "&current=temperature_2m,wind_speed_10m,soil_moisture_0_to_1cm"
            "&hourly=precipitation"
            "&timezone=Asia%2FKolkata",
            timeout=10
        ).json()

        current = res.get("current", {})
        hourly  = res.get("hourly", {})
        precip  = hourly.get("precipitation", [0] * 24)

        return {
            "temp_c":        current.get("temperature_2m",        25.0),
            "wind_kmh":      current.get("wind_speed_10m",        20.0),
            "rain_mm":       sum(precip[:24]),
            "rainfall_24h":  sum(precip[:24]),
            "rainfall_3h":   sum(precip[:3]),
            "soil_moisture": current.get("soil_moisture_0_to_1cm", 0.2),
        }

    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.warning(f"get_live_weather failed: {e} — using defaults")
        return {
            "temp_c":        28.0,
            "wind_kmh":      25.0,
            "rain_mm":       10.0,
            "rainfall_24h":  10.0,
            "rainfall_3h":   2.0,
            "soil_moisture": 0.3,
        }

def get_weather_for_display():
    """
    Scalar weather summary used by /api/metrics and /api/report.
    If spatial fetch already ran (and is cached), derives scalars from it.
    Otherwise falls back to the original single-point get_live_weather().
    """
    try:
        wx = get_cached_weather()
        return {
            "temp_c":       float(wx["temp_max_C"].mean()),
            "wind_kmh":     float(wx["peak_speed"].mean()),
            "rain_mm":      float(wx["rainfall_24h"].mean()),
            "rainfall_24h": float(wx["rainfall_24h"].mean()),
            "rainfall_3h":  float(wx["rainfall_3h"].mean()),
            "soil_moisture": 0.2,
        }
    except Exception:
        return get_live_weather()

# ============================================================
# PREDICTIONS (FIXED)
# ============================================================

@lru_cache(maxsize=1)
def compute_predictions():
    global LAST_UPDATED

    df = load_features_clipped().sample(500, random_state=42).reset_index(drop=True)

    # ── Try spatial 25-point weather fetch; fall back to single-point scalar
    try:
        wx = get_cached_weather()
        LAST_UPDATED = datetime.now()
        df = derive_rainfall_fields(df, wx)
        df = derive_wind_fields(df, wx)
        df = derive_heat_fields(df, wx)
        df = derive_landslide_fields(df, wx)
        spatial_ok = True
        weather = {
            "rainfall_24h": float(wx["rainfall_24h"].mean()),
            "rainfall_3h":  float(wx["rainfall_3h"].mean()),
            "soil_moisture": 0.2,
        }
    except Exception:
        weather = get_live_weather()
        spatial_ok = False

    imputer = load_imputer()
    scaler = load_scaler()

    flood_model = load_flood_model()
    wind_model = load_wind_model()

    # Load heat model and extract model object (CatBoost doesn't need scaling)
    heat_data = load_heat_model()
    heat_model_obj = heat_data.get("model")

    # Per-cell arrays if spatial succeeded, otherwise uniform scalars
    rain24 = df["rainfall_24h"].values if spatial_ok else np.full(len(df), weather["rainfall_24h"])
    rain3  = df["rainfall_3h"].values  if spatial_ok else np.full(len(df), weather["rainfall_3h"])
    sm     = df["soil_moisture"].values if (spatial_ok and "soil_moisture" in df.columns) else np.full(len(df), weather["soil_moisture"])

    # --- Flood model (8 features) — uses imputer + scaler ---
    X_flood = np.column_stack([
        df["elevation"], df["slope"], df["aspect"], df["twi"],
        rain24, rain3,
        df["flow_accumulation"],
        sm,
    ])
    X_flood = imputer.transform(X_flood)
    X_scaled = scaler.transform(X_flood)
    flood_probs = flood_model.predict_proba(X_scaled)[:, 1]

    # --- Wind model (10 features) — exact order from training ---
    X_wind = np.column_stack([
        df["elevation"],
        df["slope"],
        df["aspect"],
        df["curvature"],
        df["urban_density"],
        df["road_distance"],
        df["facility_distance"],
        df["vegetation_cover"],
        sm,
        rain24,
    ])
    wind_preds = np.clip(wind_model.predict(X_wind), 0, 1)

    # --- Heat model (10 features) — exact order from CatBoost feature_names_ ---
    # ['urban_density', 'curvature', 'drainage_distance', 'road_distance',
    #  'rainfall_24h', 'rainfall_3h', 'aspect', 'river_distance',
    #  'soil_moisture', 'facility_distance']
    # CatBoost is tree-based — no scaling needed
    X_heat = np.column_stack([
        df["urban_density"],
        df["curvature"],
        df["drainage_distance"],
        df["road_distance"],
        rain24, rain3,
        df["aspect"],
        df["river_distance"],
        sm,
        df["facility_distance"],
    ])
    heat_preds = np.clip(heat_model_obj.predict(X_heat), 0, 1)

    p75 = np.percentile(flood_probs, 75)
    p40 = np.percentile(flood_probs, 40)

    preds = []
    centroids = df.geometry.centroid
    for i in range(len(df)):
        prob = float(flood_probs[i])
        slope = float(df["slope"].iloc[i])

        severity = "high" if prob >= p75 else "medium" if prob >= p40 else "low"

        # Use SINMAP susceptibility if spatial fetch succeeded, else original proxy
        if spatial_ok and "landslide_susceptibility" in df.columns:
            ls_risk = float(df["landslide_susceptibility"].iloc[i])
        else:
            ls_risk = float(np.clip((slope/30)*(weather["rainfall_24h"]/40), 0, 1))

        preds.append({
            "lat": float(centroids.iloc[i].y),
            "lon": float(centroids.iloc[i].x),
            "prob": prob,
            "severity": severity,
            "wind_risk": float(wind_preds[i]),
            "heat_risk": float(heat_preds[i]),
            "landslide_risk": ls_risk,
        })

    return preds

def compute_aggregate_risks(horizon: int, rain_thresh: float, temp_thresh: float, wind_thresh: float):
    """
    Compute overall risk scores for the forecast horizon.
    Uses the same logic as the Streamlit HazardsAgent.
    """
    df = get_hourly_forecast(30.3165, 78.0322, horizon)
    if df.empty:
        risk = {"Flood": 0.0, "Heat": 0.0, "Wind": 0.0, "Landslide": 0.0}
        risk_ci = {k: (0.0, 0.0) for k in risk}
        return risk, risk_ci

    slope = 12
    df["rain_adj"] = df["rain_mm"] * (1 + slope / 30)
    df["heat_index"] = df["temp_c"] + 0.33 * df["rh"] / 100 * df["temp_c"] - 4
    df["flood_proxy"] = df["rain_adj"].rolling(6, min_periods=1).sum()

    flood_risk = min(max(df["rain_adj"].max() / rain_thresh, 0), 1)
    heat_risk = min(max((df["heat_index"].max() - temp_thresh) / 10, 0), 1)
    wind_risk = min(max(df["wind_kmph"].max() / wind_thresh, 0), 1)
    landslide_risk = min(max(df["flood_proxy"].max() / 200, 0), 1)

    risk = {
        "Flood": flood_risk,
        "Heat": heat_risk,
        "Wind": wind_risk,
        "Landslide": landslide_risk
    }
    risk_ci = {k: (max(0.0, v - 0.15), min(1.0, v + 0.15)) for k, v in risk.items()}
    return risk, risk_ci

@lru_cache(maxsize=1)
def compute_block_risk():

    blocks = load_blocks()
    preds = compute_predictions()

    points = gpd.GeoDataFrame(
        preds,
        geometry=gpd.points_from_xy(
            [p["lon"] for p in preds],
            [p["lat"] for p in preds]
        ),
        crs="EPSG:4326"
    )

    joined = gpd.sjoin(points, blocks, how="left", predicate="within")

    possible_cols = ["shapeName", "block", "name", "BLOCK", "Block"]

    block_col = None
    for col in possible_cols:
        if col in joined.columns:
            block_col = col
            break

    if block_col is None:
        raise ValueError("Block column not found in Doon_Blocks.gpkg")

    grouped = joined.groupby(block_col).agg({
        "prob": "mean",
        "wind_risk": "mean",
        "heat_risk": "mean",
        "landslide_risk": "mean"
    }).reset_index()

    result = {}

    for _, row in grouped.iterrows():
        result[row[block_col]] = {
            "flood": float(row["prob"]),
            "wind": float(row["wind_risk"]),
            "heat": float(row["heat_risk"]),
            "landslide": float(row["landslide_risk"]),
        }

    return result

# ============================================================
# ENDPOINTS
# ============================================================

@app.get("/api/dehradun_blocks")
def get_dehradun_blocks():
    gdf = load_blocks()
    return gdf.__geo_interface__

@app.get("/api/health")
def health():
    return {"status": "ok"}

@app.get("/api/flood_heatmap")
def heatmap():
    preds = compute_predictions()
    return {"points": preds}

@app.get("/api/block_risk")
def get_block_risk():
    return compute_block_risk()

@app.get("/api/metrics")
def metrics():
    preds   = compute_predictions()
    weather = get_weather_for_display()

    def ci(values):
        mean = float(np.mean(values) * 100)
        std  = max(float(np.std(values) * 100), 5.0)
        return [round(max(0, mean - std), 1), round(min(100, mean + std), 1)]

    flood_vals     = [p["prob"]           for p in preds]
    wind_vals      = [p["wind_risk"]      for p in preds]
    heat_vals      = [p["heat_risk"]      for p in preds]
    landslide_vals = [p["landslide_risk"] for p in preds]

    return {
        "flood_risk":   round(np.mean(flood_vals) * 100, 1),

        "rain_peak":    round(weather["rainfall_24h"], 1),
        "temp_peak":    round(weather["temp_c"], 1),
        "wind_peak":    round(weather["wind_kmh"], 1),

        "high_zones":   sum(1 for p in preds if p["severity"] == "high"),
        "medium_zones": sum(1 for p in preds if p["severity"] == "medium"),
        "low_zones":    sum(1 for p in preds if p["severity"] == "low"),

        "hazard_scores": {
            "flood":     round(np.mean(flood_vals)     * 100, 1),
            "wind":      round(np.mean(wind_vals)      * 100, 1),
            "heat":      round(np.mean(heat_vals)      * 100, 1),
            "landslide": round(np.mean(landslide_vals) * 100, 1),
        },

        "hazard_ci": {
            "flood":     ci(flood_vals),
            "wind":      ci(wind_vals),
            "heat":      ci(heat_vals),
            "landslide": ci(landslide_vals),
        }
    }

@app.get("/api/forecast")
def get_forecast(horizon: int = 72):
    df = get_hourly_forecast(30.3165, 78.0322, horizon)
    slope = 12
    df["rain_adj"] = df["rain_mm"] * (1 + slope / 30)
    df["heat_index"] = df["temp_c"] + 0.33 * df["rh"] / 100 * df["temp_c"] - 4
    df["flood_proxy"] = df["rain_adj"].rolling(6, min_periods=1).sum()
    result = df[["time", "rain_mm", "rain_adj", "temp_c", "wind_kmph",
                 "heat_index", "flood_proxy", "app_temp"]].copy()
    result["time"] = result["time"].dt.strftime("%Y-%m-%d %H:%M:%S")
    return result.to_dict(orient="records")

@app.get("/api/risk_evolution")
def risk_evolution(horizon: int = 72):
    try:
        df = get_hourly_forecast(30.3165, 78.0322, horizon)
        if df.empty:
            return []
        slope = 12
        df["rain_adj"] = df["rain_mm"] * (1 + slope / 30)
        df["heat_index"] = df["temp_c"] + 0.33 * df["rh"] / 100 * df["temp_c"] - 4
        df["flood_proxy"] = df["rain_adj"].rolling(6, min_periods=1).sum()

        rain_thresh = 80
        temp_thresh = 35
        wind_thresh = 40
        flood_thresh = 200

        risks = []
        for _, row in df.iterrows():
            flood_risk = min(max(row["rain_adj"] / rain_thresh, 0), 1)
            heat_risk = min(max((row["heat_index"] - temp_thresh) / 10, 0), 1)
            wind_risk = min(max(row["wind_kmph"] / wind_thresh, 0), 1)
            landslide_risk = min(max(row["flood_proxy"] / flood_thresh, 0), 1)
            risks.append({
                "time": row["time"].strftime("%Y-%m-%d %H:%M:%S"),
                "flood": flood_risk,
                "heat": heat_risk,
                "wind": wind_risk,
                "landslide": landslide_risk,
            })
        return risks
    except Exception as e:
        print(f"Error in risk_evolution: {e}")
        return []   # Return empty array on failure

@app.get("/api/agent_trace")
def agent_trace():
    steps = [
        {"idx": "01", "agent": "IngestionAgent", "message": "Forecast fetched · Open-Meteo API", "status": "ok"},
        {"idx": "02", "agent": "ModelingAgent", "message": "Terrain blend · slope=12° · heat_index · flood_proxy", "status": "ok"},
        {"idx": "03", "agent": "HazardsAgent", "message": "Risk scores · action thresholds crossed", "status": "ok"},
        {"idx": "04", "agent": "DecisionAgent", "message": "Action cards · sorted by severity", "status": "ok"},
        {"idx": "05", "agent": "EvaluationAgent", "message": "Not run (open Evaluation tab to train)", "status": "warn"},
    ]
    return {"steps": steps}

from evaluation_agent import EvaluationAgent

@app.post("/api/run_evaluation")
def run_evaluation():
    agent = EvaluationAgent()
    results = agent.run()
    # Convert the dict to a list of results (skip any that have errors)
    results_list = [v for v in results.values() if "error" not in v]
    return {"results": results_list}

@app.get("/")
def root():
    return {"status": "Running Multi-Hazard Backend"}

@app.get("/api/refresh_weather")
def refresh_weather():
    get_cached_weather.cache_clear()
    compute_predictions.cache_clear()
    return {"status": "Weather cache cleared"}

@app.on_event("startup")
def start_background_tasks():
    threading.Thread(target=auto_refresh_weather, daemon=True).start()

@app.get("/api/last_updated")
def get_last_updated():
    if LAST_UPDATED:
        return {"last_updated": LAST_UPDATED.strftime("%Y-%m-%d %H:%M:%S")}
    else:
        return {"last_updated": "Not available"}

@app.get("/api/report")
def download_report():
    import io
    import os
    import numpy as np
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from datetime import datetime
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak
    from reportlab.lib.pagesizes import letter
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.lib.enums import TA_CENTER
    import traceback

    try:
        # --- Fetch data ---
        weather = get_weather_for_display()
        predictions = compute_predictions()
        blocks = compute_block_risk()
        horizon = 72

        # Risk evolution data
        risk_evol = []
        try:
            df = get_hourly_forecast(30.3165, 78.0322, horizon)
            if not df.empty:
                slope = 12
                df["rain_adj"] = df["rain_mm"] * (1 + slope / 30)
                df["heat_index"] = df["temp_c"] + 0.33 * df["rh"] / 100 * df["temp_c"] - 4
                df["flood_proxy"] = df["rain_adj"].rolling(6, min_periods=1).sum()
                rain_thresh = 80
                temp_thresh = 35
                wind_thresh = 40
                flood_thresh = 200
                for _, row in df.iterrows():
                    risk_evol.append({
                        "time": row["time"],
                        "flood": min(max(row["rain_adj"] / rain_thresh, 0), 1),
                        "heat": min(max((row["heat_index"] - temp_thresh) / 10, 0), 1),
                        "wind": min(max(row["wind_kmph"] / wind_thresh, 0), 1),
                        "landslide": min(max(row["flood_proxy"] / flood_thresh, 0), 1),
                    })
        except Exception as e:
            print(f"Risk evolution error: {e}")

        # Aggregate risks
        risk, risk_ci = compute_aggregate_risks(horizon, 80, 35, 40)

        # Actions
        actions = []
        for i, p in enumerate(predictions[:20]):
            location_name = nearest_location_name(p["lat"], p["lon"])
            risks = {"FLOOD": p["prob"], "WIND": p["wind_risk"], "HEAT": p["heat_risk"], "LANDSLIDE": p["landslide_risk"]}
            hazard = max(risks, key=risks.get)
            risk_value = risks[hazard]
            if risk_value > 0.7:
                severity = "HIGH"
                when = "Immediate action required"
            elif risk_value > 0.4:
                severity = "MEDIUM"
                when = "Within 6 hours"
            else:
                severity = "LOW"
                when = "Monitor"
            if hazard == "FLOOD":
                title = "Deploy flood barriers"
            elif hazard == "WIND":
                title = "Secure loose infrastructure"
            elif hazard == "HEAT":
                title = "Issue heatwave alert"
            else:
                title = "Monitor landslide-prone slopes"
            actions.append({
                "title": title,
                "location": location_name,
                "when": when,
                "hazard": hazard,
                "severity": severity,
                "confidence": (max(0, risk_value - 0.1), min(1, risk_value + 0.1))
            })
        # Sort by severity and confidence
        severity_order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
        actions.sort(key=lambda a: (severity_order[a["severity"]], -a["confidence"][1]))
        actions = actions[:5]

        # Hazard scores for pie chart
        hazard_scores = {
            "Flood": np.mean([p["prob"] for p in predictions]),
            "Heat": np.mean([p["heat_risk"] for p in predictions]),
            "Wind": np.mean([p["wind_risk"] for p in predictions]),
            "Landslide": np.mean([p["landslide_risk"] for p in predictions]),
        }

        # Block data for bar chart
        block_list = []
        for name, vals in blocks.items():
            avg = (vals["flood"] + vals["wind"] + vals["heat"] + vals["landslide"]) / 4
            block_list.append((name, avg, vals))
        block_list.sort(key=lambda x: x[1], reverse=True)
        top_blocks = block_list[:8]

        # --- Generate charts as PNG images using matplotlib ---
        chart_images = []

        # 1. Risk Evolution Line Chart
        if len(risk_evol) > 1:
            try:
                plt.figure(figsize=(8, 4))
                times = [d["time"] for d in risk_evol[::6]]  # sample every 6 hours
                x = range(len(times))
                plt.plot(x, [d["flood"] for d in risk_evol[::6]], label="Flood", color="#2dd4bf", linewidth=2)
                plt.plot(x, [d["heat"] for d in risk_evol[::6]], label="Heat", color="#f97316", linewidth=2)
                plt.plot(x, [d["wind"] for d in risk_evol[::6]], label="Wind", color="#fbbf24", linewidth=2)
                plt.plot(x, [d["landslide"] for d in risk_evol[::6]], label="Landslide", color="#c084fc", linewidth=2)
                plt.xticks(x, [t.strftime("%m/%d %H:00") for t in times], rotation=45, ha="right", fontsize=8)
                plt.yticks([0, 0.25, 0.5, 0.75, 1], ["LOW", "MOD", "HIGH", "CRIT", ""])
                plt.ylim(0, 1)
                plt.xlabel("Time")
                plt.ylabel("Risk Level")
                plt.title("Risk Evolution – 72-Hour Forecast")
                plt.legend(loc="upper left")
                plt.grid(True, linestyle="--", alpha=0.7)
                plt.tight_layout()
                buf = io.BytesIO()
                plt.savefig(buf, format="png", dpi=100)
                buf.seek(0)
                chart_images.append(("Risk Evolution", Image(buf, width=6*inch, height=3*inch)))
                plt.close()
            except Exception as e:
                print(f"Risk evolution chart error: {e}")

        # 2. Block-level Bar Chart
        if top_blocks:
            try:
                plt.figure(figsize=(10, 5))
                block_names = [b[0] for b in top_blocks]
                flood_vals = [b[2]["flood"]*100 for b in top_blocks]
                wind_vals = [b[2]["wind"]*100 for b in top_blocks]
                heat_vals = [b[2]["heat"]*100 for b in top_blocks]
                land_vals = [b[2]["landslide"]*100 for b in top_blocks]
                x = np.arange(len(block_names))
                width = 0.2
                plt.bar(x - 1.5*width, flood_vals, width, label="Flood", color="#2dd4bf")
                plt.bar(x - 0.5*width, wind_vals, width, label="Wind", color="#fbbf24")
                plt.bar(x + 0.5*width, heat_vals, width, label="Heat", color="#f97316")
                plt.bar(x + 1.5*width, land_vals, width, label="Landslide", color="#c084fc")
                plt.xticks(x, block_names, rotation=45, ha="right", fontsize=8)
                plt.ylabel("Risk (%)")
                plt.title("Block-Level Risk Breakdown")
                plt.legend()
                plt.tight_layout()
                buf = io.BytesIO()
                plt.savefig(buf, format="png", dpi=100)
                buf.seek(0)
                chart_images.append(("Block-Level Risk", Image(buf, width=7*inch, height=3.5*inch)))
                plt.close()
            except Exception as e:
                print(f"Bar chart error: {e}")

        # 3. Pie Chart
        if any(hazard_scores.values()):
            try:
                plt.figure(figsize=(4, 4))
                labels = list(hazard_scores.keys())
                sizes = [v*100 for v in hazard_scores.values()]
                colors_pie = ["#2dd4bf", "#f97316", "#fbbf24", "#c084fc"]
                plt.pie(sizes, labels=labels, autopct="%1.1f%%", startangle=90, colors=colors_pie)
                plt.title("Hazard Risk Distribution")
                buf = io.BytesIO()
                plt.savefig(buf, format="png", dpi=100)
                buf.seek(0)
                chart_images.append(("Hazard Distribution", Image(buf, width=3*inch, height=3*inch)))
                plt.close()
            except Exception as e:
                print(f"Pie chart error: {e}")

        # --- PDF Document Setup ---
        pdf_path = os.path.join(BASE_DIR, "WeatherOps_Report.pdf")
        doc = SimpleDocTemplate(pdf_path, pagesize=letter,
                                rightMargin=72, leftMargin=72, topMargin=72, bottomMargin=72)
        styles = getSampleStyleSheet()

        # Custom styles
        title_style = ParagraphStyle('CustomTitle', parent=styles['Title'], fontSize=24,
                                      textColor=colors.HexColor('#f0a500'), alignment=TA_CENTER, spaceAfter=30)
        heading_style = ParagraphStyle('CustomHeading', parent=styles['Heading2'], fontSize=16,
                                       textColor=colors.HexColor('#2dd4bf'), spaceAfter=12, spaceBefore=12)
        normal_style = styles['Normal']
        normal_style.fontName = 'Helvetica'
        normal_style.fontSize = 10

        elements = []

        # Cover Page
        elements.append(Spacer(1, 2*inch))
        elements.append(Paragraph("WeatherOps - Agentic GeoAI Weather Web App for ROI-Specific Impact Decisions ", title_style))
        elements.append(Paragraph("Operational Weather Report", heading_style))
        elements.append(Spacer(1, 0.5*inch))
        elements.append(Paragraph(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}", normal_style))
        elements.append(Spacer(1, 0.2*inch))
        elements.append(Paragraph(f"Valid: Next {horizon} hours", normal_style))
        elements.append(Spacer(1, 2*inch))
        elements.append(PageBreak())

        # Executive Summary (metrics)
        elements.append(Paragraph("Executive Summary", heading_style))
        metrics_data = [
            ["Rain Peak", f"{weather['rainfall_24h']:.1f} mm/hr"],
            ["Temperature Peak", f"{weather['temp_c']:.1f} °C"],
            ["Wind Peak", f"{weather['wind_kmh']:.1f} km/h"],
            ["Flood Risk", f"{risk['Flood']*100:.1f}%"],
            ["High Risk Zones", str(sum(1 for p in predictions if p["severity"] == "high"))],
            ["Medium Risk Zones", str(sum(1 for p in predictions if p["severity"] == "medium"))],
            ["Low Risk Zones", str(sum(1 for p in predictions if p["severity"] == "low"))],
        ]
        metrics_table = Table(metrics_data, colWidths=[2.5*inch, 1.5*inch])
        metrics_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#2a2f3d')),
            ('TEXTCOLOR', (0,0), (-1,0), colors.white),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#3a4155')),
        ]))
        elements.append(metrics_table)
        elements.append(Spacer(1, 0.3*inch))

        # Current Weather
        elements.append(Paragraph("Current Weather Conditions", heading_style))
        weather_data = [
            ["Temperature", f"{weather['temp_c']:.1f} °C"],
            ["Wind Speed", f"{weather['wind_kmh']:.1f} km/h"],
            ["Rainfall (24h)", f"{weather['rainfall_24h']:.1f} mm"],
        ]
        weather_table = Table(weather_data, colWidths=[2.5*inch, 1.5*inch])
        weather_table.setStyle(TableStyle([('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#3a4155'))]))
        elements.append(weather_table)
        elements.append(Spacer(1, 0.3*inch))

        # Embed charts
        for title, img in chart_images:
            elements.append(Paragraph(title, heading_style))
            elements.append(img)
            elements.append(Spacer(1, 0.3*inch))

        # Priority Actions (FIXED)
        if actions:
            elements.append(Paragraph("Priority Actions", heading_style))
            action_data = [["Action", "Location", "Severity", "When", "Confidence"]]
            for a in actions:
                conf_str = f"{a['confidence'][0]*100:.0f}–{a['confidence'][1]*100:.0f}%"
                # Optionally shorten very long location names
                location = a['location']
                if len(location) > 30:
                    location = location[:27] + "..."
                action_data.append([a['title'], location, a['severity'], a['when'], conf_str])

            # Wider columns to accommodate content, with word wrap
            col_widths = [2.0*inch, 1.8*inch, 0.7*inch, 1.3*inch, 0.8*inch]
            action_table = Table(action_data, colWidths=col_widths, repeatRows=1, hAlign='CENTER')
            action_table.setStyle(TableStyle([
                ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#2a2f3d')),
                ('TEXTCOLOR', (0,0), (-1,0), colors.white),
                ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#3a4155')),
                ('FONTSIZE', (0,0), (-1,-1), 8),          # Smaller font
                ('VALIGN', (0,0), (-1,-1), 'TOP'),        # Top align
                ('WORDWRAP', (0,0), (-1,-1), 'CJK'),      # Enable word wrap
            ]))
            # Color code severity
            for i, row in enumerate(action_data[1:], start=1):
                severity = row[2]
                if severity == "HIGH":
                    color = colors.HexColor('#e84040')
                elif severity == "MEDIUM":
                    color = colors.HexColor('#f06830')
                else:
                    color = colors.HexColor('#f0a500')
                action_table.setStyle(TableStyle([('TEXTCOLOR', (2,i), (2,i), color)]))
            elements.append(action_table)
            elements.append(Spacer(1, 0.3*inch))

        # Methodology
        elements.append(Paragraph("Methodology & Data Sources", heading_style))
        elements.append(Paragraph("This report uses a multi-hazard risk assessment framework integrating:", normal_style))
        elements.append(Paragraph("• Open-Meteo forecast data (72-hour horizon) blended with high-resolution terrain data.", normal_style))
        elements.append(Paragraph("• Machine learning models (Random Forest, XGBoost, CatBoost) trained on historical hazard events.", normal_style))
        elements.append(Paragraph("• Spatial features: elevation, slope, flow accumulation, urban density, infrastructure proximity.", normal_style))
        elements.append(Spacer(1, 0.2*inch))

        # Build PDF
        doc.build(elements)
        return FileResponse(pdf_path, media_type="application/pdf", filename="WeatherOps_Report.pdf")

    except Exception as e:
        print(f"Report generation failed: {e}")
        traceback.print_exc()
        return {"error": str(e)}

@app.get("/api/roi_boundary")
def get_roi_boundary():
    return load_roi().__geo_interface__

@app.get("/api/decisions")
def get_decisions(
    forecast_hours: int = 72,
    rain_thresh: float = 80,
    temp_thresh: float = 35,
    wind_thresh: float = 40
):
    predictions = compute_predictions()

    actions = []
    for i, p in enumerate(predictions):
        # Use nearest known location name
        location_name = nearest_location_name(p["lat"], p["lon"])

        risks = {
            "FLOOD":     p["prob"],
            "WIND":      p["wind_risk"],
            "HEAT":      p["heat_risk"],
            "LANDSLIDE": p["landslide_risk"],
        }

        hazard     = max(risks, key=risks.get)
        risk_value = risks[hazard]

        if risk_value > 0.7:
            severity = "high"
            when     = "Immediate action required"
        elif risk_value > 0.4:
            severity = "medium"
            when     = "Within 6 hours"
        else:
            severity = "low"
            when     = "Monitor"

        if hazard == "FLOOD":
            title = "Deploy flood barriers"
        elif hazard == "WIND":
            title = "Secure loose infrastructure"
        elif hazard == "HEAT":
            title = "Issue heatwave alert"
        else:
            title = "Monitor landslide-prone slopes"

        actions.append({
            "id":    f"auto-{i}",
            "title": title,
            "where": location_name,
            "when":  when,
            "hazard": hazard,
            "confidence": [
                round(max(0, risk_value - 0.1), 2),
                round(min(1, risk_value + 0.1), 2),
            ],
            "locations": [{
                "id":            f"loc-{i}",
                "lat":           p["lat"],
                "lon":           p["lon"],
                "severity":      severity,
                "location_name": location_name,
            }],
        })

    # Compute aggregate risks using the same thresholds
    risk, risk_ci = compute_aggregate_risks(forecast_hours, rain_thresh, temp_thresh, wind_thresh)

    return {"actions": actions, "risk": risk, "risk_ci": risk_ci}

def get_action_title(severity):
    if severity == "high":
        return "Immediate evacuation required"
    elif severity == "medium":
        return "Prepare response teams"
    else:
        return "Monitor conditions"