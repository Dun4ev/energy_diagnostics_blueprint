from __future__ import annotations

import csv
import gzip
import json
import tracemalloc
from collections import Counter
from datetime import datetime, timedelta, timezone
from itertools import islice
from pathlib import Path

from packages.ingestion import SyntheticAdapter

ROOT = Path(__file__).resolve().parents[2]
OBSERVATIONS = ROOT / "data" / "observations"
START = datetime(2026, 6, 24, 7, 40, tzinfo=timezone.utc)


def test_assets_and_sources_use_canonical_channel_ids() -> None:
    adapter = SyntheticAdapter(OBSERVATIONS)

    assets = adapter.assets()
    sources = adapter.sources()

    assert len(assets) == 9
    assert len(sources) == 37
    assert {source.sourceId for source in sources if source.assetId == "tp177-t1"} == {
        "tp177-t1:load",
        "tp177-t1:ambient",
        "tp177-t1:primary_a",
        "tp177-t1:independent_a",
        "tp177-t1:phase_b",
    }
    breaker = next(source for source in sources if source.sourceId == "rp4-breaker:event")
    cable = next(source for source in sources if source.sourceId == "kl10-section:daily")
    assert (breaker.metric, breaker.unit, breaker.frequencySeconds) == ("closing_time", "ms", None)
    assert (cable.metric, cable.unit, cable.frequencySeconds) == (
        "relative_pd_indicator",
        "dB_ref_demo",
        86400,
    )


def test_replay_cutoffs_prevent_future_event_and_receipt_leakage() -> None:
    adapter = SyntheticAdapter(OBSERVATIONS)

    values = list(
        adapter.observations(
            scenario_run_id="cutoff-test",
            as_of=START,
            received_as_of=START + timedelta(minutes=1),
        )
    )

    assert (
        len(values) == 37
    )  # Five channels for seven transformers, one event and one daily sample.
    assert all(item.eventTime <= START for item in values)
    assert all(item.receivedAt <= START + timedelta(minutes=1) for item in values)
    assert {item.scenarioRunId for item in values} == {"cutoff-test"}

    lower_bound = START + timedelta(days=1)
    recent = list(
        adapter.observations(
            scenario_run_id="window-test",
            since=lower_bound,
            as_of=lower_bound,
            received_as_of=lower_bound + timedelta(minutes=1),
        )
    )
    assert len(recent) == 37
    assert all(item.eventTime == lower_bound for item in recent)


def test_transport_fixture_deduplicates_33_packets_and_keeps_late_receipt() -> None:
    adapter = SyntheticAdapter(OBSERVATIONS)

    measurements = list(adapter.transport_fault_observations())

    assert len(measurements) == 30
    assert all(item.sourceId == "tp177-t1:primary_a" for item in measurements)
    late = next(item for item in measurements if item.measurementId == "tp177-t1-000011-a")
    assert late.receivedAt - late.eventTime == timedelta(minutes=20)
    assert late.measurementId == "tp177-t1-000011-a"


def test_normalized_transport_rejects_incompatible_unit_with_raw_reference(tmp_path: Path) -> None:
    source = json.loads(
        (OBSERVATIONS / "transport_fault_examples.jsonl").read_text().splitlines()[0]
    )
    source["unit"] = "ms"
    (tmp_path / "transport_fault_examples.jsonl").write_text(
        json.dumps(source) + "\n", encoding="utf-8"
    )
    adapter = SyntheticAdapter(tmp_path)

    assert list(adapter.transport_fault_observations()) == []
    assert len(adapter.quarantine_records) == 1
    rejected = adapter.quarantine_records[0]
    assert rejected.raw_record_ref == "transport_fault_examples.jsonl#L1"
    assert "metric/unit mismatch" in rejected.reason
    assert dict(rejected.raw_record)["unit"] == "ms"


def test_streams_all_channels_with_bounded_python_memory_and_repeatable_order() -> None:
    adapter = SyntheticAdapter(OBSERVATIONS)
    first_order = [
        item.measurementId
        for item in islice(
            adapter.observations(
                scenario_run_id="stable-run",
                as_of=START + timedelta(days=30),
                received_as_of=START + timedelta(days=31),
            ),
            20,
        )
    ]
    repeated_order = [
        item.measurementId
        for item in islice(
            adapter.observations(
                scenario_run_id="stable-run",
                as_of=START + timedelta(days=30),
                received_as_of=START + timedelta(days=31),
            ),
            20,
        )
    ]
    assert first_order == repeated_order

    tracemalloc.start()
    counts: Counter[str] = Counter()
    for item in adapter.observations(
        scenario_run_id="memory-run",
        as_of=START + timedelta(days=30),
        received_as_of=START + timedelta(days=31),
    ):
        counts[item.sourceId] += 1
    _, peak_bytes = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    assert sum(counts.values()) == 302497
    assert counts["rp4-breaker:event"] == 31
    assert counts["kl10-section:daily"] == 31
    assert peak_bytes < 32 * 1024 * 1024


def _write_small_observation_set(directory: Path) -> None:
    directory.mkdir()
    (directory / "assets.json").write_text(
        json.dumps(
            [
                {
                    "assetId": "demo-t1",
                    "name": "Demo transformer",
                    "assetType": "transformer",
                    "siteId": "demo-site",
                    "measurementLocation": "Synthetic phase A contact",
                    "demoConsequenceWeight": 0.5,
                    "thermalCalibration": {"aC": 4.0, "bC": 60.0, "tauHours": 2.0},
                    "origin": "synthetic",
                }
            ]
        ),
        encoding="utf-8",
    )
    fields = [
        "record_id",
        "asset_id",
        "event_time",
        "received_at",
        "origin",
        "load_fraction",
        "ambient_c",
        "temp_a_c",
        "independent_a_c",
        "temp_b_c",
        "temp_a_quality",
        "other_quality",
    ]
    valid = {
        "record_id": "demo-t1-000001",
        "asset_id": "demo-t1",
        "event_time": "2026-06-24T07:40:00Z",
        "received_at": "2026-06-24T07:40:03Z",
        "origin": "synthetic",
        "load_fraction": "0.6",
        "ambient_c": "22.0",
        "temp_a_c": "",
        "independent_a_c": "48.0",
        "temp_b_c": "47.0",
        "temp_a_quality": "missing",
        "other_quality": "good",
    }
    bad_time = {**valid, "record_id": "demo-t1-000002", "event_time": "2026-06-24T07:41:00Z"}
    bad_time["received_at"] = "2026-06-24T07:40:00Z"
    with gzip.open(
        directory / "transformer_readings.csv.gz", "wt", encoding="utf-8", newline=""
    ) as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        writer.writerow(valid)
        writer.writerow(bad_time)
    (directory / "breaker_events.json").write_text("[]", encoding="utf-8")
    (directory / "cable_daily_measurements.json").write_text("[]", encoding="utf-8")


def test_empty_primary_temperature_is_missing_and_future_timestamp_is_quarantined(
    tmp_path: Path,
) -> None:
    data_dir = tmp_path / "observations"
    _write_small_observation_set(data_dir)
    adapter = SyntheticAdapter(data_dir)

    measurements = list(
        adapter.observations(
            scenario_run_id="small-run",
            as_of=START + timedelta(days=1),
            received_as_of=START + timedelta(days=1),
        )
    )

    primary_a = next(item for item in measurements if item.sourceId == "demo-t1:primary_a")
    assert primary_a.value is None
    assert primary_a.quality == "missing"
    assert len(adapter.quarantine_records) == 1
    assert adapter.quarantine_records[0].raw_record_ref.endswith("demo-t1-000002")
    assert adapter.quarantine_records[0].reason == "event_after_received"
