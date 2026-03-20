verifier_code = '''
import joblib
import pandas as pd
import numpy as np
import json

clf       = joblib.load("models/anomaly_classifier.pkl")
scaler    = joblib.load("models/scaler_classifier.pkl")
rt_model  = joblib.load("models/rt_predictor.pkl")
rt_scaler = joblib.load("models/scaler.pkl")

with open("models/classifier_info.json") as f:
    info = json.load(f)

CLF_FEATURES = info["clf_features"]
FEATURES     = [f for f in CLF_FEATURES 
                if f not in ["observed_rt", "pct_deviation"]]
THRESHOLD    = info["threshold"]


def verify_reagent(observed_features: list,
                   observed_rt: float) -> dict:
    """
    BioToken AI verification function.

    Args:
        observed_features : list of 137 molecular features
                            (9 descriptors + 128 Morgan fingerprints)
        observed_rt       : retention time measured at lab (seconds)

    Returns:
        dict with:
            genuine      — True = trigger ZK proof
                           False = block, flag as anomaly
            anomaly_prob — confidence score (0 to 1)
            result       — "GENUINE" or "ANOMALY"
    """
    # Step 1 — predict expected RT from molecular structure
    feat_df      = pd.DataFrame([observed_features], columns=FEATURES)
    feat_sc      = rt_scaler.transform(feat_df)
    predicted_rt = float(rt_model.predict(feat_sc)[0])

    # Step 2 — compute percentage deviation
    pct_dev = abs(observed_rt - predicted_rt) / predicted_rt * 100

    # Step 3 — classify
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
'''

with open("src/verifier.py", "w") as f:
    f.write(verifier_code)

print("src/verifier.py written successfully")
print("\nHandoff instructions for Harsh (blockchain team):")
print("  from src.verifier import verify_reagent")
print("  result = verify_reagent(features_list, observed_rt)")
print("  if result['genuine']: trigger ZK proof generation")
print("  else: block verification, flag reagent as anomaly")