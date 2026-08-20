import numpy as np
import pandas as pd
import joblib
from sklearn.model_selection import train_test_split
from sklearn.metrics import confusion_matrix, accuracy_score, precision_score, recall_score, f1_score, roc_auc_score


df = pd.read_csv('ai/data/SMRT_features_v2.csv')
feature_cols = [c for c in df.columns if c not in ['pubchem', 'rt']]

n_genuine = 75506
n_anomaly = 77901
rng = np.random.default_rng(42)

genuine = df.iloc[:n_genuine].copy().reset_index(drop=True)
anomaly = df.iloc[:n_anomaly].copy().reset_index(drop=True)

anomaly = anomaly.copy()
shift = rng.uniform(0.12, 0.35, size=len(anomaly))
anomaly['rt'] = anomaly['rt'] * (1 + shift)
for col in ['mol_weight', 'logp', 'tpsa', 'heavy_atom_count', 'ring_count', 'aromatic_rings']:
    noise = rng.normal(0, 0.1, size=len(anomaly))
    anomaly[col] = anomaly[col].astype(float) * (1 + noise)

X = pd.concat([genuine[feature_cols], anomaly[feature_cols]], ignore_index=True)
y = np.concatenate([np.zeros(len(genuine)), np.ones(len(anomaly))])
X['rt'] = pd.concat([genuine['rt'], anomaly['rt']], ignore_index=True)

rt_model = joblib.load('ai/models/rt_predictor.pkl')
rt_scaler = joblib.load('ai/models/scaler.pkl')
clf = joblib.load('ai/models/anomaly_classifier.pkl')
scaler = joblib.load('ai/models/scaler_classifier.pkl')

X_raw = X[feature_cols].values.astype(float)
rt_values = X['rt'].values.astype(float)
X_scaled = rt_scaler.transform(X_raw)
rt_pred = rt_model.predict(X_scaled)
pct = np.abs(rt_values - rt_pred) / np.maximum(rt_pred, 1e-6) * 100
clf_X = np.hstack([X_raw, np.column_stack([rt_values, pct])])
probs = clf.predict_proba(scaler.transform(clf_X))[:, 1]

X_train, X_test, y_train, y_test, p_train, p_test = train_test_split(
    X_raw, y, probs, test_size=0.2, random_state=42, stratify=y
)

for name, labels, probs_ in [('train', y_train, p_train), ('test', y_test, p_test)]:
    pred = (probs_ >= 0.5).astype(int)
    cm = confusion_matrix(labels, pred, labels=[0, 1])
    print(name, 'cm=', cm)
    print(name, 'acc=', accuracy_score(labels, pred), 'prec=', precision_score(labels, pred, zero_division=0), 'recall=', recall_score(labels, pred, zero_division=0), 'f1=', f1_score(labels, pred, zero_division=0), 'auc=', roc_auc_score(labels, probs_))
    print('class_counts', np.bincount(labels))
    print('---')
