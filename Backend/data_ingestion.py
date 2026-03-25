# ============================================================
# WeatherOps — data_ingestion.py
# Live weather fetch + spatial interpolation for inference.
#
# What this module does:
#   1. Fetches weather at 25 points across the Dehradun ROI
#   2. IDW-interpolates those values onto every grid point
#   3. Derives spatially-varying wind / heat / landslide fields
#
# What this module does NOT do:
#   - Raster sampling (that was notebook data-prep only)
#   - Grid building / boundary clipping (also data-prep only)
#   - Flood label / landslide label generation (training only)
#   - CSV / GeoPackage / Excel export (training only)
#
# Used by: app.py → compute_predictions()
# ============================================================

import time
import logging

import numpy as np
import pandas as pd
import requests
from scipy.interpolate import griddata
from scipy.spatial import cKDTree

log = logging.getLogger("WeatherOps")

# ============================================================
# ROI — Dehradun district bounding box
# ============================================================

ROI = {
    "lat_min": 29.97,
    "lat_max": 30.75,
    "lon_min": 77.55,
    "lon_max": 78.35,
}

# 25 sample points in a 5×5 grid across the ROI.
# One Open-Meteo API call per point — total = 25 calls on startup.
_lat_pts = np.linspace(ROI["lat_min"], ROI["lat_max"], 5)
_lon_pts = np.linspace(ROI["lon_min"], ROI["lon_max"], 5)
SAMPLE_PTS = [(lat, lon) for lat in _lat_pts for lon in _lon_pts]

# Standard atmospheric lapse rate (°C per metre)
LAPSE = 0.0065

# ============================================================
# INTERPOLATION UTILITY
# ============================================================

def idw_interpolate(src_pts: np.ndarray, values: np.ndarray,
                    grid_pts: np.ndarray) -> np.ndarray:
    """
    Linear interpolation with nearest-neighbour fallback for boundary cells.

    Parameters
    ----------
    src_pts  : (N, 2) array of [lon, lat] source sample points
    values   : (N,)   scalar values at each source point
    grid_pts : (M, 2) array of [lon, lat] target grid points

    Returns
    -------
    (M,) interpolated values
    """
    arr = griddata(src_pts, values, grid_pts, method="linear")
    nan_mask = np.isnan(arr)
    if nan_mask.any():
        tree = cKDTree(src_pts)
        _, idx = tree.query(grid_pts[nan_mask], k=1)
        arr[nan_mask] = values[idx]
    return arr


# ============================================================
# WEATHER FETCH — single point, full fields
# ============================================================

def fetch_all_weather(lat: float, lon: float,
                      retries: int = 3, backoff: int = 2) -> dict | None:
    """
    One Open-Meteo call returning wind, heat, and antecedent rainfall.

    past_days=3 + forecast_days=3  →  168 hourly rows total.
      Hours  0–71  = past 3 days   →  antecedent rain (ant_rain_72h)
      Hours 72–167 = next 3 days   →  peak wind / heat forecast

    Returns a dict or None if all retries fail.
    """
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat:.4f}&longitude={lon:.4f}"
        "&hourly=windspeed_10m,windgusts_10m,winddirection_10m,"
        "relativehumidity_2m,precipitation"
        "&daily=temperature_2m_max,apparent_temperature_max,uv_index_max"
        "&past_days=3&forecast_days=3"
        "&timezone=Asia%2FKolkata"
    )

    for attempt in range(1, retries + 1):
        try:
            r = requests.get(url, timeout=20)
            r.raise_for_status()
            d     = r.json()
            hrly  = d.get("hourly", {})
            daily = d.get("daily",  {})

            def _s(key, n, fill):
                return pd.to_numeric(hrly.get(key, [fill] * n), errors="coerce")

            spd  = _s("windspeed_10m",      168, 20)
            gust = _s("windgusts_10m",      168, 30)
            dirn = _s("winddirection_10m",  168, 180)
            rh   = _s("relativehumidity_2m",168, 65)

            # Hours 0–71 are the past 3 days → antecedent rain
            prec   = pd.Series(pd.to_numeric(
                hrly.get("precipitation", [0] * 168), errors="coerce"))
            ant72  = float(prec.iloc[:72].sum())
            rain24 = float(prec.iloc[48:72].sum())   # last 24 h of past window
            rain3  = float(prec.iloc[69:72].sum())   # last 3 h of past window

            t_max = pd.to_numeric(
                daily.get("temperature_2m_max",       [20] * 6), errors="coerce")
            a_max = pd.to_numeric(
                daily.get("apparent_temperature_max", [20] * 6), errors="coerce")
            uv    = pd.to_numeric(
                daily.get("uv_index_max",             [5]  * 6), errors="coerce")

            return {
                "lat":            lat,
                "lon":            lon,
                # Wind
                "peak_speed":     float(spd.max()),
                "peak_gust":      float(gust.max()),
                "mean_dir":       float(dirn.mean()),
                # Heat
                "temp_max_C":     float(t_max.max()),
                "apparent_max_C": float(a_max.max()),
                "uv_max":         float(uv.max()),
                "rh_mean":        float(rh.mean()),
                # Rain
                "ant_rain_72h":   ant72,
                "rainfall_24h":   rain24,
                "rainfall_3h":    rain3,
                # Soil moisture — current endpoint value, used as scalar fallback
                "soil_moisture":  0.2,   # overridden per-point in get_spatial_weather
            }

        except Exception as e:
            if attempt < retries:
                log.warning(
                    f"  Point ({lat:.3f},{lon:.3f}) attempt {attempt}/{retries}: "
                    f"{type(e).__name__} — retry in {backoff}s"
                )
                time.sleep(backoff)
            else:
                log.warning(
                    f"  Point ({lat:.3f},{lon:.3f}) FAILED after {retries} attempts"
                )
                return None


# ============================================================
# SPATIAL WEATHER — fetch 25 pts, build interpolatable DataFrame
# ============================================================

# ============================================================
# ORIGINAL get_spatial_weather — no caching (kept for reference)
# ============================================================
# def get_spatial_weather() -> pd.DataFrame:
#     log.info(f"Fetching weather at {len(SAMPLE_PTS)} points ...")
#     records = []
#     for i, (lat, lon) in enumerate(SAMPLE_PTS, 1):
#         rec = fetch_all_weather(lat, lon)
#         status = "✓" if rec else "✗"
#         log.info(f"  [{i:02d}/25] ({lat:.3f},{lon:.3f}) {status}")
#         if rec:
#             records.append(rec)
#     if not records:
#         raise RuntimeError("All 25 weather fetches failed — cannot build spatial weather.")
#     wx = pd.DataFrame(records)
#     log.info(
#         f"Spatial weather ready: {len(wx)}/25 points OK  |  "
#         f"wind {wx['peak_speed'].min():.1f}–{wx['peak_speed'].max():.1f} km/h  |  "
#         f"temp {wx['temp_max_C'].min():.1f}–{wx['temp_max_C'].max():.1f} °C"
#     )
#     return wx

# ============================================================
# CACHED get_spatial_weather — fetches once every 30 minutes
# ============================================================
_wx_cache: tuple = (None, 0.0)
CACHE_TTL = 1800  # 30 minutes

def get_spatial_weather() -> pd.DataFrame:
    global _wx_cache
    cached_df, cached_time = _wx_cache

    if cached_df is not None and (time.time() - cached_time) < CACHE_TTL:
        log.info("Returning cached spatial weather.")
        return cached_df

    log.info(f"Fetching weather at {len(SAMPLE_PTS)} points ...")
    records = []
    for i, (lat, lon) in enumerate(SAMPLE_PTS, 1):
        rec = fetch_all_weather(lat, lon)
        status = "✓" if rec else "✗"
        log.info(f"  [{i:02d}/25] ({lat:.3f},{lon:.3f}) {status}")
        if rec:
            records.append(rec)

    if not records:
        raise RuntimeError("All 25 weather fetches failed — cannot build spatial weather.")

    wx = pd.DataFrame(records)
    log.info(
        f"Spatial weather ready: {len(wx)}/25 points OK  |  "
        f"wind {wx['peak_speed'].min():.1f}–{wx['peak_speed'].max():.1f} km/h  |  "
        f"temp {wx['temp_max_C'].min():.1f}–{wx['temp_max_C'].max():.1f} °C"
    )
    _wx_cache = (wx, time.time())
    return wx


# ============================================================
# DERIVE SPATIAL FIELDS — interpolate wx onto the feature grid
# ============================================================

def derive_wind_fields(df: pd.DataFrame, wx: pd.DataFrame) -> pd.DataFrame:
    """
    Add wind_speed_kmh, wind_gust_kmh, wind_dir_deg, wind_hazard_score
    to the feature DataFrame using IDW interpolation + orographic boost.
    """
    src  = wx[["lon", "lat"]].values
    gpts = df[["lon",  "lat"]].values

    df = df.copy()
    df["wind_speed_kmh"] = idw_interpolate(src, wx["peak_speed"].values, gpts)
    df["wind_gust_kmh"]  = idw_interpolate(src, wx["peak_gust"].values,  gpts)
    df["wind_dir_deg"]   = idw_interpolate(src, wx["mean_dir"].values,   gpts)

    # Orographic enhancement: ridges above 1500 m get up to +40 %
    ridge = 1.0 + 0.4 * np.clip((df["elevation"].values - 1500) / 1000, 0, 1)
    df["wind_speed_kmh"] = (df["wind_speed_kmh"] * ridge).clip(0, 150)
    df["wind_gust_kmh"]  = (df["wind_gust_kmh"]  * ridge).clip(0, 200)

    df["wind_hazard_score"] = np.clip(df["wind_speed_kmh"] / 120, 0, 1).round(4)
    return df


def derive_heat_fields(df: pd.DataFrame, wx: pd.DataFrame) -> pd.DataFrame:
    """
    Add temp_max_C, apparent_temp_C, heat_index_C, uv_index,
    heat_hazard_score, heat_wave_flag to the feature DataFrame.

    Applies standard lapse-rate correction per cell elevation.
    """
    src  = wx[["lon", "lat"]].values
    gpts = df[["lon",  "lat"]].values

    df = df.copy()
    temp_raw     = idw_interpolate(src, wx["temp_max_C"].values,     gpts)
    apparent_raw = idw_interpolate(src, wx["apparent_max_C"].values, gpts)
    uv_raw       = idw_interpolate(src, wx["uv_max"].values,         gpts)
    rh_raw       = idw_interpolate(src, wx["rh_mean"].values,        gpts)

    # Lapse-rate correction relative to 700 m (Dehradun valley floor)
    edelt = np.clip(df["elevation"].values - 700, -500, 800)
    df["temp_max_C"]      = np.clip(temp_raw     - LAPSE * edelt, 2, 48).round(2)
    df["apparent_temp_C"] = np.clip(apparent_raw - LAPSE * edelt, 2, 52).round(2)
    df["uv_index"]        = np.clip(uv_raw, 0, 13).round(1)

    # Rothfusz Heat Index — only active when T ≥ 27 °C and RH ≥ 40 %
    T  = df["temp_max_C"].values
    RH = np.clip(rh_raw, 10, 100)
    HI = (
        -8.78 + 1.61*T + 2.338*RH - 0.146*T*RH
        - 0.0123*T**2 - 0.0164*RH**2
        + 0.00222*T**2*RH + 0.00072*T*RH**2
    )
    df["heat_index_C"] = np.where(
        (T >= 27) & (RH >= 40), np.clip(HI, T, T + 8), T
    ).round(2)

    df["heat_hazard_score"] = np.clip((df["heat_index_C"] - 15) / 30, 0, 1).round(4)
    elev = df["elevation"].values
    df["heat_wave_flag"] = (
        ((elev <= 1500) & (T >= 40)) | ((elev > 1500) & (T >= 30))
    ).astype(int)

    return df


def derive_landslide_fields(df: pd.DataFrame, wx: pd.DataFrame) -> pd.DataFrame:
    """
    Add antecedent_rain_mm, factor_of_safety, landslide_susceptibility
    to the feature DataFrame.

    Uses SINMAP-style Factor of Safety + composite susceptibility score.
    This is for INFERENCE only — it does not generate flood_occurred or
    landslide_occurred labels (those live in the training notebook).
    """
    src  = wx[["lon", "lat"]].values
    gpts = df[["lon",  "lat"]].values

    df = df.copy()

    # Antecedent 72 h rain, IDW-interpolated
    ant_raw = idw_interpolate(src, wx["ant_rain_72h"].values, gpts)
    df["antecedent_rain_mm"] = np.clip(ant_raw, 0, 800)

    slope_deg = df["slope"].values.astype(float)
    theta     = np.deg2rad(np.clip(slope_deg, 0.5, 75))

    veg_cover = df["vegetation_cover"].values if "vegetation_cover" in df.columns \
        else np.clip(0.15 + 0.65 * (df["elevation"].values - 500) / 1700, 0.05, 0.90)

    soil_moist = df["soil_moisture"].values if "soil_moisture" in df.columns \
        else np.full(len(df), 0.4)

    # SINMAP Factor of Safety
    C   = 0.05 + 0.15 * veg_cover
    phi = np.deg2rad(30 - 8 * np.clip(soil_moist, 0, 1))
    sat = np.clip(df["antecedent_rain_mm"].values / 345, 0, 1)
    FS  = (C + np.cos(theta)**2 * (1 - 0.5 * sat) * np.tan(phi)) \
          / (np.sin(theta) + 1e-6)
    df["factor_of_safety"] = np.clip(FS, 0, 6).round(3)

    # Composite susceptibility (0–1)
    curvature = df["curvature"].values if "curvature" in df.columns \
        else np.zeros(len(df))
    asp = 1.0 + 0.15 * np.cos(np.deg2rad(df["aspect"].values))
    ls  = (
        0.35 * np.clip((slope_deg - 15) / 55,                      0, 1) +
        0.25 * np.clip(1 - df["factor_of_safety"].values / 2,      0, 1) +
        0.15 * np.clip(df["antecedent_rain_mm"].values / 300,       0, 1) +
        0.15 * np.clip(1 - veg_cover,                               0, 1) +
        0.05 * np.clip(-curvature,                                  0, 1) +
        0.05 * np.clip(soil_moist - 0.3,                            0, 1)
    ) * asp
    df["landslide_susceptibility"] = np.clip(ls, 0, 1).round(4)

    return df


# ============================================================
# RAINFALL INTERPOLATION — used to upgrade app.py flood inputs
# ============================================================

def derive_rainfall_fields(df: pd.DataFrame, wx: pd.DataFrame) -> pd.DataFrame:
    """
    Add spatially-varying rainfall_24h and rainfall_3h to the feature
    DataFrame, replacing the single-point scalar used in get_live_weather().
    """
    src  = wx[["lon", "lat"]].values
    gpts = df[["lon",  "lat"]].values

    df = df.copy()
    df["rainfall_24h"] = np.clip(
        idw_interpolate(src, wx["rainfall_24h"].values, gpts), 0, 400)
    df["rainfall_3h"]  = np.clip(
        idw_interpolate(src, wx["rainfall_3h"].values,  gpts), 0, 150)
    return df


# ============================================================
# SCALAR FALLBACK — mirrors original get_live_weather() shape
# Used when spatial fetch is too slow or unavailable.
# ============================================================

def get_live_weather() -> dict:
    """
    Single-point scalar fetch (original behaviour).
    Returns the same keys as before so app.py stays backward-compatible.
    Only called as a fallback inside compute_predictions().
    """
    res = requests.get(
        "https://api.open-meteo.com/v1/forecast"
        "?latitude=30.3165&longitude=78.0322"
        "&current=temperature_2m,wind_speed_10m,soil_moisture_0_to_1cm"
        "&hourly=precipitation"
    ).json()

    return {
        "temp_c":       res["current"]["temperature_2m"],
        "wind_kmh":     res["current"]["wind_speed_10m"],
        "rain_mm":      sum(res["hourly"]["precipitation"][:24]),
        "rainfall_24h": sum(res["hourly"]["precipitation"][:24]),
        "rainfall_3h":  sum(res["hourly"]["precipitation"][:3]),
        "soil_moisture":res["current"].get("soil_moisture_0_to_1cm", 0.2),
    }


def get_hourly_forecast(lat: float, lon: float, horizon_hours: int = 72):
    try:
        forecast_days = (horizon_hours + 23) // 24
        url = (
            f"https://api.open-meteo.com/v1/forecast"
            f"?latitude={lat}&longitude={lon}"
            f"&hourly=precipitation,temperature_2m,wind_speed_10m,apparent_temperature,relative_humidity_2m"
            f"&forecast_days={forecast_days}"
            f"&timezone=Asia%2FKolkata"
        )
        response = requests.get(url, timeout=15)
        response.raise_for_status()
        data = response.json()
        hourly = data["hourly"]
        df = pd.DataFrame({
            "time": pd.to_datetime(hourly["time"]),
            "rain_mm": pd.Series(pd.to_numeric(hourly["precipitation"], errors="coerce")).fillna(0),
            "temp_c": pd.Series(pd.to_numeric(hourly["temperature_2m"], errors="coerce")).fillna(25),
            "wind_kmph": pd.Series(pd.to_numeric(hourly["wind_speed_10m"], errors="coerce")).fillna(15),
            "app_temp": pd.Series(pd.to_numeric(hourly["apparent_temperature"], errors="coerce")).fillna(25),
            "rh": pd.Series(pd.to_numeric(hourly["relative_humidity_2m"], errors="coerce")).fillna(60),
        })
        return df.head(horizon_hours)
    except Exception as e:
        print(f"Error in get_hourly_forecast: {e}")
        return pd.DataFrame()