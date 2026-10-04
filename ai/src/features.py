"""RDKit molecular feature computation for BioToken verification."""

from rdkit import Chem, RDLogger
from rdkit.Chem import AllChem, Descriptors, rdMolDescriptors

RDLogger.DisableLog("rdApp.*")

# Column order of data/SMRT_features_v2.csv (notebooks/01_eda.ipynb). The RT
# scaler/predictor and the anomaly classifier were fitted on this exact order,
# so it must not be changed without retraining (verifier.py checks it at load).
PHYS_FEATURES = [
    "mol_weight",
    "logp",
    "hbd",
    "hba",
    "tpsa",
    "rotatable_bonds",
    "heavy_atom_count",
    "ring_count",
    "aromatic_rings",
]

FP_FEATURES = [f"fp_{i}" for i in range(128)]

ALL_FEATURES = PHYS_FEATURES + FP_FEATURES


def inchi_to_mol(inchi: str) -> Chem.Mol | None:
    """Convert an InChI string to an RDKit Mol, or None on failure."""
    if not inchi or not isinstance(inchi, str):
        return None
    try:
        mol = Chem.MolFromInchi(inchi.strip())
        return mol
    except Exception:
        return None


def compute_features(mol: Chem.Mol) -> dict:
    """Compute 137 molecular features: 9 physicochemical + 128 Morgan fingerprint bits."""
    features = {
        "mol_weight": Descriptors.MolWt(mol),
        "logp": Descriptors.MolLogP(mol),
        "hbd": rdMolDescriptors.CalcNumHBD(mol),
        "hba": rdMolDescriptors.CalcNumHBA(mol),
        "tpsa": Descriptors.TPSA(mol),
        "rotatable_bonds": rdMolDescriptors.CalcNumRotatableBonds(mol),
        "heavy_atom_count": mol.GetNumHeavyAtoms(),
        "ring_count": rdMolDescriptors.CalcNumRings(mol),
        "aromatic_rings": rdMolDescriptors.CalcNumAromaticRings(mol),
    }

    fp = AllChem.GetMorganFingerprintAsBitVect(mol, radius=2, nBits=128)
    for i in range(128):
        features[f"fp_{i}"] = int(fp[i])

    return {key: features[key] for key in ALL_FEATURES}


def smiles_to_mol(smiles: str) -> Chem.Mol | None:
    """Convert a SMILES string to an RDKit Mol, or None on failure."""
    if not smiles or not isinstance(smiles, str):
        return None
    try:
        mol = Chem.MolFromSmiles(smiles.strip())
        return mol
    except Exception:
        return None


def features_dict_to_list(features: dict) -> list[float]:
    """Convert a feature dict to a list in canonical ALL_FEATURES order."""
    return [float(features[key]) for key in ALL_FEATURES]
