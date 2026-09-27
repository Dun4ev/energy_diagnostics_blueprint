"""Streaming adapter for the checked-in synthetic observation fixtures.

This module reads only the directory passed to ``SyntheticAdapter``. It has no
device, network, truth-data, analysis, or workflow integration.
"""

from __future__ import annotations

import csv
import gzip
import hashlib
import json
import math
import sqlite3
import tempfile
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Iterator, Mapping

from pydantic import ValidationError

from packages.domain_contracts.models import Asset, Measurement, Source

_QUALITY_VALUES = {"good", "missing", "suspect", "invalid"}
_CHANNELS = (
    ("load", "load_fraction", "fraction", "load_fraction", "other_quality"),
    ("ambient", "ambient_temperature", "degC", "ambient_c", "other_quality"),
    ("primary_a", "contact_temperature", "degC", "temp_a_c", "temp_a_quality"),
    ("independent_a", "contact_temperature", "degC", "independent_a_c", "other_quality"),
    ("phase_b", "contact_temperature", "degC", "temp_b_c", "other_quality"),
)
_CHANNEL_BY_LEGACY_SUFFIX = {
    "-load": "load",
    "-ambient": "ambient",
    "-temp-a": "primary_a",
    "-independent-a": "independent_a",
    "-temp-b": "phase_b",
    ":load": "load",
    ":ambient": "ambient",
    ":primary_a": "primary_a",
    ":independent_a": "independent_a",
    ":phase_b": "phase_b",
    ":event": "event",
    ":daily": "daily",
}


@dataclass(frozen=True, slots=True)
class QuarantineRecord:
    """A rejected input record, with a stable source reference and reason."""

    raw_record_ref: str
    reason: str
    raw_record: tuple[tuple[str, str], ...]


@dataclass(frozen=True, slots=True)
class _Candidate:
    measurement: Measurement
    raw_record_ref: str
    raw_record: Mapping[str, object]


QuarantineSink = Callable[[QuarantineRecord], None]


def _utc_datetime(value: datetime, name: str) -> datetime:
    if not isinstance(value, datetime) or value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{name} must be timezone-aware")
    return value.astimezone(timezone.utc)


def _parse_time(value: object, field: str) -> datetime:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str) and value.strip():
        try:
            parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError(f"invalid_{field}") from exc
    else:
        raise ValueError(f"missing_{field}")
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError(f"timezone_required_{field}")
    return parsed.astimezone(timezone.utc)


def _number(value: object, field: str) -> float | None:
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    if isinstance(value, bool):
        raise ValueError(f"invalid_number_{field}")
    try:
        parsed = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"invalid_number_{field}") from exc
    if not math.isfinite(parsed):
        raise ValueError(f"invalid_number_{field}")
    return parsed


def _raw_pairs(record: Mapping[str, object]) -> tuple[tuple[str, str], ...]:
    pairs: list[tuple[str, str]] = []
    for key, value in sorted(record.items(), key=lambda item: str(item[0])):
        if isinstance(value, (dict, list)):
            rendered = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        else:
            rendered = "" if value is None else str(value)
        pairs.append((str(key), rendered))
    return tuple(pairs)


def _validation_reason(exc: ValidationError) -> str:
    messages = sorted({str(error.get("msg", "invalid value")) for error in exc.errors()})
    return "measurement_validation:" + ";".join(messages)


class SyntheticAdapter:
    """Read the supplied observations directory as validated contract DTOs.

    Measurement IDs derived from wide CSV rows retain the raw ``record_id`` as
    a prefix (``record_id:channel``). The optional quarantine sink can persist
    rejected rows as they are encountered; ``quarantine_records`` exposes the
    last 1000 records from the most recently started read for diagnostics.
    """

    def __init__(
        self,
        observations_dir: str | Path,
        *,
        quarantine_sink: QuarantineSink | None = None,
    ) -> None:
        self.observations_dir = Path(observations_dir)
        self._quarantine_sink = quarantine_sink
        self._quarantine_records: deque[QuarantineRecord] = deque(maxlen=1000)

    @property
    def quarantine_records(self) -> tuple[QuarantineRecord, ...]:
        return tuple(self._quarantine_records)

    def _begin_read(self) -> None:
        self._quarantine_records.clear()

    def _quarantine(
        self,
        raw_record_ref: str,
        reason: str,
        raw_record: Mapping[str, object],
    ) -> None:
        record = QuarantineRecord(raw_record_ref, reason, _raw_pairs(raw_record))
        self._quarantine_records.append(record)
        if self._quarantine_sink is not None:
            self._quarantine_sink(record)

    def _asset_records(self) -> list[tuple[Mapping[str, object], Asset]]:
        path = self.observations_dir / "assets.json"
        raw_assets = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(raw_assets, list):
            raise ValueError("assets.json must contain a JSON array")

        result: list[tuple[Mapping[str, object], Asset]] = []
        seen: set[str] = set()
        location_defaults = {
            "breaker": "Синтетические события операций выключателя",
            "cable": "Синтетическая суточная точка измерения кабельного участка",
        }
        for index, raw in enumerate(raw_assets):
            if not isinstance(raw, dict):
                raise ValueError(f"assets.json item {index} must be an object")
            asset_id = raw.get("assetId")
            if not isinstance(asset_id, str) or not asset_id:
                raise ValueError(f"assets.json item {index} has no assetId")
            if asset_id in seen:
                raise ValueError(f"duplicate assetId: {asset_id}")
            seen.add(asset_id)
            asset_type = raw.get("assetType")
            if asset_type == "transformer":
                fallback_location = "Синтетическая точка измерения трансформатора"
            else:
                fallback_location = location_defaults.get(
                    str(asset_type), "Синтетическая точка измерения"
                )
            calibration = raw.get("thermalCalibration")
            if calibration is not None and not isinstance(calibration, dict):
                raise ValueError(f"invalid thermalCalibration for asset {asset_id}")
            # Non-transformer fixture rows omit this shared DTO field. 0.5 is
            # the reference fixture's neutral placeholder; these asset types
            # are not scored by the transformer thermal model.
            weight = raw.get("demoConsequenceWeight", 0.5)
            dto = Asset.model_validate(
                {
                    "assetId": asset_id,
                    "name": raw.get("name"),
                    "assetType": asset_type,
                    "siteId": raw.get("siteId"),
                    "parentId": raw.get("parentId"),
                    "measurementLocation": raw.get("measurementLocation") or fallback_location,
                    "demoConsequenceWeight": float(weight),
                    "calibration": calibration,
                }
            )
            result.append((raw, dto))
        return result

    def assets(self) -> list[Asset]:
        return [asset for _, asset in self._asset_records()]

    def sources(self) -> list[Source]:
        source_list: list[Source] = []
        source_descriptions = {
            "load": ("load_fraction", "fraction", "Доля нагрузки", 300, 900),
            "ambient": ("ambient_temperature", "degC", "Окружающая температура", 300, 900),
            "primary_a": ("contact_temperature", "degC", "Основной датчик, фаза A", 300, 900),
            "independent_a": (
                "contact_temperature",
                "degC",
                "Независимый датчик, фаза A",
                300,
                900,
            ),
            "phase_b": ("contact_temperature", "degC", "Температура, фаза B", 300, 900),
            "event": ("closing_time", "ms", "Время закрытия выключателя", None, 604800),
            "daily": (
                "relative_pd_indicator",
                "dB_ref_demo",
                "Суточный относительный индикатор ЧР",
                86400,
                172800,
            ),
        }
        for raw, asset in self._asset_records():
            origin = raw.get("origin")
            if origin not in {"synthetic", "field"}:
                raise ValueError(f"invalid origin for asset {asset.assetId}")
            if asset.assetType == "transformer":
                channels = ("load", "ambient", "primary_a", "independent_a", "phase_b")
            elif asset.assetType == "breaker":
                channels = ("event",)
            else:
                channels = ("daily",)
            for channel in channels:
                metric, unit, label, frequency, max_age = source_descriptions[channel]
                if channel == "primary_a":
                    location = str(raw.get("measurementLocation") or label)
                else:
                    location = label
                source_list.append(
                    Source.model_validate(
                        {
                            "sourceId": f"{asset.assetId}:{channel}",
                            "assetId": asset.assetId,
                            "metric": metric,
                            "unit": unit,
                            "location": location,
                            "channel": channel,
                            "frequencySeconds": frequency,
                            "maxAgeSeconds": max_age,
                            "origin": origin,
                        }
                    )
                )
        return source_list

    def observations(
        self,
        *,
        scenario_run_id: str,
        as_of: datetime,
        received_as_of: datetime,
        since: datetime | None = None,
    ) -> Iterator[Measurement]:
        """Yield eligible measurements in deterministic source-file order.

        Both clocks are enforced: an observation must be physically no later
        than ``as_of`` and must have arrived by ``received_as_of``. The SQLite
        dedup index is temporary disk state so memory stays independent of the
        number of input rows.
        """

        cutoff_event = _utc_datetime(as_of, "as_of")
        cutoff_received = _utc_datetime(received_as_of, "received_as_of")
        lower_event = _utc_datetime(since, "since") if since is not None else None
        self._begin_read()
        source_ids = {source.sourceId for source in self.sources()}
        with tempfile.TemporaryDirectory(prefix="energy-ingestion-") as scratch:
            db_path = Path(scratch) / "dedup.sqlite3"
            with sqlite3.connect(db_path) as connection:
                connection.execute("PRAGMA journal_mode=OFF")
                connection.execute("PRAGMA synchronous=OFF")
                connection.execute("PRAGMA cache_size=-2048")
                connection.execute(
                    "CREATE TABLE seen (measurement_id TEXT, source_id TEXT, event_time TEXT, "
                    "signature TEXT NOT NULL, PRIMARY KEY(measurement_id, source_id, event_time)) "
                    "WITHOUT ROWID"
                )
                for candidate in self._read_all_candidates(scenario_run_id, since=lower_event):
                    measurement = candidate.measurement
                    if (
                        measurement.eventTime > cutoff_event
                        or measurement.receivedAt > cutoff_received
                    ):
                        continue
                    if measurement.sourceId not in source_ids:
                        self._quarantine(
                            candidate.raw_record_ref,
                            "unknown_source_id",
                            candidate.raw_record,
                        )
                        continue
                    if not _dedup_candidate(connection, candidate, self._quarantine):
                        continue
                    yield measurement

    def _read_all_candidates(
        self, scenario_run_id: str, *, since: datetime | None = None
    ) -> Iterator[_Candidate]:
        assets = {asset.assetId: asset for asset in self.assets()}
        yield from self._read_transformer_candidates(scenario_run_id, assets, since=since)
        yield from self._read_breaker_candidates(scenario_run_id, assets, since=since)
        yield from self._read_cable_candidates(scenario_run_id, assets, since=since)

    def _read_transformer_candidates(
        self,
        scenario_run_id: str,
        assets: Mapping[str, Asset],
        *,
        since: datetime | None = None,
    ) -> Iterator[_Candidate]:
        path = self.observations_dir / "transformer_readings.csv.gz"
        with gzip.open(path, "rt", encoding="utf-8", newline="") as stream:
            reader = csv.DictReader(stream)
            expected_fields = {
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
            }
            if reader.fieldnames is None or not expected_fields.issubset(reader.fieldnames):
                raise ValueError("transformer_readings.csv.gz is missing required columns")
            for line_number, row in enumerate(reader, start=2):
                record_id = row.get("record_id") or ""
                asset_id = row.get("asset_id") or ""
                raw_ref = f"{path.name}#L{line_number}:{record_id or 'unknown-record'}"
                asset = assets.get(asset_id)
                try:
                    if not record_id or len(record_id) > 128:
                        raise ValueError("invalid_record_id")
                    if asset is None or asset.assetType != "transformer":
                        raise ValueError("unknown_transformer_asset")
                    event_time = _parse_time(row.get("event_time"), "event_time")
                    if since is not None and event_time < since:
                        continue
                    received_at = _parse_time(row.get("received_at"), "received_at")
                    if event_time > received_at:
                        raise ValueError("event_after_received")
                    if row.get("origin") not in {"synthetic", "field"}:
                        raise ValueError("invalid_origin")
                except ValueError as exc:
                    self._quarantine(raw_ref, str(exc), row)
                    continue

                for channel, metric, unit, value_field, quality_field in _CHANNELS:
                    candidate_ref = f"{raw_ref}:{channel}"
                    try:
                        value = _number(row.get(value_field), value_field)
                        raw_quality = row.get(quality_field)
                        if raw_quality not in _QUALITY_VALUES:
                            raise ValueError(f"invalid_quality_{quality_field}")
                        quality = "missing" if value is None else raw_quality
                        if value is not None and quality == "missing":
                            raise ValueError(f"missing_quality_has_value_{channel}")
                        measurement = Measurement.model_validate(
                            {
                                "schemaVersion": "0.1.0",
                                "measurementId": f"{record_id}:{channel}",
                                "assetId": asset_id,
                                "sourceId": f"{asset_id}:{channel}",
                                "metric": metric,
                                "eventTime": event_time,
                                "receivedAt": received_at,
                                "value": value,
                                "unit": unit,
                                "quality": quality,
                                "origin": row.get("origin"),
                                "scenarioRunId": scenario_run_id,
                            }
                        )
                    except (ValueError, ValidationError) as exc:
                        reason = (
                            _validation_reason(exc)
                            if isinstance(exc, ValidationError)
                            else str(exc)
                        )
                        self._quarantine(candidate_ref, reason, row)
                        continue
                    yield _Candidate(measurement, candidate_ref, row)

    def _read_breaker_candidates(
        self,
        scenario_run_id: str,
        assets: Mapping[str, Asset],
        *,
        since: datetime | None = None,
    ) -> Iterator[_Candidate]:
        path = self.observations_dir / "breaker_events.json"
        for index, event in enumerate(_iter_json_array(path)):
            raw_ref = f"{path.name}#/{index}"
            if not isinstance(event, dict):
                self._quarantine(raw_ref, "event_must_be_object", {"value": event})
                continue
            asset_id = event.get("assetId")
            asset = assets.get(str(asset_id))
            event_id = event.get("eventId")
            operation = event.get("operation")
            raw_ref = f"{raw_ref}:{event_id or 'unknown-event'}"
            if not event_id or not isinstance(event_id, str) or len(event_id) > 128:
                self._quarantine(raw_ref, "invalid_event_id", event)
                continue
            if asset is None or asset.assetType != "breaker":
                self._quarantine(raw_ref, "unknown_breaker_asset", event)
                continue
            if operation != "close":
                self._quarantine(raw_ref, "unsupported_breaker_operation", event)
                continue
            try:
                event_time = _parse_time(event.get("eventTime"), "event_time")
                if since is not None and event_time < since:
                    continue
                value = _number(event.get("closingTimeMs"), "closingTimeMs")
                if event.get("origin") not in {"synthetic", "field"}:
                    raise ValueError("invalid_origin")
                measurement = Measurement.model_validate(
                    {
                        "schemaVersion": "0.1.0",
                        "measurementId": f"{event_id}:{operation}",
                        "assetId": asset.assetId,
                        "sourceId": f"{asset.assetId}:event",
                        "metric": "closing_time",
                        "eventTime": event_time,
                        "receivedAt": event.get("receivedAt") or event_time,
                        "value": value,
                        "unit": event.get("unit"),
                        "quality": "good" if value is not None else "missing",
                        "origin": event.get("origin"),
                        "scenarioRunId": scenario_run_id,
                    }
                )
            except (ValueError, ValidationError) as exc:
                reason = _validation_reason(exc) if isinstance(exc, ValidationError) else str(exc)
                self._quarantine(raw_ref, reason, event)
                continue
            yield _Candidate(measurement, raw_ref, event)

    def _read_cable_candidates(
        self,
        scenario_run_id: str,
        assets: Mapping[str, Asset],
        *,
        since: datetime | None = None,
    ) -> Iterator[_Candidate]:
        path = self.observations_dir / "cable_daily_measurements.json"
        for index, sample in enumerate(_iter_json_array(path)):
            raw_ref = f"{path.name}#/{index}"
            if not isinstance(sample, dict):
                self._quarantine(raw_ref, "sample_must_be_object", {"value": sample})
                continue
            asset_id = sample.get("assetId")
            asset = assets.get(str(asset_id))
            sample_id = sample.get("sampleId")
            raw_ref = f"{raw_ref}:{sample_id or 'unknown-sample'}"
            if not sample_id or not isinstance(sample_id, str) or len(sample_id) > 128:
                self._quarantine(raw_ref, "invalid_sample_id", sample)
                continue
            if asset is None or asset.assetType != "cable":
                self._quarantine(raw_ref, "unknown_cable_asset", sample)
                continue
            if sample.get("reference") != "synthetic_device_reference_only":
                self._quarantine(raw_ref, "unsupported_cable_reference", sample)
                continue
            try:
                event_time = _parse_time(sample.get("eventTime"), "event_time")
                if since is not None and event_time < since:
                    continue
                value = _number(sample.get("relativePdIndicatorDb"), "relativePdIndicatorDb")
                if sample.get("origin") not in {"synthetic", "field"}:
                    raise ValueError("invalid_origin")
                measurement = Measurement.model_validate(
                    {
                        "schemaVersion": "0.1.0",
                        "measurementId": f"{sample_id}:relative_pd_indicator",
                        "assetId": asset.assetId,
                        "sourceId": f"{asset.assetId}:daily",
                        "metric": "relative_pd_indicator",
                        "eventTime": event_time,
                        "receivedAt": sample.get("receivedAt") or event_time,
                        "value": value,
                        "unit": sample.get("unit"),
                        "quality": "good" if value is not None else "missing",
                        "origin": sample.get("origin"),
                        "scenarioRunId": scenario_run_id,
                    }
                )
            except (ValueError, ValidationError) as exc:
                reason = _validation_reason(exc) if isinstance(exc, ValidationError) else str(exc)
                self._quarantine(raw_ref, reason, sample)
                continue
            yield _Candidate(measurement, raw_ref, sample)

    def transport_fault_observations(
        self,
        *,
        scenario_run_id: str | None = None,
        as_of: datetime | None = None,
        received_as_of: datetime | None = None,
    ) -> Iterator[Measurement]:
        """Parse the normalized JSONL transport fixture and deduplicate packets.

        This test/replay fixture has 33 packets for 30 measurement identities.
        Its existing measurement IDs and received timestamps are retained;
        legacy source IDs from the fixture are mapped to canonical channel IDs.
        """

        fixture_path = self.observations_dir / "transport_fault_examples.jsonl"
        cutoff_event = _utc_datetime(as_of, "as_of") if as_of is not None else None
        cutoff_received = (
            _utc_datetime(received_as_of, "received_as_of") if received_as_of is not None else None
        )
        self._begin_read()
        seen: dict[tuple[str, str, datetime], str] = {}
        with fixture_path.open(encoding="utf-8") as stream:
            for line_number, line in enumerate(stream, start=1):
                raw_ref = f"{fixture_path.name}#L{line_number}"
                raw: object = {"line": line.rstrip("\n")}
                try:
                    raw = json.loads(line)
                    if not isinstance(raw, dict):
                        raise ValueError("record_must_be_object")
                    asset_id = raw.get("assetId")
                    raw_source_id = raw.get("sourceId")
                    if not isinstance(asset_id, str) or not isinstance(raw_source_id, str):
                        raise ValueError("missing_asset_or_source_id")
                    channel = _canonical_channel(asset_id, raw_source_id)
                    if channel is None:
                        raise ValueError("unknown_source_id")
                    source_id = f"{asset_id}:{channel}"
                    if scenario_run_id is not None:
                        raw["scenarioRunId"] = scenario_run_id
                    if raw.get("value") is not None:
                        raw["value"] = _number(raw["value"], "value")
                    raw["sourceId"] = source_id
                    measurement = Measurement.model_validate(raw)
                except (json.JSONDecodeError, ValueError, ValidationError) as exc:
                    if isinstance(exc, ValidationError):
                        reason = _validation_reason(exc)
                    else:
                        reason = str(exc)
                    quarantined_raw = raw if isinstance(raw, dict) else {"line": line.rstrip("\n")}
                    self._quarantine(raw_ref, reason, quarantined_raw)
                    continue

                if cutoff_event is not None and measurement.eventTime > cutoff_event:
                    continue
                if cutoff_received is not None and measurement.receivedAt > cutoff_received:
                    continue
                key = (measurement.measurementId, measurement.sourceId, measurement.eventTime)
                signature = _measurement_signature(measurement)
                previous_signature = seen.get(key)
                if previous_signature is not None:
                    if previous_signature != signature:
                        self._quarantine(raw_ref, "duplicate_identity_conflict", raw)
                    continue
                seen[key] = signature
                yield measurement


def _canonical_channel(asset_id: str, source_id: str) -> str | None:
    for suffix, channel in _CHANNEL_BY_LEGACY_SUFFIX.items():
        if source_id == asset_id + suffix:
            return channel
    return None


def _iter_json_array(path: Path, *, chunk_size: int = 8192) -> Iterator[object]:
    """Decode a top-level JSON array incrementally with bounded buffering."""

    decoder = json.JSONDecoder()
    with path.open(encoding="utf-8") as stream:
        buffer = ""
        cursor = 0
        eof = False

        def fill() -> bool:
            nonlocal buffer, eof
            chunk = stream.read(chunk_size)
            if chunk:
                buffer += chunk
                return True
            eof = True
            return False

        while cursor >= len(buffer) and not eof:
            fill()
        while cursor < len(buffer) and buffer[cursor].isspace():
            cursor += 1
        if cursor >= len(buffer) or buffer[cursor] != "[":
            raise ValueError(f"{path.name} must contain a JSON array")
        cursor += 1
        first = True
        expect_value = True

        while True:
            while cursor >= len(buffer) and not eof:
                fill()
            while cursor < len(buffer) and buffer[cursor].isspace():
                cursor += 1
            if cursor >= len(buffer):
                raise ValueError(f"unterminated JSON array in {path.name}")

            if expect_value:
                if buffer[cursor] == "]":
                    if not first:
                        raise ValueError(f"trailing comma in {path.name}")
                    cursor += 1
                    break
                try:
                    item, end = decoder.raw_decode(buffer, cursor)
                except json.JSONDecodeError as exc:
                    if not eof and fill():
                        continue
                    raise ValueError(f"invalid JSON array item in {path.name}") from exc
                cursor = end
                first = False
                expect_value = False
                yield item
            else:
                if buffer[cursor] == ",":
                    cursor += 1
                    expect_value = True
                elif buffer[cursor] == "]":
                    cursor += 1
                    break
                else:
                    raise ValueError(f"expected comma or closing bracket in {path.name}")

            if cursor > chunk_size:
                buffer = buffer[cursor:]
                cursor = 0

        while cursor >= len(buffer) and not eof:
            fill()
        if any(not char.isspace() for char in buffer[cursor:]):
            raise ValueError(f"unexpected content after JSON array in {path.name}")
        while not eof:
            trailing = stream.read(chunk_size)
            if not trailing:
                eof = True
            elif any(not char.isspace() for char in trailing):
                raise ValueError(f"unexpected content after JSON array in {path.name}")


def _measurement_signature(measurement: Measurement) -> str:
    semantic_fields = {
        "assetId": measurement.assetId,
        "metric": measurement.metric,
        "value": measurement.value,
        "unit": measurement.unit,
        "quality": measurement.quality,
        "origin": measurement.origin,
        "scenarioRunId": measurement.scenarioRunId,
    }
    serialized = json.dumps(semantic_fields, sort_keys=True, separators=(",", ":"), allow_nan=False)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _dedup_candidate(
    connection: sqlite3.Connection,
    candidate: _Candidate,
    quarantine: Callable[[str, str, Mapping[str, object]], None],
) -> bool:
    measurement = candidate.measurement
    signature = _measurement_signature(measurement)
    key = (measurement.measurementId, measurement.sourceId, measurement.eventTime.isoformat())
    cursor = connection.execute("INSERT OR IGNORE INTO seen VALUES (?, ?, ?, ?)", (*key, signature))
    if cursor.rowcount == 1:
        return True
    previous = connection.execute(
        "SELECT signature FROM seen WHERE measurement_id=? AND source_id=? AND event_time=?",
        key,
    ).fetchone()
    if previous is not None and previous[0] != signature:
        quarantine(candidate.raw_record_ref, "duplicate_identity_conflict", candidate.raw_record)
    return False
