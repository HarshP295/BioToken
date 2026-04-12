import joblib
import pandas as pd
import numpy as np
import json
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS = os.path.join(BASE, "models")

clf       = joblib.load(os.path.join(MODELS, "anomaly_classifier.pkl"))
scaler    = joblib.load(os.path.join(MODELS, "scaler_classifier.pkl"))
rt_model  = joblib.load(os.path.join(MODELS, "rt_predictor.pkl"))
rt_scaler = joblib.load(os.path.join(MODELS, "scaler.pkl"))

with open(os.path.join(MODELS, "classifier_info.json")) as f:
    info = json.load(f)

CLF_FEATURES = info["clf_features"]
FEATURES     = [f for f in CLF_FEATURES if f not in ["observed_rt", "pct_deviation"]]
THRESHOLD    = info["threshold"]

def verify_reagent(observed_features: list, observed_rt: float) -> dict:
    feat_df      = pd.DataFrame([observed_features], columns=FEATURES)
    feat_sc      = rt_scaler.transform(feat_df)
    predicted_rt = float(rt_model.predict(feat_sc)[0])

    pct_dev = abs(observed_rt - predicted_rt) / predicted_rt * 100

    clf_input = observed_features + [observed_rt, pct_dev]
    clf_df    = pd.DataFrame([clf_input], columns=CLF_FEATURES)
    clf_sc    = scaler.transform(clf_df)
    prob      = float(clf.predict_proba(clf_sc)[0][1])
    genuine   = prob < THRESHOLD

    return {
        "predicted_rt":  round(predicted_rt, 2),
        "observed_rt":   round(observed_rt, 2),
        "pct_deviation": round(pct_dev, 2),
        "anomaly_prob":  round(prob, 4),
        "threshold":     THRESHOLD,
        "genuine":       genuine,
        "result":        "GENUINE" if genuine else "ANOMALY"
    }