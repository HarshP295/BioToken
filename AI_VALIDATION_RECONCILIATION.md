# BioToken AI Validation Reconciliation

Re-verified on 2026-10-04 against the models now in `ai/models/` (the March 2026 models from the original AI module, whose training notebook is `ai/notebooks/05_classifier.ipynb`). Every number below comes from a script in this repo and can be re-run.

## What was wrong and what was fixed

| Problem | Effect | Fix |
|---|---|---|
| `ai/models/` had been replaced by an Aug 2026 retrain (upward-only anomaly shifts, different feature order) | Deployed metrics no longer matched the paper (AUC 0.9805, F1 0.9337) | Restored the original models. They reproduce the paper exactly (below) |
| `src/features.py` emitted descriptors in a different order than the columns the original models were fitted on | Every feature vector sent to the original models would have been scrambled | Restored the training column order. `verifier.py` now checks the order against the fitted scalers at load |
| `/compute-features` ignored the reagent: it returned fixed "population-average" features and invented an RT from the peak-intensity centroid (`200 + centroid x 1300`) | The AI verdict depended only on the peak shape, not on the reagent's chemistry or measured RT (contradicts paper section 3.2) | The endpoint now takes `{smiles, observed_rt}`. The lab dashboard collects both, and the peaks stay in the browser |
| Layer 2 SMILES: "theophylline" was theobromine, "paraxanthine" was 7-methylxanthine | Two compound families were evaluated on the wrong molecules | Replaced with PubChem SMILES (CIDs in the script) |
| Layer 2 "caffeine anchor" 643.8 s (PubChem 245687) | That SMRT row is N,N'-diacetyl-4,6-diaminopyrimidine, an isomer with the same formula. Caffeine is not in SMRT | See Layer 2 below |
| `06_confusion_matrices.*`, `tmp_confusion_check.py` | "Reconstructed" the synthetic set with different shift ranges and perturbed molecular features | Removed. Replaced by `ai/reproduce_paper_metrics.py`, which reruns the exact notebook procedure |
| `ai/src/prover.py` circuit paths | Server-side proof generation could not find `fingerprint.wasm` | Points to `circuits/build/fingerprint_js/` |

## Synthetic evaluation (paper sections 4 and 6): reproduced exactly

Script: `python ai/reproduce_paper_metrics.py`

- RT predictor (Table 3): R2 0.7706, RMSE 83.49 s, 15,581 held-out molecules
- Synthetic set: 153,407 samples (75,506 genuine, 77,901 anomaly)
- Classifier: AUC 0.9798. Table 4 matches at every threshold (0.50: detection 92.0%, FPR 4.9%, F1 0.9351)
- Table 8 confusion matrix: TN 14,363 / FP 738 / FN 1,251 / TP 14,330
- Table 9 uses 500 molecules (`df.sample(500, random_state=42)`): 12.6 / 17.6 / 27.0 / 60.0% detection, and 11.4% genuine FPR. On the full 15,581-molecule test split the figures are 12.9 / 17.7 / 26.1 / 58.6%, with 12.1% FPR.

Manuscript wording to correct: the anomaly shift is applied in both directions (`true RT x (1 +/- U(0.15, 0.40))`), not upward only. The models were pickled with scikit-learn 1.8 and XGBoost 3.2, not XGBoost 2.0.

## Layer 2: ICH Q1A degradation (paper section 5.2)

Script: `python ai/layer2_validation_logged.py`. Output goes to `ai/data/layer2_results.csv` and `figures/layer2_results_table.png`.

- **Parent-anchored protocol** (the paper's rule, applied to both families, because both salicylate sources include an aspirin run): **15/15, FPR 0/6**. The 9 degradants have anomaly probability of about 1.000. The paper's stated range is 0.85 to 0.98.
- **Caveat:** no parent compound (caffeine or aspirin) is in METLIN SMRT, so the destination anchor has to be the RT predictor's own estimate (caffeine 636.2 s, aspirin 664.0 s). Genuine parents therefore land at 0% deviation by construction. The 0% FPR is not independent evidence; only the degradant detections test the model.
- **Paper's literal anchor** (437.1 s, described as caffeine's SMRT RT, but no SMRT row has that value): 11/15, FPR 4/6. All four caffeine samples are flagged.
- The literature RT sources in the data (Ribeiro 2019, Acheampong 2016, Scott & Marks 1984, Singh 2012, Musumeci 2021) are not the paper's references [7, 9, 12, 13], and the values have not been traced to source tables.

## Layer 1: RepoRT (paper section 5.1): not reproduced

Script: `python ai/reportrt_validation_fix.py <RepoRT clone>`. Output goes to `ai/data/layer1_reportrt_results.csv` and `figures/layer1_diagnostic.png`.

Paper protocol: group by dataset and compound, label a measurement ANOMALY if it is more than 25% from the local median, then draw a balanced 500/500 sample with seed 42. The run uses RepoRT `processed_data`, reversed-phase C18/C8 columns, and excludes dataset 0186, which is METLIN SMRT itself (the training data).

- 85,539 rows from 311 datasets. AUC **0.6244**, detection 98.8%, FPR **94.4%** (paper: 0.9412 / 89.4% / 5.1%)
- Including SMRT and all column types only reaches AUC 0.7942 and FPR 54.6%.
- Root cause: RepoRT RTs come from other columns and gradients and are not on the SMRT scale. Genuine samples have a median observed RT of 234 s against a median predicted RT of 694 s, about 69% deviation. A model trained on SMRT-scale RTs cannot reach the reported numbers on raw RepoRT RTs without per-dataset calibration.

## Recommended manuscript changes

1. Keep sections 4 and 6 (they reproduce). Fix the shift-direction wording, the library versions, and note that Table 9 uses n = 500.
2. Layer 2: describe the anchor as the model-predicted parent RT and state that genuine samples pass by construction. Remove the 437.1 s claim, fix the citations to match the data sources, and update the probability range.
3. Layer 1: drop the AUC 0.9412 claim, or redo it with per-dataset RT calibration and report what that gives.
