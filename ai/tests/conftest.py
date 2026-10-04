"""Make `ai/` importable so tests can use `src.*` and `api` like the server does."""

import sys
from pathlib import Path

AI_DIR = Path(__file__).resolve().parent.parent
if str(AI_DIR) not in sys.path:
    sys.path.insert(0, str(AI_DIR))
