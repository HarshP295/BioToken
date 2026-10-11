"""The lab sample files in samples/hplc behave as documented.

Each lab file goes through the steps behind the Lab Dashboard: peak
extraction, comparison with its batch's Gold Standard (the circuit's
constraint) and the AI verdict (/verify with the reagent SMILES).
The Groth16 side is covered by samples/hplc/check_samples.mjs.
"""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api import app

client = TestClient(app)

SAMPLES = Path(__file__).resolve().parents[2] / "samples" / "hplc"
MANIFEST = json.loads((SAMPLES / "manifest.json").read_text(encoding="utf-8"))
LAB_SAMPLES = MANIFEST["lab"]


def _peaks(rel_path: str) -> list[int]:
    path = SAMPLES / rel_path
    response = client.post("/extract-peaks", files={"file": (path.name, path.read_bytes(), "text/csv")})
    assert response.status_code == 200, response.text
    return response.json()["peaks"]


@pytest.mark.parametrize("sample", LAB_SAMPLES, ids=[s["file"] for s in LAB_SAMPLES])
def test_lab_sample(sample):
    lab, gold = _peaks(sample["file"]), _peaks(sample["gold_file"])
    matches = all(abs(a - b) <= MANIFEST["tolerance"] for a, b in zip(lab, gold))
    assert matches is sample["expected_match"]

    verdict = client.post("/verify", json={
        "smiles": sample["smiles"], "observed_rt": sample["observed_rt_s"], "token_id": 0,
    }).json()
    assert verdict["result"] == sample["expected_ai"], verdict
