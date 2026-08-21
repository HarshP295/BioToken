# BioToken AI Validation Reconciliation

Verified on 2026-08-20 against the current deployed AI artifacts.

## Layer 1: Synthetic classifier

### Verified

- The incoming populated classifier notebook was run end-to-end using the current `SMRT_features_v2.csv` and deployed RT predictor.
- The classifier configuration matches the manuscript: XGBoost with 300 estimators, learning rate 0.05, and max depth 6.
- Synthetic sample generation uses genuine RT noise of +/-1%, anomaly shifts of 15-40%, and prunes genuine samples with percentage deviation above 20%.
- Fresh run: 153,436 samples; AUC 0.98048525; F1 0.93452323 at threshold 0.50.
- Deployed model on the identical held-out set: AUC 0.98054920; F1 0.93373396.
- The deployed model remains the source of truth. It was not overwritten.

### Different from the manuscript

The manuscript claims AUC 0.9798, F1 0.9351, and validation confusion counts TN=14363, FP=738, FN=1251, TP=14330. The verified deployed model produced validation counts TN=14364, FP=743, FN=1286, TP=14295. These are not exact matches.

The fresh and deployed classifiers are functionally close but not identical: 182 of 30,688 held-out predictions differed. The fresh run produced TN=14391, FP=716, FN=1287, TP=14294.

## Layer 2: Published degradation validation

### Verified

- The current SMRT dataset contains caffeine at dataset PubChem ID 245687, with RT 643.8 seconds.
- The expected PubChem ID 2519 was not present.
- The paper's stated 437.1-second anchor is not the caffeine value in the current dataset.
- The frozen deployed `verify_from_smiles()` interface was run on all 15 records using the paper's stated per-paper anchor normalization rule and the dataset-derived 643.8-second destination anchor.
- Methylxanthine records used a same-paper caffeine anchor.
- Salicylate records used the same-paper sample median fallback.

### Actual result

- Accuracy: 13/15 = 86.6667%
- FPR: 2/6 = 33.3333%
- TP=9, TN=4, FP=2, FN=0
- Both aspirin records labeled GENUINE were classified ANOMALY.

### Evidence limitation

The notebook's numeric records cite Ribeiro 2019, Acheampong 2016, Srdjenovic 2008, Scott & Marks 1984, Singh 2012, and Musumeci 2021. They do not match the manuscript's cited Martínez-López 2014, Sherikar and Mehta, and Kowalska et al. 2021 sources. The exact numeric RT values could not be traced to the specified source tables from the accessible material, so they remain unverified and are not treated as confirmed literature measurements.

The manuscript claim of 100% accuracy and 0% FPR is therefore not reproduced by the corrected run.

## Layer 3: RepoRT multi-laboratory validation

### Status: not completed

The RepoRT paper was identified as Kretschmer et al., Nature Methods 21, 153-155 (2024), DOI `10.1038/s41592-023-02143-z`.

A time-boxed search through the paper metadata, GitHub repository search/API, and Zenodo search did not locate an official downloadable RepoRT dataset or release with the required 88,325 rows and dataset/compound identifiers. The 1,000-sample grouping and labeling protocol was therefore not run.

No RepoRT AUC, detection rate, or FPR is reported. The manuscript's claimed AUC 0.9412, detection 89.4%, and FPR 5.1% remain unverified.

## Final assessment

The synthetic classifier pipeline is reproducible and broadly consistent with the manuscript, but its exact reported metrics are not reproduced. The Layer 2 claim is contradicted by the dataset-grounded anchor and corrected normalization run, and its source RT values are not traceable to the manuscript's stated citations. Layer 3 could not be completed because the official input dataset was not located; no substitute dataset was used.

No current `ai/api.py`, blockchain integration, deployed model, or metadata file was modified during this reconciliation.
