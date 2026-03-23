import os
import pickle
import numpy as np
import pandas as pd
import joblib

# ============================================================
# MODEL LOADING
# ============================================================

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "models")



rf_model = joblib.load(os.path.join(MODEL_DIR, "weatherops_rf_model.pkl"))
scaler = joblib.load(os.path.join(MODEL_DIR, "weatherops_scaler.pkl"))
imputer = joblib.load(os.path.join(MODEL_DIR, "weatherops_imputer.pkl"))


# ============================================================
# 0️⃣ SAFETY PREPROCESSOR
# ============================================================

def ensure_required_columns(df):

    df = df.copy()

    if "name" in df.columns:
        df["Location_Name"] = df["name"].fillna("")
    else:
        df["Location_Name"] = ""

    if "highway" in df.columns:
        df.loc[df["Location_Name"] == "", "Location_Name"] = (
            df["highway"].astype(str)
        )

    df.loc[df["Location_Name"] == "", "Location_Name"] = "Unnamed Road"

    if "vulnerability" not in df.columns:
        df["vulnerability"] = 1.0

    if "slope_deg" not in df.columns:
        df["slope_deg"] = 10

    if "elevation_proxy" not in df.columns:
        df["elevation_proxy"] = 300

    return df


# ============================================================
# 1️⃣ ML FLOOD PREDICTION
# ============================================================

def predict_flood_probability(df, rain_mm):

    rainfall_24h = rain_mm * 3
    rainfall_3h = rain_mm

    # Placeholder GIS features (can upgrade later)
    river_distance = 500
    flow_accumulation = 200
    soil_moisture = 0.5
    urban_density = 0.3

    features = []

    for _, row in df.iterrows():

        elevation = row.get("elevation_proxy", 300)
        slope = row.get("slope_deg", 10)

        X = [
            elevation,
            slope,
            rainfall_24h,
            rainfall_3h,
            river_distance,
            flow_accumulation,
            soil_moisture,
            urban_density
        ]

        features.append(X)

    X = np.array(features)

    X = imputer.transform(X)
    X = scaler.transform(X)

    probs = rf_model.predict_proba(X)[:, 1]

    return probs


# ============================================================
# 2️⃣ BALANCED SEGMENT-LEVEL HAZARD SCORING
# ============================================================

def hazards_agent_with_heat(df, rain_mm, wind_kmh, temp_c):

    df = ensure_required_columns(df)

    # -------------------------
    # ML FLOOD RISK
    # -------------------------
    df["flood_score"] = predict_flood_probability(df, rain_mm)

    # -------------------------
    # LANDSLIDE RISK
    # -------------------------
    df["landslide_score"] = (
        (df["slope_deg"] / 30.0) *
        (rain_mm / 40.0)
    )

    # -------------------------
    # WIND RISK
    # -------------------------
    df["wind_score"] = (
        (df["elevation_proxy"] / 800.0) *
        (wind_kmh / 60.0)
    )

    # -------------------------
    # HEAT RISK
    # -------------------------
    def heat_multiplier(row):

        road_type = row.get("highway", "")

        if road_type in ["primary", "trunk", "motorway"]:
            return 1.3
        elif road_type == "residential":
            return 1.15
        return 1.0

    df["heat_score"] = df.apply(
        lambda row: (
            (temp_c / 45.0) *
            heat_multiplier(row)
        ),
        axis=1,
    )

    # Clamp all scores
    for col in [
        "flood_score",
        "landslide_score",
        "wind_score",
        "heat_score",
    ]:
        df[col] = df[col].clip(0, 1)

    return df


# ============================================================
# 3️⃣ MULTI-HAZARD DECISION ENGINE
# ============================================================

def decision_agent(df, threshold=0.3):

    alerts = []

    hazard_actions = {
        "Flood": "Deploy pumps in low-lying areas.",
        "Landslide": "Close road & deploy earth movers.",
        "Wind": "Secure high-elevation power lines.",
        "Heat": "Activate cooling centers.",
    }

    for idx, row in df.iterrows():

        scores = {
            "Flood": row["flood_score"],
            "Landslide": row["landslide_score"],
            "Wind": row["wind_score"],
            "Heat": row["heat_score"],
        }

        for hazard, value in scores.items():

            if value >= threshold:

                alerts.append({
                    "road_index": idx,
                    "Location_Name": row["Location_Name"],
                    "primary_hazard": hazard,
                    "recommended_action": hazard_actions[hazard],
                    "max_score": float(value * 100),
                })

    alerts_df = pd.DataFrame(alerts)

    return alerts_df


# ============================================================
# 4️⃣ BALANCED TOP-RISK EXTRACTOR
# ============================================================

def extract_top_alerts(alerts_df, original_df, top_n=50):

    if alerts_df.empty:
        return []

    alerts = []

    hazards = alerts_df["primary_hazard"].unique()

    per_hazard_limit = max(1, top_n // len(hazards))

    for hazard in hazards:

        subset = alerts_df[
            alerts_df["primary_hazard"] == hazard
        ]

        subset = subset.sort_values(
            "max_score", ascending=False
        ).head(per_hazard_limit)

        alerts.append(subset)

    final_df = pd.concat(alerts)

    return final_df.to_dict(orient="records")


# ============================================================
# 5️⃣ MAIN WEATHEROPS ENGINE
# ============================================================

def run_weatherops(df, rain_mm, wind_kmh, temp_c):

    df = hazards_agent_with_heat(df, rain_mm, wind_kmh, temp_c)

    alerts_df = decision_agent(df, threshold=0.3)

    alerts = extract_top_alerts(alerts_df, df, top_n=50)

    return alerts


# ============================================================
# 6️⃣ CITY-LEVEL RISK SUMMARY
# ============================================================

def compute_risks(weather_df, terrain_stats=None):

    rain_peak = weather_df.get("rain_adj", pd.Series([0])).max()
    temp_peak = weather_df.get("heat_index", pd.Series([0])).max()
    wind_peak = weather_df.get("wind_kmph", pd.Series([0])).max()

    risk = {
        "FLOOD": min(1.0, rain_peak / 80),
        "HEAT": min(1.0, max(0, (temp_peak - 35) / 10)),
        "WIND": min(1.0, wind_peak / 40),
    }

    confidence = {
        k: (max(0, v - 0.15), min(1, v + 0.15))
        for k, v in risk.items()
    }

    return risk, confidence