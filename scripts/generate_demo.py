#!/usr/bin/env python3
"""Generate deterministic synthetic observations, never field telemetry.

Python 3.10+, standard library only. Outputs observations and separately isolated
truth; the latter must not be mounted into the diagnostic runtime. No network.
The thermal model is an illustrative teaching model, not an OEM/IEC model.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import io
import json
import math
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

VERSION = "demo-generator-0.1.0"
SEED = 20260925
END = datetime(2026, 7, 24, 7, 40, tzinfo=timezone.utc)
PROFILES = [
    ("tp177-t1", "ТП-177 / Т-1", "progressive_heat", 0.8),
    ("tp204-t2", "ТП-204 / Т-2", "healthy", 0.4),
    ("tp305-t1", "ТП-305 / Т-1", "load_step", 0.6),
    ("tp306-t1", "ТП-306 / Т-1", "sensor_drift", 0.6),
    ("tp307-t1", "ТП-307 / Т-1", "data_quality", 0.5),
    ("tp308-t1", "ТП-308 / Т-1", "post_intervention", 0.7),
    ("tp309-t1", "ТП-309 / Т-1", "accelerating_heat", 0.8),
]
FIELDS = ["record_id", "asset_id", "event_time", "received_at", "origin",
          "load_fraction", "ambient_c", "temp_a_c", "independent_a_c", "temp_b_c",
          "temp_a_quality", "other_quality"]


def iso(dt: datetime) -> str:
    return dt.isoformat(timespec="seconds").replace("+00:00", "Z")


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def write_gzip_csv(path: Path, fieldnames: list[str], rows: Any) -> int:
    """mtime=0 and empty filename make the compressed bytes reproducible."""
    count = 0
    with path.open("wb") as raw:
        with gzip.GzipFile(filename="", fileobj=raw, mode="wb", mtime=0) as gz:
            with io.TextIOWrapper(gz, encoding="utf-8", newline="") as text:
                writer = csv.DictWriter(text, fieldnames=fieldnames, lineterminator="\n")
                writer.writeheader()
                for row in rows:
                    writer.writerow(row)
                    count += 1
    return count


def build(out: Path, seed: int = SEED, days: int = 30) -> dict[str, Any]:
    if not 14 <= days <= 365:
        raise ValueError("days must be between 14 and 365")
    out.mkdir(parents=True, exist_ok=True)
    # Refuse unknown existing contents rather than overwrite arbitrary user files.
    if any(out.iterdir()):
        raise FileExistsError(f"Output directory must be empty: {out}")
    obs, truth = out / "observations", out / "truth"
    obs.mkdir(); truth.mkdir()
    start = END - timedelta(days=days)
    steps = days * 24 * 12 + 1
    assets: list[dict[str, Any]] = []
    for aid, name, _, consequence in PROFILES:
        assets.append({"assetId": aid, "name": name, "assetType": "transformer",
                       "siteId": "demo-site", "voltageLabel": "10/0.4 kV",
                       "measurementLocation": "synthetic phase A contact; not a real installed sensor",
                       "demoConsequenceWeight": consequence,
                       "thermalCalibration": {"aC": 4, "bC": 60, "tauHours": 2},
                       "origin": "synthetic"})
    assets += [
        {"assetId": "rp4-breaker", "name": "РП-4 / выключатель", "assetType": "breaker", "siteId": "demo-site", "origin": "synthetic"},
        {"assetId": "kl10-section", "name": "КЛ-10 кВ / участок", "assetType": "cable", "siteId": "demo-site", "origin": "synthetic"},
    ]
    write_json(obs / "assets.json", assets)
    truth_rows: list[dict[str, Any]] = []
    final_observations: dict[str, Any] = {}
    normalized_sample: list[dict[str, Any]] = []

    def rows():
        for j, (aid, _, profile, _) in enumerate(PROFILES):
            rng = random.Random(seed + 1009 * (j + 1))
            theta = 4 + 60 * 0.60**2
            noise = 0.0
            previous_value = 0.0
            held_value: float | None = None
            for i in range(steps):
                t = start + timedelta(minutes=5 * i)
                elapsed = i / 288
                # Scale fault timing for the optional --days setting.
                pday = elapsed * 30 / days
                hour = t.hour + t.minute / 60
                ambient = 24 + 5 * math.sin(2 * math.pi * (hour - 9) / 24) + 1.3 * math.sin(elapsed / 3)
                load = 0.59 + 0.10 * math.sin(2 * math.pi * (hour - 6) / 24) + 0.02 * math.sin(elapsed / 2)
                if profile == "load_step" and pday >= 18:
                    load += 0.20
                load = max(0.25, min(0.97, load + rng.gauss(0, 0.004)))
                alpha = 1 - math.exp(-(5 / 60) / 2)
                theta += alpha * (4 + 60 * load * load - theta)
                expected = ambient + theta
                true_heat = 0.0
                sensor_bias = 0.0
                if profile == "progressive_heat":
                    true_heat = max(0.0, (pday - 16) / 14) * 12
                elif profile == "sensor_drift":
                    sensor_bias = max(0.0, (pday - 18) / 12) * 12
                elif profile == "accelerating_heat":
                    true_heat = max(0.0, (pday - 24) / 6) ** 2 * 15
                elif profile == "post_intervention":
                    true_heat = max(0.0, (pday - 14) / 12) * 12 if pday < 26 else 12 * math.exp(-(pday - 26) / 0.7)
                noise = 0.78 * noise + rng.gauss(0, 0.13)
                temp_a: float | None = expected + true_heat + sensor_bias + noise
                independent = expected + true_heat + rng.gauss(0, 0.18)
                temp_b = expected - 0.8 + rng.gauss(0, 0.16)
                quality = "good"
                injected = "none"
                if profile == "data_quality":
                    if 12 <= pday < 12.17 or pday >= 29.6:
                        temp_a, quality, injected = None, "missing", "dropout"
                    elif 24 <= pday < 24.09:
                        if held_value is None:
                            held_value = previous_value
                        temp_a, quality, injected = held_value, "good", "stuck_unflagged"
                    elif i == int(18 * days / 30 * 288):
                        temp_a, quality, injected = temp_a + 35, "good", "spike_unflagged"
                event_id = f"{aid}-{i:06d}"
                row = {"record_id": event_id, "asset_id": aid, "event_time": iso(t),
                       "received_at": iso(t + timedelta(seconds=rng.randrange(0, 21))),
                       "origin": "synthetic", "load_fraction": round(load, 6),
                       "ambient_c": round(ambient, 4), "temp_a_c": "" if temp_a is None else round(temp_a, 4),
                       "independent_a_c": round(independent, 4), "temp_b_c": round(temp_b, 4),
                       "temp_a_quality": quality, "other_quality": "good"}
                # Hold hourly hidden truth, not every transport packet.
                if i % 12 == 0 or i == steps - 1:
                    truth_rows.append({"record_id": event_id, "asset_id": aid,
                                       "event_time": iso(t), "expected_c": round(expected, 4),
                                       "true_extra_heat_c": round(true_heat, 4), "sensor_bias_c": round(sensor_bias, 4),
                                       "injected_transport_or_sensor_fault": injected, "profile": profile})
                if j == 0 and i < 30:
                    normalized_sample.append({"schemaVersion": "0.1.0", "measurementId": event_id + "-a",
                                              "assetId": aid, "sourceId": aid + "-temp-a", "metric": "contact_temperature",
                                              "eventTime": row["event_time"], "receivedAt": row["received_at"],
                                              "value": row["temp_a_c"], "unit": "degC", "quality": quality,
                                              "origin": "synthetic", "scenarioRunId": f"demo-seed-{seed}"})
                if i == steps - 1:
                    final_observations[aid] = row
                if temp_a is not None:
                    previous_value = temp_a
                yield row

    row_count = write_gzip_csv(obs / "transformer_readings.csv.gz", FIELDS, rows())
    truth_fields = list(truth_rows[0])
    truth_count = write_gzip_csv(truth / "hidden_hourly_state.csv.gz", truth_fields, truth_rows)
    write_json(obs / "normalized_measurement_examples.json", normalized_sample)
    write_json(truth / "final_observations_for_validation.json", final_observations)
    write_json(truth / "scenario_labels.json", [
        {"assetId": aid, "profile": profile, "expectedReview": {
            "healthy": "normal observation, no invented defect",
            "progressive_heat": "increasing residual, request independent verification",
            "load_step": "normal model-adjusted residual despite temperature rise",
            "sensor_drift": "sensor discrepancy; do not confirm contact defect",
            "data_quality": "unknown latest assessment, request source recovery",
            "post_intervention": "recovered signal; closure still needs human verification",
            "accelerating_heat": "short-window growth exceeds long-window growth; escalate review"
        }[profile]} for aid, _, profile, _ in PROFILES
    ])
    rng = random.Random(seed + 9973)
    breaker, cable = [], []
    for d in range(days + 1):
        event_time = start + timedelta(days=d)
        pday = d * 30 / days
        breaker.append({"eventId": f"breaker-{d:03d}", "assetId": "rp4-breaker",
                        "operation": "close", "eventTime": iso(event_time),
                        "closingTimeMs": round(70 + max(0, (pday - 23) / 7) * 180 + rng.gauss(0, 2), 3),
                        "unit": "ms", "origin": "synthetic"})
        cable.append({"sampleId": f"cable-{d:03d}", "assetId": "kl10-section",
                      "eventTime": iso(event_time), "relativePdIndicatorDb": round(7 + max(0, (pday - 23) / 7) * 5 + rng.gauss(0, 0.15), 3),
                      "reference": "synthetic_device_reference_only", "unit": "dB_ref_demo", "origin": "synthetic"})
    write_json(obs / "breaker_events.json", breaker)
    write_json(obs / "cable_daily_measurements.json", cable)
    write_json(obs / "evidence.json", [
        {"evidenceId": "ev-ir-177", "assetId": "tp177-t1", "kind": "thermography_request_context",
         "observedAt": iso(END - timedelta(days=3)), "origin": "synthetic",
         "hasImage": False, "uri": None, "verified": False,
         "summary": "Демонстрационная запись: реальная термограмма не приложена. Не использовать как подтверждение контактного дефекта."},
        {"evidenceId": "ev-action-308", "assetId": "tp308-t1", "kind": "intervention_note",
         "observedAt": iso(start + timedelta(days=days * 26 / 30)), "origin": "synthetic",
         "hasImage": False, "uri": None, "verified": False,
         "summary": "Сценарная запись о вмешательстве; для закрытия требуются результаты контрольной проверки."},
    ])
    faults = []
    for i, m in enumerate(normalized_sample):
        item = dict(m)
        if i % 11 == 0:
            item["receivedAt"] = iso(datetime.fromisoformat(m["eventTime"].replace("Z", "+00:00")) + timedelta(minutes=20))
        faults.append(item)
        if i in (4, 12, 20):
            dup = dict(item)
            dup["receivedAt"] = iso(datetime.fromisoformat(item["receivedAt"].replace("Z", "+00:00")) + timedelta(seconds=30))
            faults.append(dup)
    faults.sort(key=lambda r: r["receivedAt"])
    with (obs / "transport_fault_examples.jsonl").open("w", encoding="utf-8") as f:
        for row in faults:
            f.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
    write_json(truth / "transport_expectations.json", {"inputPackets": len(faults), "uniqueMeasurementIds": 30,
                                                       "duplicatePackets": 3, "latePacketsExist": True})
    files = {}
    for path in sorted(out.rglob("*")):
        if path.is_file():
            files[path.relative_to(out).as_posix()] = {"sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "bytes": path.stat().st_size}
    manifest = {"generatorVersion": VERSION, "seed": seed, "origin": "synthetic",
                "notFieldValidated": True, "start": iso(start), "end": iso(END), "stepSeconds": 300,
                "days": days, "assetCount": len(assets), "transformerCount": len(PROFILES),
                "transformerWideRows": row_count, "hiddenHourlyRows": truth_count,
                "breakerEventCount": len(breaker), "cableSampleCount": len(cable),
                "files": files}
    write_json(out / "manifest.json", manifest)
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True, help="New or empty destination directory")
    parser.add_argument("--seed", type=int, default=SEED)
    parser.add_argument("--days", type=int, default=30)
    args = parser.parse_args()
    try:
        result = build(args.out.resolve(), args.seed, args.days)
    except (ValueError, FileExistsError, OSError) as exc:
        parser.exit(2, f"Cannot generate demo: {exc}\n")
    print(json.dumps({k: result[k] for k in ("seed", "assetCount", "transformerWideRows", "breakerEventCount", "cableSampleCount")}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
