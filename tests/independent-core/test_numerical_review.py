"""Independent black-box checks against the frozen numerical acceptance criteria.

No truth/ fixture or production implementation module is imported by these tests.
"""

from __future__ import annotations

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
    assetId="blind-transformer", name="Independent synthetic", assetType="transformer",
    siteId="review", parentId=None, measurementLocation="contact A",
    demoConsequenceWeight=0.5, calibration={"aC": 4.0, "bC": 60.0, "tauHours": 2.0},
)
BASELINE = 20.0 + 4.0 + 60.0 * 0.6**2


def samples(hours=80, *, high_at: set[int] | None = None,
            run_id="qa-run", asset=ASSET, omit_primary: set[int] | None = None,
            slope=0.0):
    """Exact constant-load synthetic readings with independent channel."""
    high_at = high_at or set()
    omit_primary = omit_primary or set()
    result = []
    channels = {
        "load": ("load_fraction", "fraction", 0.6),
        "ambient": ("ambient_temperature", "degC", 20.0),
        "primary_a": ("contact_temperature", "degC", BASELINE),
        "independent_a": ("contact_temperature", "degC", BASELINE),
        "phase_b": ("contact_temperature", "degC", BASELINE - 1.0),
    }
    for hour in range(hours + 1):
        when = START + timedelta(hours=hour)
        for channel, (metric, unit, base) in channels.items():
            if channel == "primary_a" and hour in omit_primary:
                continue
            offset = slope * hour / 24 if channel in {"primary_a", "independent_a"} else 0.0
            value = base + offset + (10.0 if hour in high_at and channel in {
                "primary_a", "independent_a"} else 0.0)
            result.append(Measurement(
                schemaVersion="0.1.0", measurementId=f"{run_id}-{asset.assetId}-{hour}-{channel}",
                assetId=asset.assetId, sourceId=f"{asset.assetId}:{channel}",
                metric=metric, eventTime=when, receivedAt=when + timedelta(seconds=1),
                value=float(value), unit=unit, quality="good", origin="synthetic",
                scenarioRunId=run_id,
            ))
    return result


def evaluate(observations, *, at=START + timedelta(hours=80, seconds=2),
             asset=ASSET, policy=POLICY, received=None, scenario_run_id=None):
    options = {"scenario_run_id": scenario_run_id} if scenario_run_id else {}
    return DeterministicAnalyzer().analyze_series(
        observations, asset, policy, as_of=at, received_as_of=received or at, **options
    )


def test_exact_baseline_warmup_and_unsupported_types():
    full, points = evaluate(samples())
    assert points[0].residualC is None
    assert points[9].residualC is None
    assert points[10].expectedC == pytest.approx(BASELINE, abs=1e-6)
    assert points[10].residualC == pytest.approx(0.0, abs=1e-6)
    assert full.analysis.metrics.failureProbability is None
    assert full.analysis.risk.probabilistic is False
    assert full.analysis.status == "normal"
    warm, _ = evaluate(samples(hours=9), at=START + timedelta(hours=9, seconds=2))
    assert warm.details.methodStatus == "warm_up"
    assert warm.analysis.risk.score is None
    for kind in ("breaker", "cable"):
        unsupported_asset = ASSET.model_copy(update={"assetType": kind, "calibration": None})
        unsupported, _ = evaluate(samples(asset=unsupported_asset), asset=unsupported_asset)
        assert unsupported.details.methodStatus == "unsupported"
        assert unsupported.analysis.risk.priority == "unknown"


def test_coverage_sensor_exclusion_and_future_late_filter():
    observations = samples()
    base, _ = evaluate(observations)
    sparse = samples(omit_primary={n for n in range(11, 80) if n % 4 != 0})
    low_coverage, _ = evaluate(sparse)
    assert low_coverage.analysis.quality.coverage < 0.8
    assert low_coverage.analysis.risk.score is None
    assert low_coverage.analysis.risk.priority == "unknown"
    shifted = [m.model_copy(update={"value": m.value + 12.0})
               if m.sourceId.endswith(":primary_a") and m.eventTime == START + timedelta(hours=80)
               else m for m in observations]
    disputed, points = evaluate(shifted)
    assert points[-1].observedC == pytest.approx(BASELINE + 12.0)
    assert points[-1].residualC is None
    assert points[-1].quality == "suspect"
    assert disputed.analysis.risk.score is None
    assert disputed.analysis.hypotheses[0].code == "SENSOR_DISAGREEMENT"
    future = observations[-1].model_copy(update={
        "measurementId": "future", "eventTime": START + timedelta(hours=81),
        "receivedAt": START + timedelta(hours=81, seconds=1),
    })
    late = observations[-1].model_copy(update={
        "measurementId": "late", "eventTime": START + timedelta(hours=79),
        "receivedAt": START + timedelta(hours=81),
    })
    unchanged, _ = evaluate(observations + [future, late])
    assert unchanged.analysis.inputSnapshotId == base.analysis.inputSnapshotId
    assert unchanged.details.inputSnapshotHash == base.details.inputSnapshotHash
    assert unchanged.analysis.metrics == base.analysis.metrics


def test_exact_linear_residual_trend_and_recovery_without_auto_close():
    linear, points = evaluate(samples(slope=0.5))
    assert points[-1].residualC == pytest.approx(0.5 * 80 / 24, abs=1e-6)
    assert linear.analysis.metrics.slopeCPerDay == pytest.approx(0.5, abs=1e-6)
    assert {trend.windowHours: trend.slopeCPerDay for trend in linear.details.trends} == pytest.approx(
        {24: 0.5, 72: 0.5}, abs=1e-6
    )
    observations = samples()
    sequence = 0

    def add(when, residual):
        nonlocal sequence
        sequence += 1
        for channel, metric, unit, value in (
            ("load", "load_fraction", "fraction", 0.6),
            ("ambient", "ambient_temperature", "degC", 20.0),
            ("primary_a", "contact_temperature", "degC", BASELINE + residual),
            ("independent_a", "contact_temperature", "degC", BASELINE + residual),
            ("phase_b", "contact_temperature", "degC", BASELINE - 1.0),
        ):
            observations.append(Measurement(
                schemaVersion="0.1.0", measurementId=f"extra-{sequence}-{channel}",
                assetId=ASSET.assetId, sourceId=f"{ASSET.assetId}:{channel}",
                metric=metric, eventTime=when, receivedAt=when + timedelta(seconds=1),
                value=float(value), unit=unit, quality="good", origin="synthetic",
                scenarioRunId="qa-run",
            ))

    for minute in range(5, 70, 5):
        add(START + timedelta(hours=80, minutes=minute), 10.0)
    hot_at = START + timedelta(hours=81, minutes=5, seconds=2)
    hot, _ = evaluate(observations, at=hot_at)
    assert hot.details.persistenceMinutes >= POLICY.detection.persistMinutes
    assert hot.analysis.status == "requires_review"
    for minute in range(70, 255, 5):
        add(START + timedelta(hours=80, minutes=minute), 0.0)
    recovered_at = START + timedelta(hours=84, minutes=10, seconds=2)
    recovered, _ = evaluate(observations, at=recovered_at)
    assert recovered.analysis.metrics.residualC == pytest.approx(0.0, abs=1e-6)
    assert recovered.analysis.status == "normal"
    assert recovered.analysis.risk.score is not None


def test_analysis_identity_changes_when_freshness_changes_without_new_observations():
    observations = samples()
    fresh, _ = evaluate(observations)
    stale, _ = evaluate(observations, at=START + timedelta(hours=80, minutes=11))
    assert fresh.analysis.risk.score is not None
    assert stale.analysis.risk.score is None
    assert fresh.details.inputSnapshotHash == stale.details.inputSnapshotHash
    assert fresh.analysis.analysisRunId != stale.analysis.analysisRunId


def test_one_high_sample_does_not_latch_review_before_persistence():
    transient, _ = evaluate(samples(high_at={80}))
    assert transient.details.persistenceMinutes == 0.0
    assert transient.analysis.status == "normal"


def test_empty_assets_do_not_share_analysis_identity():
    other_asset = ASSET.model_copy(update={"assetId": "another-transformer"})
    first, _ = evaluate([], scenario_run_id="qa-empty")
    second, _ = evaluate([], asset=other_asset, scenario_run_id="qa-empty")
    assert first.analysis.risk.priority == second.analysis.risk.priority == "unknown"
    assert first.analysis.scenarioRunId == second.analysis.scenarioRunId == "qa-empty"
    assert first.analysis.analysisRunId != second.analysis.analysisRunId


def test_analysis_identity_tracks_policy_calibration_and_run_context():
    observations = samples()
    base, _ = evaluate(observations, scenario_run_id="qa-run")
    changed_policy = POLICY.model_copy(update={"version": "independent-policy-revision"})
    policy_result, _ = evaluate(observations, policy=changed_policy, scenario_run_id="qa-run")
    changed_asset = ASSET.model_copy(update={
        "calibration": ASSET.calibration.model_copy(update={"bC": 61.0})
    })
    asset_result, _ = evaluate(observations, asset=changed_asset, scenario_run_id="qa-run")
    assert base.details.inputSnapshotHash == policy_result.details.inputSnapshotHash
    assert base.details.inputSnapshotHash == asset_result.details.inputSnapshotHash
    assert len({base.analysis.analysisRunId, policy_result.analysis.analysisRunId,
                asset_result.analysis.analysisRunId}) == 3
    with pytest.raises(ValueError, match="scenario_run_id"):
        evaluate(observations, scenario_run_id="wrong-run")


def test_disputed_midpoint_breaks_sixty_minute_persistence():
    observations = samples()
    for minute in range(5, 70, 5):
        when = START + timedelta(hours=80, minutes=minute)
        for channel, metric, unit, value in (
            ("load", "load_fraction", "fraction", 0.6),
            ("ambient", "ambient_temperature", "degC", 20.0),
            ("primary_a", "contact_temperature", "degC", BASELINE + 10.0),
            # At one midpoint the independent channel disputes the primary.
            ("independent_a", "contact_temperature", "degC",
             BASELINE if minute == 35 else BASELINE + 10.0),
            ("phase_b", "contact_temperature", "degC", BASELINE - 1.0),
        ):
            observations.append(Measurement(
                schemaVersion="0.1.0", measurementId=f"disputed-{minute}-{channel}",
                assetId=ASSET.assetId, sourceId=f"{ASSET.assetId}:{channel}",
                metric=metric, eventTime=when, receivedAt=when + timedelta(seconds=1),
                value=float(value), unit=unit, quality="good", origin="synthetic",
                scenarioRunId="qa-run",
            ))
    reviewed, points = evaluate(observations, at=START + timedelta(hours=81, minutes=5, seconds=2))
    midpoint = next(p for p in points if p.eventTime == START + timedelta(hours=80, minutes=35))
    assert midpoint.quality == "suspect" and midpoint.residualC is None
    assert reviewed.details.persistenceMinutes < POLICY.detection.persistMinutes
    assert reviewed.analysis.status == "normal"
