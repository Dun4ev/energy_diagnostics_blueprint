"""Deterministic contract export/drift check; no network or data/truth input."""

import argparse
import json
from pathlib import Path

from apps.api.main import app
from packages.domain_contracts import models as m
from packages.domain_contracts.workflow import (
    CASE_PERMISSION,
    CASE_TRANSITIONS,
    PLAN_PERMISSION,
    PLAN_TRANSITIONS,
    ROLE_PERMISSIONS,
)

ROOT = Path(__file__).resolve().parents[2]


def dumps(value):
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def artifacts():
    openapi = app.openapi()
    outputs = {"contracts/openapi.json": openapi}
    for name, model in [("measurement", m.Measurement), ("analysis", m.AnalysisResult)]:
        outputs[f"contracts/{name}.schema.json"] = {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            **model.model_json_schema(),
        }
    outputs["contracts/workflow.json"] = {
        "caseTransitions": {k: sorted(v) for k, v in CASE_TRANSITIONS.items()},
        "planTransitions": {k: sorted(v) for k, v in PLAN_TRANSITIONS.items()},
        "rolePermissions": {k: sorted(v) for k, v in ROLE_PERMISSIONS.items()},
        "caseTargetPermission": CASE_PERMISSION,
        "planTargetPermission": PLAN_PERMISSION,
        "explicitGrantOnly": ["case.confirm"],
    }
    return outputs


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    stale = []
    for name, data in artifacts().items():
        path = ROOT / name
        content = dumps(data)
        if args.check:
            if not path.exists() or path.read_text() != content:
                stale.append(name)
        else:
            path.write_text(content)
    if stale:
        raise SystemExit("Contract drift: " + ", ".join(stale))
    print("Contract exports match" if args.check else "Contract exports generated")


if __name__ == "__main__":
    main()
