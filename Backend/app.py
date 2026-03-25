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
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.graphics.shapes import Drawing
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.charts.piecharts import Pie
from reportlab.lib.units import inch
from reportlab.graphics.shapes import Drawing, String
from data_ingestion import (
    get_spatial_weather,
    derive_wind_fields,
    derive_heat_fields,
    derive_landslide_fields,
    derive_rainfall_fields,
    get_hourly_forecast,
)

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
    allow_origins=["*"],
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
    df = get_hourly_forecast(30.3165, 78.0322, horizon)
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
    return results

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

    weather = get_weather_for_display()
    predictions = compute_predictions()
    blocks = compute_block_risk()

    report_path = os.path.join(BASE_DIR, "WeatherOps_Report.pdf")

    doc = SimpleDocTemplate(report_path)
    styles = getSampleStyleSheet()
    elements = []

    # =========================================================
    # HEADER (NDMA STYLE)
    # =========================================================

    elements.append(Paragraph("<b>Disaster Risk Assessment Report</b>", styles["Title"]))
    elements.append(Spacer(1, 10))
    elements.append(Paragraph(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}", styles["Normal"]))
    elements.append(Spacer(1, 20))

    # =========================================================
    # WEATHER SECTION
    # =========================================================

    elements.append(Paragraph("<b>Current Weather Conditions</b>", styles["Heading2"]))
    elements.append(Spacer(1, 10))

    weather_data = [
        ["Temperature", f"{round(weather['temp_c'],1)} °C"],
        ["Wind Speed", f"{round(weather['wind_kmh'],1)} km/h"],
        ["Rainfall (24h)", f"{round(weather['rainfall_24h'],1)} mm"],
    ]

    weather_table = Table(weather_data, colWidths=[200, 200])
    weather_table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.grey),
        ("GRID", (0,0), (-1,-1), 0.5, colors.black),
    ]))

    elements.append(weather_table)
    elements.append(Spacer(1, 20))

    # =========================================================
    # HAZARD SCORES
    # =========================================================


    hazards = {
        "Flood": np.mean([p["prob"] for p in predictions]),
        "Wind": np.mean([p["wind_risk"] for p in predictions]),
        "Heat": np.mean([p["heat_risk"] for p in predictions]),
        "Landslide": np.mean([p["landslide_risk"] for p in predictions]),
    }


    # =========================================================
    # PIE CHART
    # =========================================================

    elements.append(Paragraph("<b>Hazard Risk Distribution</b>", styles["Heading2"]))
    elements.append(Spacer(1, 15))
    data_vals = [v * 100 for v in hazards.values()]
    data_vals = [v * 100 for v in hazards.values()]
    labels = list(hazards.keys())
    drawing = Drawing(400, 220)
    pie = Pie()
    pie = Pie()
    pie.x = 100
    pie.y = 20
    pie.height = 200

    pie.height = 200
    pie.labels = [f"{labels[i]} ({round(data_vals[i],1)}%)" for i in range(len(labels))]

# Better colors
    pie.slices[0].fillColor = colors.blue
    pie.slices[1].fillColor = colors.orange 
    pie.slices[2].fillColor = colors.red
    pie.slices[3].fillColor = colors.green

    pie.slices.strokeWidth = 0.5

    drawing.add(pie)

    elements.append(drawing)
    elements.append(Spacer(1, 25))

    # =========================================================
    # TOP LOCATIONS TABLE (HUMAN FRIENDLY)
    # =========================================================

    elements.append(Paragraph("<b>High Risk Locations</b>", styles["Heading2"]))
    elements.append(Spacer(1, 10))

    table_data = [["Location", "Main Hazard", "Severity"]]

    top = sorted(predictions, key=lambda x: x["prob"], reverse=True)[:20]

    for p in top:
        location = nearest_location_name(p["lat"], p["lon"])

        risks = {
            "Flood": p["prob"],
            "Wind": p["wind_risk"],
            "Heat": p["heat_risk"],
            "Landslide": p["landslide_risk"],
        }

        hazard = max(risks, key=risks.get)
        val = risks[hazard]

        if val > 0.7:
            severity = "HIGH"
        elif val > 0.4:
            severity = "MEDIUM"
        else:
            severity = "LOW"

        table_data.append([location, hazard, severity])

    table = Table(table_data, colWidths=[200, 150, 100])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.darkblue),
        ("TEXTCOLOR", (0,0), (-1,0), colors.white),
        ("GRID", (0,0), (-1,-1), 0.5, colors.black),
    ]))

    elements.append(table)
    elements.append(Spacer(1, 20))

    # =========================================================
    # BLOCK LEVEL TABLE
    # =========================================================

    elements.append(Paragraph("<b>Block Level Risk Summary</b>", styles["Heading2"]))

    block_data = [["Block", "Flood%", "Wind%", "Heat%", "Land%"]]

    for block, vals in list(blocks.items())[:20]:
        block_data.append([
            str(block),
            round(vals["flood"]*100,1),
            round(vals["wind"]*100,1),
            round(vals["heat"]*100,1),
            round(vals["landslide"]*100,1),
        ])

    block_table = Table(block_data)
    block_table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.grey),
        ("GRID", (0,0), (-1,-1), 0.5, colors.black),
    ]))

    elements.append(block_table)
    elements.append(Spacer(1, 20))

    # =========================================================
    # SUMMARY
    # =========================================================

    elements.append(Paragraph("<b>System Summary</b>", styles["Heading2"]))

    high = sum(1 for p in predictions if p["severity"] == "high")
    medium = sum(1 for p in predictions if p["severity"] == "medium")
    low = sum(1 for p in predictions if p["severity"] == "low")

    elements.append(Paragraph(f"High Risk Zones: {high}", styles["Normal"]))
    elements.append(Paragraph(f"Medium Risk Zones: {medium}", styles["Normal"]))
    elements.append(Paragraph(f"Low Risk Zones: {low}", styles["Normal"]))

    # =========================================================
    # BUILD
    # =========================================================

    doc.build(elements)

    return FileResponse(report_path, media_type="application/pdf", filename="WeatherOps_Report.pdf")

_geocode_cache = {}

def reverse_geocode(lat, lon):
    key = (round(lat, 3), round(lon, 3))
    if key in _geocode_cache:
        return _geocode_cache[key]

    try:
        url = "https://nominatim.openstreetmap.org/reverse"
        params = {"lat": lat, "lon": lon, "format": "json"}
        headers = {"User-Agent": "WeatherOps"}

        r = requests.get(url, params=params, headers=headers, timeout=5)
        data = r.json()

        name = data.get("display_name", "").split(",")[0]
        _geocode_cache[key] = name

        time.sleep(1)
        return name

    except:
        return ""

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