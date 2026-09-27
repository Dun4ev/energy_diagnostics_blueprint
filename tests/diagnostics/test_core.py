from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from packages.diagnostics import DeterministicAnalyzer
from packages.domain_contracts.models import Asset, DiagnosticPolicy, Measurement

START = datetime(2026, 1, 1, tzinfo=timezone.utc)
POLICY = DiagnosticPolicy.model_validate_json(
    (Path(__file__).parents[2] / "config/diagnostic-policy.demo.json").read_text()
)
ASSET = Asset(
    assetId="asset-a", name="Synthetic contact", assetType="transformer", siteId="site",
    parentId=None, measurementLocation="phase A contact", demoConsequenceWeight=0.6,
    calibration={"aC": 4.0, "bC": 60.0, "tauHours": 2.0},
)


def readings(
    *, asset: Asset = ASSET, hours: int = 100, slope: float = 0,
    load_step: bool = False, spike: bool = False, drift: bool = False,
    stuck: bool = False,
) -> list[Measurement]:
    result = []
    thermal = None
    for n in range(hours + 1):
        when = START + timedelta(hours=n)
        load = 0.6 if n < 40 or not load_step else 0.8
        ambient = 20.0 if n < 40 or not load_step else 25.0
        target = 4 + 60 * load**2
        thermal = target if thermal is None else thermal + (1 - math.exp(-0.5)) * (target - thermal)
        baseline = ambient + thermal
        offset = slope * n / 24
        independent = baseline + offset
        primary = independent + (10 if drift and n >= 90 else 0)
        if spike and n == 65:
            primary += 35
        if stuck and n >= 96:
            primary = baseline - 10
            independent = baseline - 10 + 3 * (n - 96)
        values = {
            "load": ("load_fraction", "fraction", load),
            "ambient": ("ambient_temperature", "degC", ambient),
            "primary_a": ("contact_temperature", "degC", primary),
            "independent_a": ("contact_temperature", "degC", independent),
            "phase_b": ("contact_temperature", "degC", baseline - 1),
        }
        for channel, (metric, unit, value) in values.items():
            result.append(Measurement(
                schemaVersion="0.1.0", measurementId=f"{asset.assetId}-{n}-{channel}",
                assetId=asset.assetId, sourceId=f"{asset.assetId}:{channel}", metric=metric,
                eventTime=when, receivedAt=when + timedelta(seconds=1), value=float(value),
                unit=unit, quality="good", origin="synthetic", scenarioRunId="run-1",
            ))
    return result


def evaluate(items, *, asset=ASSET, as_of=START + timedelta(hours=100, seconds=2)):
    return DeterministicAnalyzer().analyze_series(
        items, asset, POLICY, as_of=as_of, received_as_of=as_of
    )


def test_exact_recurrence_units_and_linear_residual_trends():
    bundle, series = evaluate(readings(slope=0.5, load_step=True))
    analysis = bundle.analysis
    last = series[-1]
    assert last.residualC == pytest.approx(0.5 * 100 / 24, abs=1e-6)
    assert last.expectedC == pytest.approx(last.observedC - last.residualC, abs=1e-6)
    assert analysis.metrics.failureProbability is None
    assert analysis.metrics.slopeCPerDay == pytest.approx(0.5, abs=1e-6)
    assert {t.windowHours: t.slopeCPerDay for t in bundle.details.trends} == pytest.approx(
        {24: 0.5, 72: 0.5}, abs=1e-6
    )
    assert all(p.residualC is None for p in series[:10])
    assert series[10].residualC is not None


def test_normal_load_step_does_not_create_heat_signal():
    bundle, series = evaluate(readings(load_step=True))
    assert series[-1].residualC == pytest.approx(0, abs=1e-6)
    assert bundle.analysis.status == "normal"
    assert bundle.analysis.metrics.slopeCPerDay == pytest.approx(0, abs=1e-6)
    assert not bundle.analysis.hypotheses


def test_disagreement_and_stuck_are_unconfirmed_sensor_issues():
    drift, _ = evaluate(readings(drift=True))
    assert drift.analysis.status == "insufficient_data"
    assert drift.analysis.risk.score is None
    assert drift.analysis.hypotheses[0].code == "SENSOR_DISAGREEMENT"
    assert drift.details.counterEvidenceIds
    stuck, _ = evaluate(readings(stuck=True))
    assert stuck.analysis.risk.score is None
    assert any("неизменен" in issue for issue in stuck.analysis.quality.issues)


def test_one_spike_does_not_distort_robust_trend():
    baseline, _ = evaluate(readings(slope=0.5))
    spike, series = evaluate(readings(slope=0.5, spike=True))
    assert abs(spike.analysis.metrics.slopeCPerDay - baseline.analysis.metrics.slopeCPerDay) < 0.2
    assert any(p.observedC is not None and p.observedC > 80 and p.quality == "suspect" for p in series)


def test_missing_stale_short_window_and_unsupported_are_unknown():
    short, _ = evaluate(readings(hours=15), as_of=START + timedelta(hours=15, seconds=2))
    assert short.analysis.risk.score is None
    assert short.details.trends[-1].reason
    stale, _ = evaluate(readings(), as_of=START + timedelta(hours=101))
    assert stale.analysis.risk.score is None
    assert stale.analysis.risk.priority == "unknown"
    breaker = ASSET.model_copy(update={"assetType": "breaker", "calibration": None})
    unsupported, _ = evaluate(readings(asset=breaker), asset=breaker)
    assert unsupported.details.methodStatus == "unsupported"
    assert unsupported.analysis.risk.score is None


def test_warmup_and_low_coverage_do_not_produce_a_score():
    warming, _ = evaluate(readings(hours=5), as_of=START + timedelta(hours=5, seconds=2))
    assert warming.details.methodStatus == "warm_up"
    assert warming.analysis.risk.score is None
    sparse = [
        m for m in readings()
        if m.sourceId != f"{ASSET.assetId}:primary_a"
        or int((m.eventTime - START).total_seconds() // 3600) < 28
        or int((m.eventTime - START).total_seconds() // 3600) % 4 == 0
    ]
    bundle, _ = evaluate(sparse)
    assert bundle.details.trends[-1].coverage < POLICY.quality.minimumWindowCoverage
    assert bundle.analysis.risk.score is None


def test_future_and_late_delivery_do_not_change_snapshot():
    items = readings()
    base, _ = evaluate(items)
    future = items[-1].model_copy(update={
        "measurementId": "future", "eventTime": START + timedelta(hours=101),
        "receivedAt": START + timedelta(hours=101, seconds=1),
    })
    late = items[-1].model_copy(update={
        "measurementId": "late", "eventTime": START + timedelta(hours=99),
        "receivedAt": START + timedelta(hours=101),
    })
    modified, _ = evaluate(items + [future, late])
    assert modified == base


def test_asset_name_and_scenario_do_not_select_diagnosis():
    items = readings(slope=1.0)
    first, _ = evaluate(items)
    other = ASSET.model_copy(update={"assetId": "different", "name": "alarming scenario"})
    changed = [m.model_copy(update={
        "assetId": other.assetId,
        "sourceId": m.sourceId.replace(ASSET.assetId + ":", other.assetId + ":"),
        "measurementId": m.measurementId.replace(ASSET.assetId, other.assetId),
    }) for m in items]
    second, _ = evaluate(changed, asset=other)
    assert first.analysis.metrics == second.analysis.metrics
    assert first.analysis.risk == second.analysis.risk
    assert first.analysis.status == second.analysis.status
    assert first.analysis.quality.issues == second.analysis.quality.issues
