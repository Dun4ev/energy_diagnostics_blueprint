"""Rebuild in a second temporary DB and compare numerical results to the package.

Run from the project root with the runtime dependencies installed. IDs and
audit timestamps intentionally differ across independent recordings.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from scripts.prepare_stand import prepare  # noqa: E402

first = json.loads((ROOT / "apps/web/public/stand-data.json").read_text(encoding="utf-8"))
second = prepare()
for name in ("early", "late"):
    old = first["slices"][name]
    new = second["slices"][name]
    assert old["virtualTime"] == new["virtualTime"]
    for asset in ("tp177-t1", "tp305-t1", "tp307-t1"):
        a = next(item for item in old["risks"] if item["asset"]["assetId"] == asset)["analysis"]
        b = next(item for item in new["risks"] if item["asset"]["assetId"] == asset)["analysis"]
        for field in ("metrics", "risk", "quality", "status", "modelVersion", "policyVersion"):
            assert a[field] == b[field], (name, asset, field)
    assert old["series"] == new["series"], name
assert [x["durationSeconds"] for x in first["scenes"]] == [x["durationSeconds"] for x in second["scenes"]]
print("Independent recording: selected asset analyses and both series match.")
