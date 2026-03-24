import warnings
warnings.filterwarnings("ignore")

import pandas as pd
import numpy as np
from pathlib import Path
from sklearn.model_selection import StratifiedKFold, KFold, train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.svm import SVC, SVR
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import (
    roc_auc_score, f1_score, precision_score, recall_score, accuracy_score,
    average_precision_score, brier_score_loss, roc_curve,
    mean_squared_error, mean_absolute_error, r2_score,
)
from imblearn.over_sampling import SMOTE
from xgboost import XGBClassifier, XGBRegressor

# Path to the feature table (adjust if needed)
BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
CSV_PATH = DATA_DIR / "weatherops_feature_table.csv"


class EvaluationAgent:
    def __init__(self, csv_path=None):
        self.csv_path = csv_path or CSV_PATH

    @staticmethod
    def _single_feat_auc(y, x, threshold=0.88):
        x = pd.Series(x).fillna(pd.Series(x).median()).values
        mask = ~np.isnan(x)
        if mask.sum() < 10 or len(np.unique(y[mask])) < 2:
            return False
        try:
            a = roc_auc_score(y[mask], x[mask])
            a = max(a, 1 - a)
            return a > threshold
        except:
            return False

    @staticmethod
    def _youden_threshold(y_true, y_prob):
        fpr, tpr, thresh = roc_curve(y_true, y_prob)
        j = tpr - fpr
        return float(thresh[np.argmax(j)])

    @staticmethod
    def _spatial_split(df, X, y, test_fold=0, n_folds=5):
        lb = pd.cut(df["lat"], bins=n_folds, labels=False).fillna(0).astype(int)
        lo = pd.cut(df["lon"], bins=n_folds, labels=False).fillna(0).astype(int)
        folds = ((lb * n_folds + lo) % n_folds).values
        te = folds == test_fold
        tr = ~te
        return X[tr], X[te], y[tr], y[te], np.where(tr)[0], np.where(te)[0]

    @staticmethod
    def _make_targets(df):
        t = {}
        if "flood_occurred" in df.columns:
            t["flood"] = df["flood_occurred"].astype(int)
        if "LST_C_mean" in df.columns:
            lst_q75 = df["LST_C_mean"].quantile(.75)
            t["heat"] = (df["LST_C_mean"] >= lst_q75).astype(int)
        if "wind_kmh" in df.columns:
            t["wind"] = df["wind_kmh"].astype(float)
        if "slope" in df.columns:
            slope_q75 = df["slope"].quantile(.75)
            t["landslide"] = (df["slope"] >= slope_q75).astype(int)
        return t

    @staticmethod
    def _make_features(df):
        f = {}
        f["flood"] = [c for c in ["elevation","slope","aspect","twi","rainfall_24h",
                                    "rainfall_3h","flow_accumulation","soil_moisture"]
                       if c in df.columns]
        f["heat"] = [c for c in ["temp_C","elevation","slope","aspect","lat","lon","soil_moisture"]
                      if c in df.columns]
        f["wind"] = [c for c in ["elevation","slope","aspect","lat","lon","flow_accumulation"]
                      if c in df.columns]
        f["landslide"] = [c for c in ["elevation","aspect","soil_moisture"]
                           if c in df.columns]
        return f

    def _clf_eval(self, name, model, Xtr, ytr, Xte, yte):
        sc = StandardScaler().fit(Xtr)
        Xtr_s, Xte_s = sc.transform(Xtr), sc.transform(Xte)
        pos = int(ytr.sum())
        if 1 < pos < len(ytr)-1:
            try:
                Xtr_s, ytr = SMOTE(random_state=42, k_neighbors=min(5,pos-1)).fit_resample(Xtr_s, ytr)
            except:
                pass
        model.fit(Xtr_s, ytr)
        prob = model.predict_proba(Xte_s)[:,1] if hasattr(model,"predict_proba") else model.decision_function(Xte_s)
        t_prob = model.predict_proba(Xtr_s)[:,1] if hasattr(model,"predict_proba") else model.decision_function(Xtr_s)
        thresh = self._youden_threshold(ytr, t_prob) if len(np.unique(ytr)) > 1 else 0.5
        yp = (prob >= thresh).astype(int)
        res = {"name":name, "scaler":sc, "model":model, "y_pred":yp, "y_prob":prob, "thresh":thresh}
        res["f1"]        = f1_score(yte, yp, zero_division=0)
        res["precision"] = precision_score(yte, yp, zero_division=0)
        res["recall"]    = recall_score(yte, yp, zero_division=0)
        res["accuracy"]  = accuracy_score(yte, yp)
        if len(np.unique(yte)) > 1:
            res["roc_auc"]  = roc_auc_score(yte, prob)
            res["avg_prec"] = average_precision_score(yte, prob)
            res["brier"]    = brier_score_loss(yte, prob)
        else:
            res["roc_auc"] = res["avg_prec"] = res["brier"] = float("nan")
        cv_aucs = []
        if len(np.unique(ytr)) > 1:
            skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
            for tr_i, te_i in skf.split(Xtr_s, ytr):
                try:
                    m2 = type(model)(**model.get_params()) if hasattr(model,"get_params") else model
                    m2.fit(Xtr_s[tr_i], ytr[tr_i])
                    pr2 = m2.predict_proba(Xtr_s[te_i])[:,1] if hasattr(m2,"predict_proba") else m2.decision_function(Xtr_s[te_i])
                    if len(np.unique(ytr[te_i]))>1:
                        cv_aucs.append(roc_auc_score(ytr[te_i], pr2))
                except:
                    pass
        res["cv_auc_mean"] = float(np.mean(cv_aucs)) if cv_aucs else float("nan")
        res["cv_auc_std"]  = float(np.std(cv_aucs))  if cv_aucs else float("nan")
        return res

    def _reg_eval(self, name, model, Xtr, ytr, Xte, yte):
        sc = StandardScaler().fit(Xtr)
        Xtr_s, Xte_s = sc.transform(Xtr), sc.transform(Xte)
        model.fit(Xtr_s, ytr)
        yp = model.predict(Xte_s)
        res = {"name":name, "scaler":sc, "model":model, "y_pred":yp}
        res["r2"]   = r2_score(yte, yp)
        res["rmse"] = float(np.sqrt(mean_squared_error(yte, yp)))
        res["mae"]  = float(mean_absolute_error(yte, yp))
        res["mape"] = float(np.mean(np.abs((yte-yp)/(np.abs(yte)+1e-9)))*100)
        cv_r2s = []
        kf = KFold(n_splits=5, shuffle=True, random_state=42)
        for tr_i, te_i in kf.split(Xtr_s):
            try:
                m2 = type(model)(**model.get_params()) if hasattr(model,"get_params") else model
                m2.fit(Xtr_s[tr_i], ytr[tr_i])
                cv_r2s.append(r2_score(ytr[te_i], m2.predict(Xtr_s[te_i])))
            except:
                pass
        res["cv_r2_mean"] = float(np.mean(cv_r2s)) if cv_r2s else float("nan")
        res["cv_r2_std"]  = float(np.std(cv_r2s))  if cv_r2s else float("nan")
        res["baseline_rmse"] = float(ytr.std())
        return res

    def run(self, progress_cb=None):
        if not self.csv_path.exists():
            return {"error": f"Feature table not found: {self.csv_path}"}
        df_raw = pd.read_csv(self.csv_path)
        if df_raw.empty:
            return {"error": "Feature table is empty"}

        df = df_raw.copy()
        if "lat" not in df.columns:
            df["lat"] = np.linspace(30.20, 30.45, len(df))
        if "lon" not in df.columns:
            df["lon"] = np.linspace(77.95, 78.15, len(df))

        targets   = self._make_targets(df)
        feat_sets = self._make_features(df)

        hazards_cfg = [
            ("flood",     "🌊 Flood",     "flood",  "clf"),
            ("heat",      "🔥 Heat",      "heat",   "clf"),
            ("wind",      "💨 Wind",      "wind",   "reg"),
            ("landslide", "⛰ Landslide", "landslide","clf"),
        ]

        results = {}
        for step, (hkey, hname, tkey, task) in enumerate(hazards_cfg):
            if progress_cb:
                progress_cb(step/4, f"Training {hname}…")
            if tkey not in targets:
                results[hkey] = {"error": f"Cannot build target '{tkey}' — check column names in CSV"}
                continue
            feats = feat_sets.get(hkey, [])
            if not feats:
                results[hkey] = {"error": f"No features found for {hkey}"}
                continue

            avail_cols = feats + ["lat","lon"]
            df_s = df[avail_cols].copy()
            tgt = targets[tkey]
            if isinstance(tgt, pd.Series):
                df_s["__y__"] = tgt.values
            else:
                df_s["__y__"] = np.array(tgt)
            df_s = df_s.dropna().reset_index(drop=True)
            if len(df_s) < 40:
                results[hkey] = {"error": f"Only {len(df_s)} rows after dropna — need ≥40"}
                continue

            X = df_s[feats].values
            y = df_s["__y__"].values

            try:
                Xtr, Xte, ytr, yte, idx_tr, idx_te = self._spatial_split(df_s, X, y)
            except Exception:
                strat = y if task=="clf" and len(np.unique(y))>1 else None
                Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=42, stratify=strat)
                idx_tr = np.arange(len(ytr))
                idx_te = np.arange(len(ytr), len(y))

            if len(Xte) < 5:
                strat = y if task=="clf" and len(np.unique(y))>1 else None
                Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=42, stratify=strat)

            if task == "clf":
                pos_w = max(1, (ytr==0).sum() / max(1, (ytr==1).sum()))
                model_defs = {
                    "Logistic Regression": LogisticRegression(C=0.1, class_weight="balanced",
                                           max_iter=1000, random_state=42),
                    "Random Forest":       RandomForestClassifier(n_estimators=150, max_depth=8,
                                           min_samples_leaf=10, class_weight="balanced",
                                           random_state=42, n_jobs=-1),
                    "XGBoost":             XGBClassifier(n_estimators=100, max_depth=4, learning_rate=0.05,
                                           subsample=0.7, min_child_weight=10, scale_pos_weight=pos_w,
                                           use_label_encoder=False, eval_metric="logloss",
                                           random_state=42, n_jobs=-1, verbosity=0),
                    "SVM (RBF)":           CalibratedClassifierCV(
                                               SVC(C=1.0, kernel="rbf", class_weight="balanced"),
                                               cv=min(3, max(2, int(ytr.sum())))),
                }
                mr = {}
                for mn, mdl in model_defs.items():
                    try:
                        mr[mn] = self._clf_eval(mn, mdl, Xtr, ytr, Xte, yte)
                    except Exception as e:
                        mr[mn] = {"name": mn, "error": str(e)}
                valid = [k for k in mr if "roc_auc" in mr[k] and not np.isnan(mr[k].get("roc_auc", float("nan")))]
                best = max(valid, key=lambda k: mr[k]["roc_auc"]) if valid else list(mr.keys())[0]
                results[hkey] = {
                    "task": "clf",
                    "display": hname,
                    "models": mr,
                    "best": best,
                    "features": feats,
                    "y_te": yte.tolist(),
                    "n_train": len(ytr),
                    "n_test": len(yte),
                    "pos_rate": float(yte.mean())
                }
            else:  # regression
                model_defs = {
                    "Ridge":         Ridge(alpha=10.0),
                    "Random Forest": RandomForestRegressor(n_estimators=150, max_depth=8,
                                     min_samples_leaf=15, random_state=42, n_jobs=-1),
                    "XGBoost":       XGBRegressor(n_estimators=100, max_depth=4, learning_rate=0.05,
                                     subsample=0.7, min_child_weight=10,
                                     random_state=42, n_jobs=-1, verbosity=0),
                    "SVR (RBF)":     SVR(C=1.0, kernel="rbf", epsilon=1.0),
                }
                mr = {}
                for mn, mdl in model_defs.items():
                    try:
                        mr[mn] = self._reg_eval(mn, mdl, Xtr, ytr, Xte, yte)
                    except Exception as e:
                        mr[mn] = {"name": mn, "error": str(e)}
                valid = [k for k in mr if "r2" in mr[k] and not np.isnan(mr[k].get("r2", float("nan")))]
                best = max(valid, key=lambda k: mr[k]["r2"]) if valid else list(mr.keys())[0]
                results[hkey] = {
                    "task": "reg",
                    "display": hname,
                    "models": mr,
                    "best": best,
                    "features": feats,
                    "y_te": yte.tolist(),
                    "n_train": len(ytr),
                    "n_test": len(yte),
                    "baseline_rmse": float(ytr.std())
                }

        if progress_cb:
            progress_cb(1.0, "Complete")
        return results