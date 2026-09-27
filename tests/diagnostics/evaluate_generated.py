"""Independent synthetic evaluation using observations only; never opens truth/."""

from __future__ import annotations

import csv
import gzip
import json
from collections import defaultdict, deque
from datetime import datetime, timedelta
from pathlib import Path
from statistics import median

from packages.diagnostics import DeterministicAnalyzer
from packages.domain_contracts.models import Asset, DiagnosticPolicy, Measurement

ROOT = Path(__file__).parents[2]
POLICY = DiagnosticPolicy.model_validate_json(
    (ROOT / "config/diagnostic-policy.demo.json").read_text()
)
CHANNELS = {
    "load": ("load_fraction", "fraction", "load_fraction", "other_quality"),
    "ambient": ("ambient_temperature", "degC", "ambient_c", "other_quality"),
    "primary_a": ("contact_temperature", "degC", "temp_a_c", "temp_a_quality"),
    "independent_a": ("contact_temperature", "degC", "independent_a_c", "other_quality"),
    "phase_b": ("contact_temperature", "degC", "temp_b_c", "other_quality"),
}


def main() -> None:
    assets_raw = json.loads((ROOT / "data/observations/assets.json").read_text())
    assets = {}
    for raw in assets_raw:
        if raw.get("thermalCalibration"):
            assets[raw["assetId"]] = Asset(
                assetId=raw["assetId"], name=raw["name"], assetType=raw["assetType"],
                siteId=raw["siteId"], parentId=None,
                measurementLocation=raw["measurementLocation"],
                demoConsequenceWeight=float(raw["demoConsequenceWeight"]),
                calibration=raw["thermalCalibration"],
            )
    rows = defaultdict(lambda: deque(maxlen=1300))
    with gzip.open(ROOT / "data/observations/transformer_readings.csv.gz", "rt") as handle:
        for row in csv.DictReader(handle):
            if row["asset_id"] in assets:
                rows[row["asset_id"]].append(row)

    report = {}
    for asset_id, window in sorted(rows.items()):
        observations = []
        for row in window:
            when = datetime.fromisoformat(row["event_time"].replace("Z", "+00:00"))
            received = datetime.fromisoformat(row["received_at"].replace("Z", "+00:00"))
            for channel, (metric, unit, column, quality_column) in CHANNELS.items():
                value = float(row[column]) if row[column] else None
                observations.append(Measurement(
                    schemaVersion="0.1.0", measurementId=f"{row['record_id']}:{channel}",
                    assetId=asset_id, sourceId=f"{asset_id}:{channel}", metric=metric,
                    eventTime=when, receivedAt=received, value=value, unit=unit,
                    quality=row[quality_column], origin="synthetic",
                    scenarioRunId="demo-seed-20260925",
                ))
        last = datetime.fromisoformat(window[-1]["event_time"].replace("Z", "+00:00"))
        as_of = last + timedelta(seconds=60)
        bundle, series = DeterministicAnalyzer().analyze_series(
            observations, assets[asset_id], POLICY, as_of=as_of, received_as_of=as_of
        )
        result = bundle.analysis
        report[asset_id] = {
            "status": result.status,
            "residualC": result.metrics.residualC,
            "slopeCPerDay": result.metrics.slopeCPerDay,
            "score": result.risk.score,
            "hypotheses": [h.code for h in result.hypotheses],
            "issues": result.quality.issues,
            "trends": [t.model_dump() for t in bundle.details.trends],
            "medianAbsResidualC": median(
                abs(p.residualC) for p in series if p.residualC is not None
            ) if any(p.residualC is not None for p in series) else None,
            "latestPrimaryIndependentDifferenceC": (
                float(window[-1]["temp_a_c"]) - float(window[-1]["independent_a_c"])
                if window[-1]["temp_a_c"] and window[-1]["independent_a_c"] else None
            ),
        }
    assert report["tp177-t1"]["residualC"] > 8
    assert 0.4 <= report["tp177-t1"]["slopeCPerDay"] <= 1.4
    for asset_id in ("tp204-t2", "tp305-t1"):
        assert report[asset_id]["medianAbsResidualC"] <= 1
        assert report[asset_id]["slopeCPerDay"] <= 0.5
        assert report[asset_id]["status"] == "normal"
    assert report["tp306-t1"]["hypotheses"] == ["SENSOR_DISAGREEMENT"]
    assert abs(report["tp306-t1"]["latestPrimaryIndependentDifferenceC"]) > 8
    assert report["tp306-t1"]["score"] is None
    assert report["tp307-t1"]["status"] == "insufficient_data"
    assert report["tp308-t1"]["residualC"] < 2
    assert report["tp309-t1"]["trends"][0]["slopeCPerDay"] > report["tp309-t1"]["slopeCPerDay"]
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
